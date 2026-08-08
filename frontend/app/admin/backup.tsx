import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/PrimaryButton";
import { useAuth } from "@/src/context/AuthContext";
import { getActiveShopId } from "@/src/firebase/tenant";
import { exportBackup, importBackup } from "@/src/firebase/master";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

export default function BackupRestore() {
  const router = useRouter();
  const { user } = useAuth();

  const [payload, setPayload] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;
  if (user.role === "staff") return <Redirect href="/(tabs)/settings" />;
  if (user.role === "super_admin" && !getActiveShopId()) return <Redirect href="/super-admin" />;

  const doExport = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const json = await exportBackup();
      setPayload(json);
      setStatus("Backup generated. Copy the text below.");
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await importBackup(payload);
      setStatus("Backup restored successfully.");
    } catch (e: any) {
      setStatus("Invalid backup JSON. " + (e?.message ?? ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Backup & Restore</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.actions}>
            <PrimaryButton
              label="Export Backup"
              onPress={doExport}
              loading={busy}
              leftIcon={<MaterialCommunityIcons name="database-export-outline" size={18} color="#FFFFFF" />}
              fullWidth={false}
              style={{ flex: 1, marginRight: spacing.sm }}
              testID="export-backup"
            />
            <PrimaryButton
              label="Restore"
              onPress={doImport}
              variant="secondary"
              loading={busy}
              leftIcon={<MaterialCommunityIcons name="database-import-outline" size={18} color={colors.onBrandTertiary} />}
              fullWidth={false}
              style={{ flex: 1, marginLeft: spacing.sm }}
              testID="import-backup"
            />
          </View>

          <Text style={styles.helper}>
            Copy the JSON below to save it. To restore, paste the JSON here and tap Restore.
          </Text>

          <TextInput
            value={payload}
            onChangeText={setPayload}
            style={styles.area}
            multiline
            placeholder="Backup JSON will appear here…"
            placeholderTextColor={colors.muted}
            testID="backup-textarea"
          />

          {status ? <Text style={styles.status}>{status}</Text> : null}
        </ScrollView>
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
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  actions: { flexDirection: "row" },
  helper: {
    marginTop: spacing.lg,
    color: colors.muted,
    fontSize: fontSize.sm,
  },
  area: {
    marginTop: spacing.md,
    minHeight: 240,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.onSurface,
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    textAlignVertical: "top",
    backgroundColor: colors.surface,
  },
  status: {
    marginTop: spacing.md,
    color: colors.success,
    fontWeight: "700",
  },
});
