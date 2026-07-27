import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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
import {
  PAYMENT_MODES,
  VEHICLE_CATEGORIES,
  type PaymentMode,
  type VehicleCategoryId,
} from "@/src/constants/inventory";
import { createSale } from "@/src/firebase/sales";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

const GST_OPTIONS = [0, 5, 12, 18, 28];

export default function NewSale() {
  const router = useRouter();
  const [customerName, setCustomer] = useState("");
  const [mobileNumber, setMobile] = useState("");
  const [vehicleNumber, setVehicle] = useState("");
  const [categoryId, setCategoryId] = useState<VehicleCategoryId>("car");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState("");
  const [sellingPrice, setPrice] = useState("");
  const [gstPercent, setGst] = useState<number>(18);
  const [paymentMode, setPayment] = useState<PaymentMode>("Cash");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const subtotal = (Number(quantity) || 0) * (Number(sellingPrice) || 0);
  const gstAmount = (subtotal * gstPercent) / 100;
  const total = subtotal + gstAmount;

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
      const res = await createSale({
        customerName: customerName.trim(),
        mobileNumber: mobileNumber.trim(),
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        date: Date.now(),
        categoryId,
        brand: brand.trim(),
        model: model.trim(),
        size: size.trim(),
        quantity: Number(quantity),
        sellingPrice: Number(sellingPrice) || 0,
        gstPercent,
        paymentMode,
      });
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

            <Text style={styles.label}>GST %</Text>
            <ChipRow
              options={GST_OPTIONS.map((n) => ({ value: n, label: `${n}%` }))}
              value={gstPercent}
              onChange={setGst}
              testIDPrefix="sale-gst"
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
});

const sumStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  label: { fontSize: fontSize.sm, color: colors.onSurfaceInverse },
  val: { fontSize: fontSize.sm, color: colors.onSurfaceInverse, fontWeight: "700" },
});
