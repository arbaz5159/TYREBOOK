// App-wide settings — language, low-stock threshold, invoice defaults, theme,
// currency. Persists to AsyncStorage under `tyrebook.appSettings`.

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AdminBottomNav } from "@/src/components/AdminBottomNav";
import { AdminHeader } from "@/src/components/AdminHeader";
import { AppTextField } from "@/src/components/AppTextField";
import { ChipRow } from "@/src/components/ChipRow";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { useAuth } from "@/src/context/AuthContext";
import { getActiveShopId } from "@/src/firebase/tenant";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";
import {
  DEFAULT_APP_SETTINGS,
  getAppSettings,
  saveAppSettings,
  type AppSettings,
} from "@/src/utils/settings";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिंदी" },
  { value: "kn", label: "ಕನ್ನಡ" },
  { value: "mr", label: "मराठी" },
] as const;

const DEFAULTS: AppSettings = DEFAULT_APP_SETTINGS;

export default function AppSettingsScreen() {
  const { user } = useAuth();
  const [s, setS] = useState<AppSettings>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const hydrate = useCallback(async () => {
    const cfg = await getAppSettings();
    setS(cfg);
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
      await saveAppSettings(s);
      setStatus("App settings saved.");
    } catch (e: any) {
      setStatus("Failed: " + (e?.message ?? ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AdminHeader title="App Settings" subtitle="Language · Alerts · Defaults" />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Language</Text>
            <Text style={styles.helper}>Applied across menus and receipts.</Text>
            <View style={{ marginTop: spacing.sm }}>
              <ChipRow
                options={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
                value={s.language}
                onChange={(v) => setS((prev) => ({ ...prev, language: v as AppSettings["language"] }))}
                testIDPrefix="app-lang"
              />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Currency & Alerts</Text>
            <View style={{ marginTop: spacing.sm }}>
              <AppTextField
                label="Currency Symbol"
                value={s.currencySymbol}
                onChangeText={(v) => setS((p) => ({ ...p, currencySymbol: v }))}
                placeholder="₹"
                testID="app-currency"
              />
              <AppTextField
                label="Low Stock Threshold"
                value={String(s.lowStockThreshold)}
                onChangeText={(v) =>
                  setS((p) => ({ ...p, lowStockThreshold: Number(v) || 0 }))
                }
                keyboardType="number-pad"
                placeholder="3"
                testID="app-lowstock"
              />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Features</Text>
            <ToggleRow
              label="Enable PDF Invoice generation"
              value={s.enablePdfInvoice}
              onChange={(v) => setS((p) => ({ ...p, enablePdfInvoice: v }))}
              testID="app-pdf"
            />
            <ToggleRow
              label="Enable WhatsApp share"
              value={s.enableWhatsappShare}
              onChange={(v) => setS((p) => ({ ...p, enableWhatsappShare: v }))}
              testID="app-whatsapp"
            />
            <ToggleRow
              label="Show low-stock alerts on dashboard"
              value={s.enableLowStockAlerts}
              onChange={(v) => setS((p) => ({ ...p, enableLowStockAlerts: v }))}
              testID="app-alerts"
            />
            <ToggleRow
              label="Allow staff to view profit"
              value={s.enableStaffProfitView}
              onChange={(v) => setS((p) => ({ ...p, enableStaffProfitView: v }))}
              testID="app-staffprofit"
              danger
            />
          </View>

          <PrimaryButton
            label="Save Settings"
            onPress={onSave}
            loading={saving}
            testID="app-save"
            leftIcon={
              <MaterialCommunityIcons name="content-save-outline" size={16} color="#FFFFFF" />
            }
          />

          {status ? <Text style={styles.status}>{status}</Text> : null}

          <View style={{ height: spacing.xxxl }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <AdminBottomNav />
    </SafeAreaView>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  testID,
  danger,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID?: string;
  danger?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, danger && { color: colors.error }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: danger ? colors.error : colors.brandPrimary }}
        testID={testID}
      />
    </View>
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
  cardTitle: { fontSize: fontSize.base, fontWeight: "800", color: colors.onSurface },
  helper: { fontSize: fontSize.xs, color: colors.muted, marginTop: 4 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  toggleLabel: { flex: 1, fontSize: fontSize.sm, color: colors.onSurface, fontWeight: "600" },
  status: {
    marginTop: spacing.md,
    color: colors.success,
    fontWeight: "700",
    textAlign: "center",
  },
});
