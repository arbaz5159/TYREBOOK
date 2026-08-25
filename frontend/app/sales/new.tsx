// Multi-tyre New Sale / Bill screen (v2).
//
// Supports MULTIPLE different tyres per bill via `items[]`. On save, one
// Sale document is written that contains every item, and every linked
// tyre's stock is decremented safely inside a single Firestore
// transaction (see `createMultiSale` in src/firebase/sales.ts).
//
// If a `tyreId` route param is passed (Dashboard search → tap), the
// first item is pre-populated from that tyre's inventory row.
//
// Bill types:
//   * "Tax Invoice"  → GST calc (existing settings)
//   * "Kacha Bill"   → Sale Receipt, no GST
//
// Legacy top-level Sale fields (brand/model/size/quantity/sellingPrice
// /totalValue) are still populated by `createMultiSale` (from item[0]
// and aggregated totals) so the existing billing list, reports and PDF
// paths keep rendering without changes.

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppTextField } from "@/src/components/AppTextField";
import { ChipRow } from "@/src/components/ChipRow";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import {
  CUSTOMER_TYPES,
  PAYMENT_MODES,
  TYRE_CLASSES,
  type CustomerType,
  type PaymentMode,
  type SaleItem,
  type TyreClass,
  type VehicleCategoryId,
} from "@/src/constants/inventory";
import { createMultiSale } from "@/src/firebase/sales";
import { getTyre, listTyres } from "@/src/firebase/inventory";
import { getShopSettings, reserveInvoiceNumber } from "@/src/firebase/master";
import { addKhataEntry } from "@/src/firebase/khata";
import { generateAndShareInvoice } from "@/src/utils/invoicePdf";
import { getPricingConfig, type PricingConfig } from "@/src/utils/settings";
import { usePermissions } from "@/src/hooks/usePermissions";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

const GST_OPTIONS = [0, 5, 12, 18, 28];
type BillKind = "Tax Invoice" | "Kacha Bill";
const BILL_KINDS: { value: BillKind; label: string; hint: string }[] = [
  { value: "Tax Invoice", label: "GST Invoice", hint: "With GST · HSN · CGST/SGST/IGST" },
  { value: "Kacha Bill", label: "Sale Receipt", hint: "Cash Memo · No GST" },
];

interface ItemDraft {
  brand: string;
  model: string;
  size: string;
  quantity: string;
  sellingPrice: string;
  priceList: string;
  discountPercent: string;
  linkedTyreId?: string;
  availableStock?: number;
  // Category auto-read from the matched inventory tyre — never picked
  // manually by the user. Falls back to the last known bill category if
  // the typed brand/model/size doesn't match any tyre in stock.
  matchedCategoryId?: VehicleCategoryId;
}

function blankItem(): ItemDraft {
  return {
    brand: "",
    model: "",
    size: "",
    quantity: "",
    sellingPrice: "",
    priceList: "",
    discountPercent: "0",
  };
}

