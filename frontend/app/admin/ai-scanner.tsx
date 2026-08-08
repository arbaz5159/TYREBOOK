// AI Invoice Scanner settings — model choice, monthly scan limit, autofill toggle.
// Persisted to AsyncStorage under `tyrebook.aiConfig`.

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
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
import { storage } from "@/src/utils/storage";

interface AiConfig {
  model: string;
  monthlyLimit: number;
  autoLinkTyres: boolean;
  requireOwnerReview: boolean;
  defaultGstPercent: number;
}

const KEY = "tyrebook.aiConfig";

const MODELS = [
  { value: "gpt-4o-mini", label: "GPT-4o mini · Fast" },
  { value: "gpt-4o", label: "GPT-4o · Accurate" },
  { value: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
] as const;

const DEFAULT_CONFIG: AiConfig = {
  model: "gpt-4o-mini",
  monthlyLimit: 100,
  autoLinkTyres: true,
  requireOwnerReview: true,
  defaultGstPercent: 18,
};

export default function AiScannerSettings() {
  const router = useRouter();
  const { user } = useAuth();
  const [cfg, setCfg] = useState<AiConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const hydrate = useCallback(async () => {
    const raw = await storage.getItem<string | null>(KEY, null);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      setCfg({ ...DEFAULT_CONFIG, ...parsed });
    } catch {
      // ignore
    }
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
      await storage.setItem(KEY, JSON.stringify(cfg));
      setStatus("AI Scanner settings saved.");
    } catch (e: any) {
      setStatus("Failed to save: " + (e?.message ?? ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AdminHeader title="AI Invoice Scanner" subtitle="Configure OCR intelligence" />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <MaterialCommunityIcons name="text-recognition" size={30} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.heroTitle}>Smart Purchase Scanner</Text>
              <Text style={styles.heroHint}>
                Extracts supplier, invoice #, brand, size, quantity & prices from a photo.
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Model</Text>
            <Text style={styles.helper}>
              GPT-4o mini is fastest & cheapest. Use GPT-4o or Claude for messy handwriting.
            </Text>
            <View style={{ marginTop: spacing.sm }}>
              <ChipRow
                options={MODELS.map((m) => ({ value: m.value, label: m.label }))}
                value={cfg.model}
                onChange={(v) => setCfg((c) => ({ ...c, model: v as string }))}
                testIDPrefix="ai-model"
              />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Limits & Defaults</Text>
            <View style={{ marginTop: spacing.sm }}>
              <AppTextField
                label="Monthly scan limit"
                value={String(cfg.monthlyLimit)}
                onChangeText={(v) =>
                  setCfg((c) => ({ ...c, monthlyLimit: Number(v) || 0 }))
                }
                keyboardType="number-pad"
                placeholder="100"
                testID="ai-limit"
              />
              <AppTextField
                label="Default GST % applied to scan"
                value={String(cfg.defaultGstPercent)}
                onChangeText={(v) =>
                  setCfg((c) => ({ ...c, defaultGstPercent: Number(v) || 0 }))
                }
                keyboardType="numeric"
                placeholder="18"
                testID="ai-gst"
              />
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Auto-link to existing tyres</Text>
                <Text style={styles.helper}>
                  Match scanned brand + size to inventory and increment stock automatically.
                </Text>
              </View>
              <Switch
                value={cfg.autoLinkTyres}
                onValueChange={(v) => setCfg((c) => ({ ...c, autoLinkTyres: v }))}
                trackColor={{ true: colors.brandPrimary }}
                testID="ai-autolink"
              />
            </View>
            <View style={[styles.switchRow, { marginTop: spacing.md }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Require Owner review before save</Text>
                <Text style={styles.helper}>
                  Staff scans stay as drafts until Owner approves.
                </Text>
              </View>
              <Switch
                value={cfg.requireOwnerReview}
                onValueChange={(v) =>
                  setCfg((c) => ({ ...c, requireOwnerReview: v }))
                }
                trackColor={{ true: colors.brandPrimary }}
                testID="ai-review"
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.testLink}
            onPress={() => router.push("/smart-purchase")}
            testID="ai-test-link"
          >
            <MaterialCommunityIcons name="camera-outline" size={18} color={colors.brandPrimary} />
            <Text style={styles.testLinkText}>Open Smart Purchase Scanner</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
          </TouchableOpacity>

          <PrimaryButton
            label="Save Settings"
            onPress={onSave}
            loading={saving}
            testID="ai-save"
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onBrandTertiary },
  heroHint: { fontSize: fontSize.xs, color: colors.onBrandTertiary, marginTop: 2, opacity: 0.85 },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: fontSize.base, fontWeight: "800", color: colors.onSurface },
  helper: { fontSize: fontSize.xs, color: colors.muted, marginTop: 4 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  switchLabel: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.onSurface,
  },
  testLink: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  testLinkText: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.onSurface,
  },
  status: {
    marginTop: spacing.md,
    color: colors.success,
    fontWeight: "700",
    textAlign: "center",
  },
});
