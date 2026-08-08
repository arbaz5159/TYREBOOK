// Pricing Management — owner sets default discount % per customer type,
// default GST %, minimum margin alerts. Persisted to AsyncStorage
// (`tyrebook.pricingConfig`) so Sales/Billing modules can read them.

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AdminBottomNav } from "@/src/components/AdminBottomNav";
import { AdminHeader } from "@/src/components/AdminHeader";
import { AppTextField } from "@/src/components/AppTextField";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { CUSTOMER_TYPES, type CustomerType } from "@/src/constants/inventory";
import { useAuth } from "@/src/context/AuthContext";
import { getActiveShopId } from "@/src/firebase/tenant";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";
import { getPricingConfig, type PricingConfig } from "@/src/utils/settings";
import { storage } from "@/src/utils/storage";

const KEY = "tyrebook.pricingConfig";

async function saveConfig(cfg: PricingConfig): Promise<void> {
  await storage.setItem(KEY, JSON.stringify(cfg));
}

export default function PricingManagement() {
  const { user } = useAuth();
  const [gst, setGst] = useState("18");
  const [margin, setMargin] = useState("5");
  const [discounts, setDiscounts] = useState<Record<CustomerType, string>>({
    Retail: "0",
    Wholesale: "15",
    Dealer: "25",
    Fleet: "20",
    Government: "10",
  });
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const hydrate = useCallback(async () => {
    const cfg = await getPricingConfig();
    setGst(String(cfg.defaultGstPercent));
    setMargin(String(cfg.minMarginPercent));
    setDiscounts({
      Retail: String(cfg.discountByType.Retail),
      Wholesale: String(cfg.discountByType.Wholesale),
      Dealer: String(cfg.discountByType.Dealer),
      Fleet: String(cfg.discountByType.Fleet),
      Government: String(cfg.discountByType.Government),
    });
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!user) return null;
  if (user.role === "staff") return <Redirect href="/(tabs)/settings" />;
  if (user.role === "super_admin" && !getActiveShopId()) return <Redirect href="/super-admin" />;

  const onSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const cfg: PricingConfig = {
        defaultGstPercent: Number(gst) || 0,
        minMarginPercent: Number(margin) || 0,
        discountByType: {
          Retail: Number(discounts.Retail) || 0,
          Wholesale: Number(discounts.Wholesale) || 0,
          Dealer: Number(discounts.Dealer) || 0,
          Fleet: Number(discounts.Fleet) || 0,
          Government: Number(discounts.Government) || 0,
        },
      };
      await saveConfig(cfg);
      setStatus("Pricing settings saved.");
    } catch (e: any) {
      setStatus("Failed to save: " + (e?.message ?? ""));
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = async () => {
    setGst("18");
    setMargin("5");
    setDiscounts({
      Retail: "0",
      Wholesale: "15",
      Dealer: "25",
      Fleet: "20",
      Government: "10",
    });
    setStatus("Restored defaults. Tap Save to persist.");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AdminHeader title="Pricing Management" subtitle="Discounts · GST · Margin" />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tax & Margin</Text>
            <Text style={styles.helper}>Applied automatically to every new invoice.</Text>
            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <AppTextField
                  label="Default GST (%)"
                  value={gst}
                  onChangeText={setGst}
                  keyboardType="numeric"
                  placeholder="18"
                  testID="pricing-gst"
                />
              </View>
              <View style={{ flex: 1 }}>
                <AppTextField
                  label="Min Margin (%)"
                  value={margin}
                  onChangeText={setMargin}
                  keyboardType="numeric"
                  placeholder="5"
                  testID="pricing-margin"
                />
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Default Discount by Customer Type</Text>
            <Text style={styles.helper}>
              Applied when a customer has no personal override. Owner can still edit per bill.
            </Text>
            {CUSTOMER_TYPES.map((t) => (
              <View key={t} style={{ marginTop: spacing.sm }}>
                <AppTextField
                  label={`${t} (%)`}
                  value={discounts[t]}
                  onChangeText={(v) =>
                    setDiscounts((prev) => ({ ...prev, [t]: v }))
                  }
                  keyboardType="numeric"
                  placeholder="0"
                  testID={`pricing-${t.toLowerCase()}`}
                />
              </View>
            ))}
          </View>

          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
            <PrimaryButton
              label="Restore Defaults"
              variant="secondary"
              onPress={resetDefaults}
              style={{ flex: 1 }}
              fullWidth={false}
              testID="pricing-reset"
              leftIcon={
                <MaterialCommunityIcons
                  name="restore"
                  size={16}
                  color={colors.onBrandTertiary}
                />
              }
            />
            <PrimaryButton
              label="Save Settings"
              onPress={onSave}
              loading={saving}
              style={{ flex: 1 }}
              fullWidth={false}
              testID="pricing-save"
              leftIcon={
                <MaterialCommunityIcons name="content-save-outline" size={16} color="#FFFFFF" />
              }
            />
          </View>

          {status ? <Text style={styles.status}>{status}</Text> : null}

          <View style={{ height: spacing.xxxl }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <AdminBottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: fontSize.base,
    fontWeight: "800",
    color: colors.onSurface,
  },
  helper: {
    fontSize: fontSize.xs,
    color: colors.muted,
    marginTop: 4,
  },
  status: {
    marginTop: spacing.md,
    color: colors.success,
    fontWeight: "700",
    textAlign: "center",
  },
});