export default function NewSale() {
  const router = useRouter();
  const perms = usePermissions();
  const params = useLocalSearchParams<{ tyreId?: string }>();

  // Customer + bill-level state.
  const [customerName, setCustomer] = useState("");
  const [mobileNumber, setMobile] = useState("");
  const [vehicleNumber, setVehicle] = useState("");
  const [customerGstin, setCustomerGstin] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerStateCode, setCustomerStateCode] = useState("");
  const [customerType, setCustomerType] = useState<CustomerType>("Retail");
  // Hidden fallback category — never shown to the user. Each item's
  // categoryId is auto-read from the matched inventory tyre and stored
  // per-item; this fallback is used ONLY when a user typed a
  // brand/model/size that doesn't match ANY row in `shops/{shopId}/tyres`.
  const [fallbackCategory, setFallbackCategory] = useState<VehicleCategoryId>("car");
  const [tyreClass, setTyreClass] = useState<TyreClass>("new");
  const [gstPercent, setGst] = useState<number>(18);
  const [paymentMode, setPayment] = useState<PaymentMode>("Cash");
  const [billKind, setBillKind] = useState<BillKind>("Tax Invoice");

  // Items list.
  const [items, setItems] = useState<ItemDraft[]>([blankItem()]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warns, setWarns] = useState<string[]>([]);
  const [pricingCfg, setPricingCfg] = useState<PricingConfig | null>(null);
  const isKacha = billKind === "Kacha Bill";

  // Load pricing config + tyre-from-route once.
  useEffect(() => {
    (async () => {
      const cfg = await getPricingConfig();
      setPricingCfg(cfg);
      setGst(cfg.defaultGstPercent);
    })();
  }, []);

  useEffect(() => {
    const tyreId = params.tyreId ? String(params.tyreId) : "";
    if (!tyreId) return;
    (async () => {
      const t = await getTyre(tyreId);
      if (!t) return;
      // Category is auto-read from the matched tyre — never a manual pick.
      setFallbackCategory(t.categoryId);
      setTyreClass((t.tyreClass ?? "new") as TyreClass);
      setItems([
        {
          brand: t.brand ?? "",
          model: t.model ?? "",
          size: t.size ?? "",
          quantity: "1",
          sellingPrice: String(t.sellingPrice ?? ""),
          priceList: String(t.companyPriceList ?? t.mrp ?? ""),
          discountPercent: "0",
          linkedTyreId: t.id,
          availableStock: t.currentStock ?? 0,
          matchedCategoryId: t.categoryId,
        },
      ]);
    })();
  }, [params.tyreId]);

  const updateItem = (idx: number, patch: Partial<ItemDraft>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const removeItem = (idx: number) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const addItem = () => {
    setItems((prev) => [...prev, blankItem()]);
  };

  // Match an exact tyre in current shop inventory by Brand + Model + Size,
  // searching across ALL categories (Vehicle Category is auto-read from the
  // matched tyre, not picked manually). Case-insensitive, whitespace-tolerant.
  const linkItemToStock = async (idx: number) => {
    const item = items[idx];
    if (!item.brand.trim() || !item.model.trim() || !item.size.trim()) return;
    if (item.linkedTyreId) return; // already linked
    try {
      const list = await listTyres(); // no category filter — search whole shop
      const nb = item.brand.trim().toLowerCase();
      const nm = item.model.trim().toLowerCase();
      const ns = item.size.trim().toLowerCase();
      const t = list.find(
        (x) =>
          (x.brand ?? "").trim().toLowerCase() === nb &&
          (x.model ?? "").trim().toLowerCase() === nm &&
          (x.size ?? "").trim().toLowerCase() === ns,
      );
      if (t) {
        updateItem(idx, {
          linkedTyreId: t.id,
          availableStock: t.currentStock ?? 0,
          matchedCategoryId: t.categoryId,
          sellingPrice: item.sellingPrice || String(t.sellingPrice ?? ""),
          priceList: item.priceList || String(t.companyPriceList ?? t.mrp ?? ""),
        });
        // Also update the hidden fallback so subsequent unmatched items
        // inherit the "hot" category of this bill.
        setFallbackCategory(t.categoryId);
      }
    } catch (e) {
      console.warn("[sale] linkItemToStock failed (non-fatal):", e);
    }
  };

  // Per-line + grand totals (recomputed on every render — cheap).
  const computed = useMemo(() => {
    const lines = items.map((it) => {
      const qty = Number(it.quantity) || 0;
      const list = Number(it.priceList) || 0;
      const discPct = Number(it.discountPercent) || 0;
      const explicitPrice = Number(it.sellingPrice) || 0;
      const discountAmount = list > 0 ? +(list * (discPct / 100)).toFixed(2) : 0;
      const unitPrice = list > 0 ? +(list - discountAmount).toFixed(2) : explicitPrice;
      const taxable = +(qty * unitPrice).toFixed(2);
      const effectiveGst = isKacha ? 0 : gstPercent;
      const totalGst = +((taxable * effectiveGst) / 100).toFixed(2);
      const lineTotal = +(taxable + totalGst).toFixed(2);
      return { qty, unitPrice, list, discPct, discountAmount, taxable, totalGst, lineTotal };
    });
    const subtotal = +lines.reduce((s, l) => s + l.taxable, 0).toFixed(2);
    const gstTotal = +lines.reduce((s, l) => s + l.totalGst, 0).toFixed(2);
    const grandTotal = +(subtotal + gstTotal).toFixed(2);
    return { lines, subtotal, gstTotal, grandTotal };
  }, [items, isKacha, gstPercent]);

  const onSave = async () => {
    setErr(null);
    setWarns([]);
    if (!customerName.trim()) {
      setErr("Customer name is required.");
      return;
    }
    // Basic per-item validation.
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.brand.trim() || !it.model.trim() || !it.size.trim()) {
        setErr(`Item ${i + 1}: Brand, Model and Size are required.`);
        return;
      }
      const qty = Number(it.quantity) || 0;
      if (qty <= 0) {
        setErr(`Item ${i + 1}: Quantity must be greater than zero.`);
        return;
      }
      if (
        typeof it.availableStock === "number" &&
        qty > it.availableStock
      ) {
        setErr(
          `Item ${i + 1}: Selling ${qty} but only ${it.availableStock} in stock.`,
        );
        return;
      }
      const unit = computed.lines[i].unitPrice;
      if (unit <= 0) {
        setErr(`Item ${i + 1}: Selling price must be greater than zero.`);
        return;
      }
    }
    setSaving(true);
    try {
      const saleDate = Date.now();
      const shopSnapshot = await getShopSettings();
      const shopStateCode = (shopSnapshot.stateCode || "").trim();
      const custStateCode = customerStateCode.trim() || shopStateCode;
      const interstate = Boolean(shopStateCode && custStateCode && custStateCode !== shopStateCode);
      const hsn = shopSnapshot.hsnCode || "4011";

      // Reserve ONE invoice number for the whole bill.
      const { number: invoiceNumber } = await reserveInvoiceNumber(billKind);

      // Build SaleItem[] for persistence.
      const saleItems: SaleItem[] = items.map((it, i) => {
        const line = computed.lines[i];
        const cat = it.matchedCategoryId ?? fallbackCategory;
        // Build the item WITHOUT `linkedTyreId` first, then only attach
        // it if it actually resolved to an inventory row. This prevents
        // any `undefined` from leaking through to Firestore.
        const base: SaleItem = {
          categoryId: cat,
          tyreClass,
          brand: it.brand.trim(),
          model: it.model.trim(),
          size: it.size.trim(),
          quantity: line.qty,
          priceList: line.list,
          discountPercent: line.discPct,
          discountAmount: line.discountAmount,
          sellingPrice: line.unitPrice,
          gstPercent: isKacha ? 0 : gstPercent,
          taxable: line.taxable,
          totalGst: line.totalGst,
          lineTotal: line.lineTotal,
        };
        if (it.linkedTyreId) base.linkedTyreId = it.linkedTyreId;
        return base;
      });

      // Bill-level (legacy) category = first matched item's category, or
      // the running fallback. Never `undefined` on the wire.
      const billCategory: VehicleCategoryId =
        items.find((it) => it.matchedCategoryId)?.matchedCategoryId ?? fallbackCategory;

      const res = await createMultiSale({
        customerName: customerName.trim(),
        mobileNumber: mobileNumber.trim(),
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        customerType,
        date: saleDate,
        paymentMode,
        invoiceKind: billKind,
        invoiceNumber,
        hsnCode: hsn,
        customerGstin: customerGstin.trim().toUpperCase() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        customerStateCode: custStateCode || undefined,
        shopStateCode: shopStateCode || undefined,
        isInterstate: interstate,
        items: saleItems,
      });

      const grandTotal = computed.grandTotal;

      // KhataBook entry (best-effort).
      if (paymentMode === "Credit" && mobileNumber.trim()) {
        try {
          await addKhataEntry({
            customerId: mobileNumber.trim(),
            customerName: customerName.trim(),
            direction: "credit",
            amount: grandTotal,
            note:
              saleItems.length === 1
                ? `Sale ${saleItems[0].brand} ${saleItems[0].model} ${saleItems[0].size}`
                : `Sale · ${saleItems.length} items`,
            reference: invoiceNumber,
            date: saleDate,
          });
        } catch (khataErr) {
          console.warn("[sale] KhataBook entry failed (sale still saved):", khataErr);
        }
      }

      // Fire-and-forget PDF share. Uses aggregated top-level fields;
      // buildKachaBillHtml / buildGstInvoiceHtml pick up items[] via the
      // sale object we pass through.
      try {
        const first = saleItems[0];
        generateAndShareInvoice({
          invoiceType: billKind,
          invoiceNumber,
          sale: {
            id: res.id,
            customerName: customerName.trim(),
            mobileNumber: mobileNumber.trim(),
            vehicleNumber: vehicleNumber.trim().toUpperCase(),
            customerType,
            date: saleDate,
            categoryId: billCategory,
            tyreClass,
            brand: first.brand,
            model: first.model,
            size: first.size,
            quantity: saleItems.reduce((s, i) => s + i.quantity, 0),
            priceList: first.priceList,
            discountPercent: first.discountPercent,
            discountAmount: first.discountAmount,
            sellingPrice: first.sellingPrice,
            gstPercent: isKacha ? 0 : gstPercent,
            paymentMode,
            totalValue: grandTotal,
            createdAt: saleDate,
            invoiceKind: billKind,
            invoiceNumber,
            hsnCode: hsn,
            customerGstin: customerGstin.trim().toUpperCase() || undefined,
            customerAddress: customerAddress.trim() || undefined,
            customerStateCode: custStateCode || undefined,
            shopStateCode: shopStateCode || undefined,
            isInterstate: interstate,
            items: saleItems,
            cgstAmount: interstate ? 0 : +(computed.gstTotal / 2).toFixed(2),
            sgstAmount: interstate ? 0 : +(computed.gstTotal - +(computed.gstTotal / 2).toFixed(2)).toFixed(2),
            igstAmount: interstate ? computed.gstTotal : 0,
          },
          shop: shopSnapshot,
        }).catch((pdfErr) => {
          console.warn("[sale] PDF share failed (sale still saved):", pdfErr);
        });
      } catch (pdfErr) {
        console.warn("[sale] PDF share threw synchronously:", pdfErr);
      }

      if (res.warnings.length > 0) {
        setWarns(res.warnings);
        setTimeout(() => router.replace("/(tabs)/billing"), 1800);
      } else {
        router.replace("/(tabs)/billing");
      }
    } catch (e) {
      console.error("[sale] Save failed:", e);
      setErr(e instanceof Error ? e.message : "Failed to save sale.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>New Sale / Bill</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Bill Type</Text>
          <ChipRow
            options={BILL_KINDS.map((b) => ({ value: b.value, label: b.label }))}
            value={billKind}
            onChange={(v) => setBillKind(v)}
            testIDPrefix="sale-billkind"
          />
          <Text style={styles.helper}>
            {BILL_KINDS.find((b) => b.value === billKind)?.hint}
          </Text>

          <AppTextField label="Customer Name" value={customerName} onChangeText={setCustomer} placeholder="e.g. Ramesh Kumar" testID="sale-customer" />
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <AppTextField label="Mobile Number" value={mobileNumber} onChangeText={setMobile} keyboardType="phone-pad" placeholder="10 digit" testID="sale-mobile" />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <AppTextField label="Vehicle Number" value={vehicleNumber} onChangeText={setVehicle} autoCapitalize="characters" placeholder="MH12AB1234" testID="sale-vehicle" />
            </View>
          </View>

          {!isKacha ? (
            <>
              <AppTextField
                label="Customer GSTIN (optional)"
                value={customerGstin}
                onChangeText={(v) => setCustomerGstin(v.toUpperCase())}
                autoCapitalize="characters"
                placeholder="15 char GSTIN"
                testID="sale-customer-gstin"
              />
              <AppTextField
                label="Customer Address (optional)"
                value={customerAddress}
                onChangeText={setCustomerAddress}
                placeholder="Street, City, State"
                multiline
                testID="sale-customer-address"
              />
              <AppTextField
                label="Customer State Code (optional)"
                value={customerStateCode}
                onChangeText={(v) => setCustomerStateCode(v.replace(/[^0-9]/g, "").slice(0, 2))}
                keyboardType="number-pad"
                placeholder="e.g. 27 (MH) — leave blank if same state"
                testID="sale-customer-state"
              />
            </>
          ) : null}

          <Text style={styles.label}>Customer Type</Text>
          <ChipRow
            options={CUSTOMER_TYPES.map((c) => ({
              value: c,
              label: !perms.canCreateWholesale && c !== "Retail" ? `${c} (Owner)` : c,
            }))}
            value={customerType}
            onChange={(v) => {
              if (!perms.canCreateWholesale && v !== "Retail") {
                setErr("Only the shop Owner can create non-retail bills.");
                return;
              }
              setErr(null);
              setCustomerType(v);
              const defaults = pricingCfg?.discountByType ?? null;
              const pct =
                defaults?.[v] ??
                ({ Retail: 0, Wholesale: 15, Dealer: 25, Fleet: 20, Government: 10 } as Record<CustomerType, number>)[v];
              // Apply default discount % to all current items.
              setItems((prev) => prev.map((it) => ({ ...it, discountPercent: String(pct ?? 0) })));
            }}
            testIDPrefix="sale-custtype"
          />

          <Text style={styles.label}>Tyre Class</Text>
          <ChipRow
            options={TYRE_CLASSES.map((c) => ({ value: c.value, label: c.label }))}
            value={tyreClass}
            onChange={setTyreClass}
            testIDPrefix="sale-class"
          />

          {/* Items --------------------------------------------------------- */}
          <View style={{ marginTop: spacing.lg }}>
            <Text style={styles.itemsHeader}>Tyres in this bill ({items.length})</Text>
            {items.map((it, idx) => {
              const line = computed.lines[idx];
              const overStock =
                typeof it.availableStock === "number" && line.qty > it.availableStock;
              return (
                <View key={idx} style={styles.itemCard} testID={`sale-item-${idx}`}>
                  <View style={styles.itemHeaderRow}>
                    <Text style={styles.itemBadge}>Item {idx + 1}</Text>
                    {items.length > 1 ? (
                      <TouchableOpacity
                        onPress={() => removeItem(idx)}
                        style={styles.itemRemove}
                        testID={`sale-item-remove-${idx}`}
                      >
                        <MaterialCommunityIcons name="close" size={16} color={colors.error} />
                        <Text style={styles.itemRemoveText}>Remove</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <AppTextField
                    label="Brand"
                    value={it.brand}
                    onChangeText={(v) => updateItem(idx, { brand: v, linkedTyreId: undefined, availableStock: undefined })}
                    onBlur={() => linkItemToStock(idx)}
                    placeholder="MRF, Apollo, CEAT…"
                    testID={`sale-item-brand-${idx}`}
                  />
                  <AppTextField
                    label="Model"
                    value={it.model}
                    onChangeText={(v) => updateItem(idx, { model: v, linkedTyreId: undefined, availableStock: undefined })}
                    onBlur={() => linkItemToStock(idx)}
                    placeholder="e.g. ZLX"
                    testID={`sale-item-model-${idx}`}
                  />
                  <AppTextField
                    label="Tyre Size"
                    value={it.size}
                    onChangeText={(v) => updateItem(idx, { size: v, linkedTyreId: undefined, availableStock: undefined })}
                    onBlur={() => linkItemToStock(idx)}
                    placeholder="e.g. 205/55 R16"
                    testID={`sale-item-size-${idx}`}
                  />
                  <View style={{ flexDirection: "row" }}>
                    <View style={{ flex: 1, marginRight: spacing.sm }}>
                      <AppTextField
                        label="Quantity"
                        value={it.quantity}
                        onChangeText={(v) => updateItem(idx, { quantity: v })}
                        keyboardType="number-pad"
                        placeholder="0"
                        testID={`sale-item-qty-${idx}`}
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <AppTextField
                        label="Selling Price (₹)"
                        value={it.sellingPrice}
                        onChangeText={(v) => updateItem(idx, { sellingPrice: v })}
                        keyboardType="numeric"
                        placeholder="0"
                        testID={`sale-item-price-${idx}`}
                      />
                    </View>
                  </View>

                  {typeof it.availableStock === "number" ? (
                    <Text
                      style={[
                        styles.stockLine,
                        overStock ? { color: colors.error } : { color: colors.success },
                      ]}
                      testID={`sale-item-stock-${idx}`}
                    >
                      {overStock
                        ? `⚠︎ Only ${it.availableStock} in stock`
                        : `✓ ${it.availableStock} in stock`}
                    </Text>
                  ) : it.brand.trim() && it.model.trim() && it.size.trim() ? (
                    <Text style={styles.stockLine}>Not linked to inventory — stock won&apos;t be reduced.</Text>
                  ) : null}

                  {/* Optional dealer discount pricing per item. */}
                  <View style={{ flexDirection: "row", marginTop: spacing.sm }}>
                    <View style={{ flex: 1, marginRight: spacing.sm }}>
                      <AppTextField
                        label="Price List (opt)"
                        value={it.priceList}
                        onChangeText={(v) => updateItem(idx, { priceList: v })}
                        keyboardType="numeric"
                        placeholder="0"
                        testID={`sale-item-pricelist-${idx}`}
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <AppTextField
                        label="Discount %"
                        value={it.discountPercent}
                        onChangeText={(v) => updateItem(idx, { discountPercent: v })}
                        keyboardType="numeric"
                        placeholder="0"
                        editable={perms.canEditPrices}
                        testID={`sale-item-discount-${idx}`}
                      />
                    </View>
                  </View>

                  <View style={styles.itemTotalRow}>
                    <Text style={styles.itemTotalLabel}>Line Total</Text>
                    <Text style={styles.itemTotalValue}>₹{line.lineTotal.toFixed(2)}</Text>
                  </View>
                </View>
              );
            })}

            <TouchableOpacity
              style={styles.addBtn}
              onPress={addItem}
              activeOpacity={0.85}
              testID="sale-add-item"
            >
              <MaterialCommunityIcons name="plus-circle-outline" size={20} color={colors.brand} />
              <Text style={styles.addBtnText}>+ Add Another Tyre</Text>
            </TouchableOpacity>

            {!isKacha ? (
              <>
                <Text style={styles.label}>GST %</Text>
                <ChipRow
                  options={GST_OPTIONS.map((n) => ({ value: n, label: `${n}%` }))}
                  value={gstPercent}
                  onChange={setGst}
                  testIDPrefix="sale-gst"
                />
              </>
            ) : (
              <Text style={styles.helper}>Sale Receipt does not charge GST.</Text>
            )}

            <Text style={styles.label}>Payment Mode</Text>
            <ChipRow
              options={PAYMENT_MODES.map((p) => ({ value: p, label: p }))}
              value={paymentMode}
              onChange={setPayment}
              testIDPrefix="sale-pay"
            />
          </View>

          <View style={styles.summary}>
            <SummaryRow label="Subtotal" value={`₹${computed.subtotal.toFixed(2)}`} />
            {!isKacha ? (
              <SummaryRow label={`GST (${gstPercent}%)`} value={`₹${computed.gstTotal.toFixed(2)}`} />
            ) : null}
            <SummaryRow label="Grand Total" value={`₹${computed.grandTotal.toFixed(2)}`} bold />
          </View>

          {warns.length > 0
            ? warns.map((w, i) => (
                <Text key={i} style={[styles.err, { color: colors.warning }]}>{w}</Text>
              ))
            : null}
          {err ? <Text style={styles.err}>{err}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton
            label="Save Sale & Reduce Stock"
            onPress={onSave}
            loading={saving}
            testID="sale-save-btn"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={sumStyles.row}>
      <Text style={[sumStyles.label, bold && { fontWeight: "800" }]}>{label}</Text>
      <Text style={[sumStyles.val, bold && { fontWeight: "800" }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: fontSize.xl, fontWeight: "800", color: colors.onSurface },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  helper: {
    fontSize: fontSize.xs,
    color: colors.muted,
    marginTop: 4,
    marginBottom: spacing.xs,
  },
  summary: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.md,
  },
  err: { color: colors.error, fontSize: fontSize.sm, marginTop: spacing.sm },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  itemsHeader: {
    fontSize: fontSize.base,
    fontWeight: "800",
    color: colors.onSurface,
    marginBottom: spacing.sm,
  },
  itemCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  itemHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  itemBadge: {
    fontSize: fontSize.xs,
    fontWeight: "800",
    color: colors.brand,
    letterSpacing: 0.5,
  },
  itemRemove: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  itemRemoveText: {
    color: colors.error,
    fontWeight: "700",
    fontSize: fontSize.xs,
  },
  stockLine: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    marginTop: 4,
    color: colors.muted,
  },
  itemTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  itemTotalLabel: {
    fontSize: fontSize.sm,
    color: colors.onSurfaceSecondary,
    fontWeight: "600",
  },
  itemTotalValue: {
    fontSize: fontSize.base,
    color: colors.onSurface,
    fontWeight: "800",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.brand,
    backgroundColor: colors.brandTertiary,
    marginBottom: spacing.md,
  },
  addBtnText: {
    color: colors.brand,
    fontWeight: "800",
    fontSize: fontSize.sm,
  },
});

const sumStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  label: { fontSize: fontSize.sm, color: colors.onSurfaceInverse },
  val: { fontSize: fontSize.sm, color: colors.onSurfaceInverse, fontWeight: "700" },
});
