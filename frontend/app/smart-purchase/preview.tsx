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
import type { InvoiceExtraction, InvoiceLineItem } from "@/src/api/ocr";
import { checkDuplicateInvoice, indexPurchase } from "@/src/api/ocr";
import { VEHICLE_CATEGORIES, type VehicleCategoryId } from "@/src/constants/inventory";
import { createPurchase } from "@/src/firebase/purchase";
import { storage } from "@/src/utils/storage";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

const DRAFT_KEY = "tyrebook.smartPurchase.draft";
const GST_OPTIONS = [0, 5, 12, 18, 28];

interface EditableItem extends InvoiceLineItem {
  categoryId: VehicleCategoryId;
}

interface DraftShape {
  extraction: InvoiceExtraction;
  imageUri?: string;
  mime?: string;
}

function conf(field: string, confidence?: Record<string, string>): "high" | "medium" | "low" {
  const v = confidence?.[field] ?? "medium";
  return (v as any) ?? "medium";
}

export default function SmartPurchasePreview() {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [supplier, setSupplier] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [date, setDate] = useState<string>("");
  const [gst, setGst] = useState<number>(18);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dupWarn, setDupWarn] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const raw = await storage.getItem<string | null>(DRAFT_KEY, null);
      if (raw) {
        try {
          const parsed: DraftShape = JSON.parse(raw);
          setDraft(parsed);
          const e = parsed.extraction;
          setSupplier(e.supplier_name ?? "");
          setInvoiceNo(e.invoice_number ?? "");
          setDate(e.invoice_date ?? "");
          setGst(Number(e.gst_percentage) || 18);
          setItems(
            (e.line_items ?? []).map((i) => ({ ...i, categoryId: "car" })),
          );
          if (e.invoice_number) {
            const dup = await checkDuplicateInvoice(e.invoice_number, e.supplier_name);
            if (dup.duplicate)
              setDupWarn(
                `⚠︎ Invoice "${e.invoice_number}" already exists in your records${dup.match?.supplier_name ? ` for ${dup.match.supplier_name}` : ""}.`,
              );
          }
        } catch {
          setErr("Failed to load extracted data.");
        }
      } else {
        setErr("No scan found. Please scan an invoice first.");
      }
      setLoading(false);
    })();
  }, []);

  const updateItem = (idx: number, patch: Partial<EditableItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const addItem = () =>
    setItems((prev) => [
      ...prev,
      {
        brand: "",
        model: "",
        size: "",
        tube_tubeless: "",
        radial_bias: "",
        ply_rating: "",
        quantity: 0,
        purchase_price: 0,
        categoryId: "car",
      },
    ]);

  const onConfirm = async () => {
    setErr(null);
    if (!supplier.trim()) {
      setErr("Supplier name is required.");
      return;
    }
    if (items.length === 0) {
      setErr("Add at least one line item.");
      return;
    }
    setSaving(true);
    try {
      let total = 0;
      for (const it of items) {
        await createPurchase({
          supplierName: supplier.trim(),
          invoiceNumber: invoiceNo.trim(),
          date: Date.now(),
          categoryId: it.categoryId,
          brand: it.brand.trim(),
          model: it.model.trim(),
          size: it.size.trim(),
          quantity: Number(it.quantity) || 0,
          purchasePrice: Number(it.purchase_price) || 0,
          gstPercent: gst,
          remarks: "Imported via AI scan",
        });
        const sub = (Number(it.quantity) || 0) * (Number(it.purchase_price) || 0);
        total += sub + (sub * gst) / 100;
      }
      await indexPurchase({
        invoice_number: invoiceNo.trim(),
        supplier_name: supplier.trim(),
        total,
        date,
      });
      await storage.removeItem(DRAFT_KEY);
      router.replace("/purchase");
    } catch (e: any) {
      setErr(e?.message ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const confBadge = (label: string, field: string) => {
    const c = conf(field, draft?.extraction.confidence);
    if (c === "high") return null;
    return (
      <View style={[styles.badge, c === "low" ? styles.badgeLow : styles.badgeMed]}>
        <MaterialCommunityIcons
          name="alert-outline"
          size={12}
          color={c === "low" ? colors.error : colors.warning}
        />
        <Text style={[styles.badgeText, { color: c === "low" ? colors.error : colors.warning }]}>
          verify
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.muted }}>Loading extraction…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.title}>Verify Extraction</Text>
          <Text style={styles.sub}>Yellow / red badges need your review</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {dupWarn ? (
            <View style={styles.dupBox} testID="dup-warning">
              <MaterialCommunityIcons name="content-duplicate" size={20} color={colors.warning} />
              <Text style={styles.dupText}>{dupWarn}</Text>
            </View>
          ) : null}

          <View style={styles.headBlock}>
            <View style={styles.headRow}>
              <Text style={styles.blockLabel}>Supplier</Text>
              {confBadge("Supplier", "supplier_name")}
            </View>
            <AppTextField label="" value={supplier} onChangeText={setSupplier} placeholder="Supplier name" testID="preview-supplier" />

            <View style={styles.headRow}>
              <Text style={styles.blockLabel}>Invoice #</Text>
              {confBadge("Invoice", "invoice_number")}
            </View>
            <AppTextField label="" value={invoiceNo} onChangeText={setInvoiceNo} placeholder="Invoice number" testID="preview-invoice" />

            <View style={styles.headRow}>
              <Text style={styles.blockLabel}>Invoice Date</Text>
              {confBadge("Date", "invoice_date")}
            </View>
            <AppTextField label="" value={date} onChangeText={setDate} placeholder="DD-MM-YYYY" testID="preview-date" />

            <Text style={styles.blockLabel}>GST %</Text>
            <ChipRow
              options={GST_OPTIONS.map((n) => ({ value: n, label: `${n}%` }))}
              value={gst}
              onChange={setGst}
              testIDPrefix="preview-gst"
            />
          </View>

          <View style={styles.itemsHeader}>
            <Text style={styles.blockLabel}>Line Items · {items.length}</Text>
            <TouchableOpacity onPress={addItem} style={styles.miniBtn} testID="add-item">
              <MaterialCommunityIcons name="plus" size={18} color={colors.brandPrimary} />
              <Text style={{ color: colors.brandPrimary, fontWeight: "700", fontSize: fontSize.xs }}>Add</Text>
            </TouchableOpacity>
          </View>

          {items.length === 0 ? (
            <Text style={{ color: colors.muted, marginBottom: spacing.md }}>
              No line items detected. Tap &quot;Add&quot; to enter items manually.
            </Text>
          ) : null}

          {items.map((it, idx) => (
            <View key={idx} style={styles.itemCard} testID={`item-${idx}`}>
              <View style={styles.itemHead}>
                <Text style={styles.itemHeadText}>Item {idx + 1}</Text>
                <TouchableOpacity onPress={() => removeItem(idx)} testID={`remove-item-${idx}`}>
                  <MaterialCommunityIcons name="close" size={20} color={colors.error} />
                </TouchableOpacity>
              </View>

              <Text style={styles.blockLabel}>Vehicle Category</Text>
              <ChipRow
                options={VEHICLE_CATEGORIES.map((c) => ({ value: c.id, label: c.name }))}
                value={it.categoryId}
                onChange={(v) => updateItem(idx, { categoryId: v })}
                testIDPrefix={`item-${idx}-cat`}
              />
              <View style={{ height: spacing.sm }} />

              <AppTextField label="Brand" value={it.brand} onChangeText={(v) => updateItem(idx, { brand: v })} testID={`item-${idx}-brand`} />
              <AppTextField label="Model" value={it.model} onChangeText={(v) => updateItem(idx, { model: v })} testID={`item-${idx}-model`} />
              <AppTextField label="Size" value={it.size} onChangeText={(v) => updateItem(idx, { size: v })} testID={`item-${idx}-size`} />
              <View style={{ flexDirection: "row" }}>
                <View style={{ flex: 1, marginRight: spacing.sm }}>
                  <AppTextField
                    label="Qty"
                    value={String(it.quantity ?? "")}
                    onChangeText={(v) => updateItem(idx, { quantity: Number(v) || 0 })}
                    keyboardType="number-pad"
                    testID={`item-${idx}-qty`}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <AppTextField
                    label="Purchase Price (₹)"
                    value={String(it.purchase_price ?? "")}
                    onChangeText={(v) => updateItem(idx, { purchase_price: Number(v) || 0 })}
                    keyboardType="numeric"
                    testID={`item-${idx}-price`}
                  />
                </View>
              </View>
            </View>
          ))}

          {err ? <Text style={styles.err}>{err}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton
            label="Confirm & Save Purchase"
            onPress={onConfirm}
            loading={saving}
            testID="confirm-purchase"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
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
  sub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  dupBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#FFEAD1",
    marginBottom: spacing.md,
  },
  dupText: { flex: 1, color: colors.warning, fontSize: fontSize.sm, fontWeight: "600" },
  headBlock: { marginBottom: spacing.md },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  blockLabel: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.onSurfaceSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  itemsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  miniBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  itemCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  itemHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  itemHeadText: { fontWeight: "700", color: colors.onSurface },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeMed: { backgroundColor: "#FFEAD1" },
  badgeLow: { backgroundColor: "#FFDAD6" },
  badgeText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  err: { color: colors.error, fontSize: fontSize.sm, marginTop: spacing.sm },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
});
