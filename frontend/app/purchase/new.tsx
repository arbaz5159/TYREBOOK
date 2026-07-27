import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
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
import { VEHICLE_CATEGORIES, type VehicleCategoryId } from "@/src/constants/inventory";
import { createPurchase } from "@/src/firebase/purchase";
import { usePermissions } from "@/src/hooks/usePermissions";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

const GST_OPTIONS = [0, 5, 12, 18, 28];

export default function NewPurchase() {
  const router = useRouter();
  const perms = usePermissions();
  const [supplierName, setSupplier] = useState("");
  const [invoiceNumber, setInvoice] = useState("");
  const [date, setDate] = useState(new Date());
  const [categoryId, setCategoryId] = useState<VehicleCategoryId>("car");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState("");
  const [purchasePrice, setPrice] = useState("");
  const [gstPercent, setGst] = useState<number>(18);
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const subtotal = (Number(quantity) || 0) * (Number(purchasePrice) || 0);
  const gstAmount = (subtotal * gstPercent) / 100;
  const total = subtotal + gstAmount;

  if (!perms.canCreatePurchase) return <Redirect href="/(tabs)/dashboard" />;

  const onSave = async () => {
    setErr(null);
    if (!supplierName.trim() || !brand.trim() || !model.trim() || !size.trim()) {
      setErr("Supplier, brand, model and size are required.");
      return;
    }
    if (!Number(quantity) || Number(quantity) <= 0) {
      setErr("Quantity must be greater than zero.");
      return;
    }
    setSaving(true);
    try {
      await createPurchase({
        supplierName: supplierName.trim(),
        invoiceNumber: invoiceNumber.trim(),
        date: date.getTime(),
        categoryId,
        brand: brand.trim(),
        model: model.trim(),
        size: size.trim(),
        quantity: Number(quantity),
        purchasePrice: Number(purchasePrice) || 0,
        gstPercent,
        remarks: remarks.trim(),
      });
      router.replace("/purchase");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save purchase.");
    } finally {
      setSaving(false);
    }
  };

  const shiftDate = (days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>New Purchase</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <AppTextField
            label="Supplier Name"
            value={supplierName}
            onChangeText={setSupplier}
            placeholder="e.g. Sri Balaji Tyres"
            testID="pur-supplier"
          />
          <AppTextField
            label="Invoice Number"
            value={invoiceNumber}
            onChangeText={setInvoice}
            placeholder="e.g. INV-1234"
            testID="pur-invoice"
          />

          <Text style={styles.label}>Date</Text>
          <View style={styles.dateRow}>
            <TouchableOpacity style={styles.dateBtn} onPress={() => shiftDate(-1)} testID="pur-date-prev">
              <MaterialCommunityIcons name="chevron-left" size={20} color={colors.onSurface} />
            </TouchableOpacity>
            <Text style={styles.dateText} testID="pur-date-value">
              {date.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
            </Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => shiftDate(1)} testID="pur-date-next">
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.onSurface} />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Vehicle Category</Text>
          <ChipRow
            options={VEHICLE_CATEGORIES.map((c) => ({ value: c.id, label: c.name }))}
            value={categoryId}
            onChange={setCategoryId}
            testIDPrefix="pur-cat"
          />

          <View style={{ marginTop: spacing.lg }}>
            <AppTextField label="Brand" value={brand} onChangeText={setBrand} placeholder="MRF, Apollo, CEAT…" testID="pur-brand" />
            <AppTextField label="Model" value={model} onChangeText={setModel} placeholder="e.g. ZLX" testID="pur-model" />
            <AppTextField label="Tyre Size" value={size} onChangeText={setSize} placeholder="e.g. 205/55 R16" testID="pur-size" />
            <View style={{ flexDirection: "row" }}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <AppTextField label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" placeholder="0" testID="pur-qty" />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <AppTextField label="Purchase Price (₹)" value={purchasePrice} onChangeText={setPrice} keyboardType="numeric" placeholder="0" testID="pur-price" />
              </View>
            </View>

            <Text style={styles.label}>GST %</Text>
            <ChipRow
              options={GST_OPTIONS.map((n) => ({ value: n, label: `${n}%` }))}
              value={gstPercent}
              onChange={setGst}
              testIDPrefix="pur-gst"
            />

            <View style={{ marginTop: spacing.md }}>
              <AppTextField
                label="Remarks"
                value={remarks}
                onChangeText={setRemarks}
                placeholder="Optional notes"
                testID="pur-remarks"
              />
            </View>
          </View>

          <View style={styles.summary}>
            <SummaryRow label="Subtotal" value={`₹${subtotal.toFixed(2)}`} />
            <SummaryRow label={`GST (${gstPercent}%)`} value={`₹${gstAmount.toFixed(2)}`} />
            <SummaryRow label="Total" value={`₹${total.toFixed(2)}`} bold />
          </View>

          {err ? <Text style={styles.err}>{err}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton
            label="Save Purchase & Update Stock"
            onPress={onSave}
            loading={saving}
            testID="pur-save-btn"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={sumStyles.row}>
      <Text style={[sumStyles.label, bold && { fontWeight: "800", color: colors.onSurface }]}>{label}</Text>
      <Text style={[sumStyles.val, bold && { fontWeight: "800", color: colors.brandPrimary }]}>{value}</Text>
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
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
    justifyContent: "space-between",
  },
  dateBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  dateText: { fontSize: fontSize.base, fontWeight: "600", color: colors.onSurface },
  summary: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.brandTertiary,
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
});

const sumStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  label: { fontSize: fontSize.sm, color: colors.onBrandTertiary },
  val: { fontSize: fontSize.sm, color: colors.onBrandTertiary, fontWeight: "700" },
});
