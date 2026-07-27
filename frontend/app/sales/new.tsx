import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
  VEHICLE_CATEGORIES,
  type CustomerType,
  type PaymentMode,
  type TyreClass,
  type VehicleCategoryId,
} from "@/src/constants/inventory";
import { createSale } from "@/src/firebase/sales";
import { getShopSettings } from "@/src/firebase/master";
import { addKhataEntry } from "@/src/firebase/khata";
import { generateAndShareInvoice, type InvoiceType } from "@/src/utils/invoicePdf";
import { getPricingConfig, type PricingConfig } from "@/src/utils/settings";
import { usePermissions } from "@/src/hooks/usePermissions";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

const GST_OPTIONS = [0, 5, 12, 18, 28];
const INVOICE_TYPES: InvoiceType[] = [
  "Tax Invoice",
  "GST Invoice",
  "Non-GST Invoice",
  "Estimate",
  "Quotation",
  "Delivery Challan",
  "Purchase Order",
];

export default function NewSale() {
  const router = useRouter();
  const perms = usePermissions();
  const [customerName, setCustomer] = useState("");
  const [mobileNumber, setMobile] = useState("");
  const [vehicleNumber, setVehicle] = useState("");
  const [categoryId, setCategoryId] = useState<VehicleCategoryId>("car");
  const [tyreClass, setTyreClass] = useState<TyreClass>("new");
  const [customerType, setCustomerType] = useState<CustomerType>("Retail");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState("");
  const [sellingPrice, setPrice] = useState("");
  const [priceList, setPriceList] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [gstPercent, setGst] = useState<number>(18);
  const [paymentMode, setPayment] = useState<PaymentMode>("Cash");
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("Tax Invoice");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [pricingCfg, setPricingCfg] = useState<PricingConfig | null>(null);

  // Load owner-configured pricing defaults once. Applied when user picks a
  // customer type so the default discount % is pre-filled from admin/pricing.
  useEffect(() => {
    (async () => {
      const cfg = await getPricingConfig();
      setPricingCfg(cfg);
      setGst(cfg.defaultGstPercent);
    })();
  }, []);

  const subtotal = (Number(quantity) || 0) * (Number(sellingPrice) || 0);
  const gstAmount = (subtotal * gstPercent) / 100;
  const total = subtotal + gstAmount;

  // Discount math (per unit): if user typed priceList and discount% we compute
  // the final selling price. Owner can override the discount % during billing.
  const listNum = Number(priceList) || 0;
  const discNum = Number(discountPercent) || 0;
  const discountAmount = +(listNum * (discNum / 100)).toFixed(2);
  const finalPrice = +(listNum - discountAmount).toFixed(2);
  // Auto-sync the discounted final price into sellingPrice when list is set.
  const effectiveSellingPrice = listNum > 0 ? finalPrice : Number(sellingPrice) || 0;

  const onSave = async () => {
    setErr(null);
    setWarn(null);
    if (!customerName.trim() || !brand.trim() || !model.trim() || !size.trim()) {
      setErr("Customer, brand, model and size are required.");
      return;
    }
    if (!Number(quantity) || Number(quantity) <= 0) {
      setErr("Quantity must be greater than zero.");
      return;
    }
    setSaving(true);
    try {
      const saleDate = Date.now();
      const salePayload = {
        customerName: customerName.trim(),
        mobileNumber: mobileNumber.trim(),
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        customerType,
        date: saleDate,
        categoryId,
        tyreClass,
        brand: brand.trim(),
        model: model.trim(),
        size: size.trim(),
        quantity: Number(quantity),
        priceList: listNum,
        discountPercent: discNum,
        discountAmount,
        sellingPrice: effectiveSellingPrice,
        gstPercent,
        paymentMode,
      };
      const res = await createSale(salePayload);

      const grandTotal = total;
      // Post-write side effects: KhataBook entry + invoice # + PDF share.
      const shop = await getShopSettings();
      const invoiceNumber = `${shop.invoicePrefix || "TB"}-${shop.nextInvoiceNumber || "0001"}`;

      if (paymentMode === "Credit" && mobileNumber.trim()) {
        await addKhataEntry({
          customerId: mobileNumber.trim(),
          customerName: customerName.trim(),
          direction: "credit",
          amount: grandTotal,
          note: `Sale ${brand.trim()} ${model.trim()} ${size.trim()}`,
          reference: invoiceNumber,
          date: saleDate,
        });
      }

      // Fire and forget the PDF share so the flow doesn't block on user.
      generateAndShareInvoice({
        invoiceType,
        invoiceNumber,
        sale: { ...salePayload, id: res.id, totalValue: grandTotal, createdAt: saleDate },
        shop,
      }).catch(() => {});

      if (res.warning) {
        setWarn(res.warning);
        setTimeout(() => router.replace("/(tabs)/billing"), 1500);
      } else {
        router.replace("/(tabs)/billing");
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save sale.");
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
          <AppTextField label="Customer Name" value={customerName} onChangeText={setCustomer} placeholder="e.g. Ramesh Kumar" testID="sale-customer" />
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <AppTextField label="Mobile Number" value={mobileNumber} onChangeText={setMobile} keyboardType="phone-pad" placeholder="10 digit" testID="sale-mobile" />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <AppTextField label="Vehicle Number" value={vehicleNumber} onChangeText={setVehicle} autoCapitalize="characters" placeholder="MH12AB1234" testID="sale-vehicle" />
            </View>
          </View>

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
              setDiscountPercent(String(pct ?? 0));
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

          <Text style={styles.label}>Vehicle Category</Text>
          <ChipRow
            options={VEHICLE_CATEGORIES.map((c) => ({ value: c.id, label: c.name }))}
            value={categoryId}
            onChange={setCategoryId}
            testIDPrefix="sale-cat"
          />

          <View style={{ marginTop: spacing.lg }}>
            <AppTextField label="Brand" value={brand} onChangeText={setBrand} placeholder="MRF, Apollo, CEAT…" testID="sale-brand" />
            <AppTextField label="Model" value={model} onChangeText={setModel} placeholder="e.g. ZLX" testID="sale-model" />
            <AppTextField label="Tyre Size" value={size} onChangeText={setSize} placeholder="e.g. 205/55 R16" testID="sale-size" />
            <View style={{ flexDirection: "row" }}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <AppTextField label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" placeholder="0" testID="sale-qty" />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <AppTextField label="Selling Price (₹)" value={sellingPrice} onChangeText={setPrice} keyboardType="numeric" placeholder="0" testID="sale-price" />
              </View>
            </View>

            <Text style={styles.label}>Dealer Discount Pricing (optional)</Text>
            <View style={{ flexDirection: "row" }}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <AppTextField
                  label="Company Price List (₹)"
                  value={priceList}
                  onChangeText={setPriceList}
                  keyboardType="numeric"
                  placeholder="0"
                  testID="sale-pricelist"
                />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <AppTextField
                  label="Discount %"
                  value={discountPercent}
                  onChangeText={setDiscountPercent}
                  keyboardType="numeric"
                  placeholder="0"
                  editable={perms.canEditPrices}
                  testID="sale-discount"
                />
              </View>
            </View>
            {listNum > 0 ? (
              <View style={styles.discountCard} testID="discount-card">
                <View style={styles.dcRow}>
                  <Text style={styles.dcLabel}>Price List</Text>
                  <Text style={styles.dcValue}>₹{listNum.toFixed(2)}</Text>
                </View>
                <View style={styles.dcRow}>
                  <Text style={styles.dcLabel}>Discount ({discNum}%)</Text>
                  <Text style={[styles.dcValue, { color: colors.error }]}>−₹{discountAmount.toFixed(2)}</Text>
                </View>
                <View style={[styles.dcRow, styles.dcBig]}>
                  <Text style={styles.dcLabelBig}>Final Price</Text>
                  <Text style={styles.dcValueBig}>₹{finalPrice.toFixed(2)}</Text>
                </View>
              </View>
            ) : null}

            <Text style={styles.label}>GST %</Text>
            <ChipRow
              options={GST_OPTIONS.map((n) => ({ value: n, label: `${n}%` }))}
              value={gstPercent}
              onChange={setGst}
              testIDPrefix="sale-gst"
            />

            <Text style={styles.label}>Invoice Type</Text>
            <ChipRow
              options={INVOICE_TYPES.map((t) => ({ value: t, label: t }))}
              value={invoiceType}
              onChange={setInvoiceType}
              testIDPrefix="sale-invtype"
            />

            <Text style={styles.label}>Payment Mode</Text>
            <ChipRow
              options={PAYMENT_MODES.map((p) => ({ value: p, label: p }))}
              value={paymentMode}
              onChange={setPayment}
              testIDPrefix="sale-pay"
            />
          </View>

          <View style={styles.summary}>
            <SummaryRow label="Subtotal" value={`₹${subtotal.toFixed(2)}`} />
            <SummaryRow label={`GST (${gstPercent}%)`} value={`₹${gstAmount.toFixed(2)}`} />
            <SummaryRow label="Total" value={`₹${total.toFixed(2)}`} bold />
          </View>

          {warn ? <Text style={[styles.err, { color: colors.warning }]}>{warn}</Text> : null}
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
  discountCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
  },
  dcRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  dcLabel: { fontSize: fontSize.sm, color: colors.onBrandTertiary },
  dcValue: { fontSize: fontSize.sm, color: colors.onBrandTertiary, fontWeight: "700" },
  dcBig: { marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.15)" },
  dcLabelBig: { fontSize: fontSize.base, fontWeight: "800", color: colors.onBrandTertiary },
  dcValueBig: { fontSize: fontSize.lg, fontWeight: "800", color: colors.brandPrimary },
});

const sumStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  label: { fontSize: fontSize.sm, color: colors.onSurfaceInverse },
  val: { fontSize: fontSize.sm, color: colors.onSurfaceInverse, fontWeight: "700" },
});