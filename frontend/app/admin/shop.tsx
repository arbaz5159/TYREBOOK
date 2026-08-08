import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
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
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { useAuth } from "@/src/context/AuthContext";
import { getActiveShopId } from "@/src/firebase/tenant";
import { getShopSettings, saveShopSettings, type ShopSettings } from "@/src/firebase/master";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

const EMPTY: ShopSettings = {
  shopName: "",
  ownerName: "",
  address: "",
  phone: "",
  email: "",
  gstin: "",
  panNumber: "",
  invoicePrefix: "TB",
  nextInvoiceNumber: "0001",
  invoiceFooter: "Thank you for your business!",
  stateCode: "",
  stateName: "",
  hsnCode: "4011",
  bankName: "",
  bankAccountNumber: "",
  bankIFSC: "",
  bankBranch: "",
  upiId: "",
  declaration:
    "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
  signatureName: "",
  kachaPrefix: "CM",
  nextKachaNumber: "0001",
};

export default function ShopSettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [form, setForm] = useState<ShopSettings>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => setForm(await getShopSettings()))();
  }, []);

  if (!user) return null;
  if (user.role === "staff") return <Redirect href="/(tabs)/settings" />;
  if (user.role === "super_admin" && !getActiveShopId()) return <Redirect href="/super-admin" />;

  const update = (patch: Partial<ShopSettings>) => setForm((p) => ({ ...p, ...patch }));

  const submit = async () => {
    setSaving(true);
    try {
      await saveShopSettings(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
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
        <Text style={styles.title}>Shop / GST / Invoice</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.section}>Shop Details</Text>
          <AppTextField label="Shop Name" value={form.shopName} onChangeText={(v) => update({ shopName: v })} placeholder="e.g. Sri Krishna Tyres" testID="shop-name" />
          <AppTextField label="Owner Name" value={form.ownerName} onChangeText={(v) => update({ ownerName: v })} placeholder="Owner" testID="shop-owner" />
          <AppTextField label="Address" value={form.address} onChangeText={(v) => update({ address: v })} placeholder="Shop address" multiline testID="shop-address" />
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <AppTextField label="Phone" value={form.phone} onChangeText={(v) => update({ phone: v })} keyboardType="phone-pad" testID="shop-phone" />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <AppTextField label="Email" value={form.email} onChangeText={(v) => update({ email: v })} autoCapitalize="none" keyboardType="email-address" testID="shop-email" />
            </View>
          </View>

          <Text style={styles.section}>GST Details</Text>
          <AppTextField label="GSTIN" value={form.gstin} onChangeText={(v) => update({ gstin: v.toUpperCase() })} placeholder="15 char GSTIN" autoCapitalize="characters" testID="shop-gstin" />
          <AppTextField label="PAN Number" value={form.panNumber} onChangeText={(v) => update({ panNumber: v.toUpperCase() })} placeholder="10 char PAN" autoCapitalize="characters" testID="shop-pan" />

          <Text style={styles.section}>Invoice Settings</Text>
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <AppTextField label="GST Invoice Prefix" value={form.invoicePrefix} onChangeText={(v) => update({ invoicePrefix: v })} placeholder="TB" testID="shop-inv-prefix" />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <AppTextField label="Next GST Invoice #" value={form.nextInvoiceNumber} onChangeText={(v) => update({ nextInvoiceNumber: v })} placeholder="0001" testID="shop-inv-next" />
            </View>
          </View>
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <AppTextField label="Kacha Bill Prefix" value={form.kachaPrefix || ""} onChangeText={(v) => update({ kachaPrefix: v })} placeholder="CM" testID="shop-kacha-prefix" />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <AppTextField label="Next Kacha #" value={form.nextKachaNumber || ""} onChangeText={(v) => update({ nextKachaNumber: v })} placeholder="0001" testID="shop-kacha-next" />
            </View>
          </View>
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <AppTextField label="HSN Code" value={form.hsnCode || ""} onChangeText={(v) => update({ hsnCode: v })} placeholder="4011" testID="shop-hsn" />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <AppTextField label="State Code" value={form.stateCode || ""} onChangeText={(v) => update({ stateCode: v.replace(/[^0-9]/g, "").slice(0, 2) })} keyboardType="number-pad" placeholder="27" testID="shop-state-code" />
            </View>
          </View>
          <AppTextField label="State Name" value={form.stateName || ""} onChangeText={(v) => update({ stateName: v })} placeholder="Maharashtra" testID="shop-state-name" />
          <AppTextField label="Invoice Footer" value={form.invoiceFooter} onChangeText={(v) => update({ invoiceFooter: v })} placeholder="Thank you note" multiline testID="shop-inv-footer" />
          <AppTextField label="Authorised Signatory Name" value={form.signatureName || ""} onChangeText={(v) => update({ signatureName: v })} placeholder="Owner name for signature line" testID="shop-signature" />
          <AppTextField label="Declaration" value={form.declaration || ""} onChangeText={(v) => update({ declaration: v })} placeholder="Legal declaration on invoice foot" multiline testID="shop-declaration" />

          <Text style={styles.section}>Bank Details (printed on GST invoice)</Text>
          <AppTextField label="Bank Name" value={form.bankName || ""} onChangeText={(v) => update({ bankName: v })} placeholder="State Bank of India" testID="shop-bank-name" />
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <AppTextField label="Account Number" value={form.bankAccountNumber || ""} onChangeText={(v) => update({ bankAccountNumber: v })} keyboardType="number-pad" testID="shop-bank-account" />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <AppTextField label="IFSC" value={form.bankIFSC || ""} onChangeText={(v) => update({ bankIFSC: v.toUpperCase() })} autoCapitalize="characters" testID="shop-bank-ifsc" />
            </View>
          </View>
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <AppTextField label="Branch" value={form.bankBranch || ""} onChangeText={(v) => update({ bankBranch: v })} testID="shop-bank-branch" />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <AppTextField label="UPI ID" value={form.upiId || ""} onChangeText={(v) => update({ upiId: v })} autoCapitalize="none" placeholder="shop@upi" testID="shop-upi" />
            </View>
          </View>

          {saved ? <Text style={styles.saved}>Saved!</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton label="Save Changes" onPress={submit} loading={saving} testID="save-shop-btn" />
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
  section: {
    fontSize: fontSize.base,
    fontWeight: "800",
    color: colors.onSurface,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  saved: { color: colors.success, fontWeight: "700", marginTop: spacing.md },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
});
