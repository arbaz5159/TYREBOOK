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

  if (user && user.role !== "owner") return <Redirect href="/(tabs)/settings" />;

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
              <AppTextField label="Invoice Prefix" value={form.invoicePrefix} onChangeText={(v) => update({ invoicePrefix: v })} placeholder="TB" testID="shop-inv-prefix" />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <AppTextField label="Next Invoice #" value={form.nextInvoiceNumber} onChangeText={(v) => update({ nextInvoiceNumber: v })} placeholder="0001" testID="shop-inv-next" />
            </View>
          </View>
          <AppTextField label="Invoice Footer" value={form.invoiceFooter} onChangeText={(v) => update({ invoiceFooter: v })} placeholder="Thank you note" multiline testID="shop-inv-footer" />

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
