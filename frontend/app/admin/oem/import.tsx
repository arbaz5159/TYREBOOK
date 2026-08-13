// Admin OEM Import — Super-Admin-only screen that lets the platform
// owner upload a new master workbook, preview the diff against the
// current MongoDB collection, then commit the changes. All writes are
// authenticated by Firebase ID token and audit-logged server-side.

import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/PrimaryButton";
import { useAuth } from "@/src/context/AuthContext";
import {
  getFirebaseIdToken,
  oemAdminImportCommit,
  oemAdminImportPreview,
  type OemImportPreview,
  type OemImportCommitResult,
} from "@/src/api/oem";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

interface PickedFile {
  uri: string;
  name: string;
  type: string;
  size?: number;
}

export default function AdminOemImport() {
  const router = useRouter();
  const { user } = useAuth();

  const [file, setFile] = useState<PickedFile | null>(null);
  const [preview, setPreview] = useState<OemImportPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [commitResult, setCommitResult] = useState<OemImportCommitResult | null>(null);

  if (!user) return null;
  if (user.role !== "super_admin") return <Redirect href="/(tabs)/dashboard" />;

  const pickFile = async () => {
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "*/*",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      if (!a.name.toLowerCase().endsWith(".xlsx")) {
        Alert.alert("Wrong file type", "Please pick a .xlsx workbook.");
        return;
      }
      setFile({
        uri: a.uri,
        name: a.name,
        type: a.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: a.size,
      });
      setPreview(null);
      setCommitResult(null);
    } catch (e: any) {
      setError(e?.message || "Failed to pick file");
    }
  };

  const runPreview = async () => {
    if (!file) return;
    setPreviewing(true);
    setError(null);
    setCommitResult(null);
    try {
      const token = await getFirebaseIdToken();
      const r = await oemAdminImportPreview(file, token);
      setPreview(r);
      if (!r.ok && r.error) {
        setError(r.error);
      }
    } catch (e: any) {
      setError(e?.message || "Preview failed");
    } finally {
      setPreviewing(false);
    }
  };

  const runCommit = async () => {
    if (!file || !preview || !preview.ok) return;
    const willInsert = preview.counts.new_rows ?? 0;
    const willOverwrite = overwrite ? preview.counts.conflicts : 0;
    const willSkip = overwrite ? 0 : preview.counts.conflicts;

    Alert.alert(
      "Confirm import",
      `This will INSERT ${willInsert} new rows` +
        (overwrite
          ? ` and OVERWRITE ${willOverwrite} existing rows.`
          : ` and SKIP ${willSkip} conflicting rows.`) +
        `\n\nCurrent DB has ${
          preview.counts.excel_rows_on_disk
            ? "an existing catalogue"
            : "no rows"
        } — this action is audit-logged and cannot be silently undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Import now",
          style: "destructive",
          onPress: async () => {
            setCommitting(true);
            setError(null);
            try {
              const token = await getFirebaseIdToken();
              const r = await oemAdminImportCommit(file, overwrite, token);
              setCommitResult(r);
            } catch (e: any) {
              setError(e?.message || "Commit failed");
            } finally {
              setCommitting(false);
            }
          },
        },
      ],
    );
  };

  const hasInvalid = (preview?.invalid_rows.length ?? 0) > 0;
  const canCommit = !!preview && preview.ok && !hasInvalid && !committing;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="oem-import-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Import OEM Master</Text>
          <Text style={styles.sub}>Preview → confirm → commit</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>1. Pick .xlsx workbook</Text>
          <Text style={styles.cardHint}>
            The file must contain the same 12 columns as the original master. Rows missing Make, Model,
            Front tyre or Rear tyre are rejected.
          </Text>
          <TouchableOpacity style={styles.pickerBtn} onPress={pickFile} testID="oem-import-pick">
            <MaterialCommunityIcons name="file-upload-outline" size={22} color={colors.brand} />
            <Text style={styles.pickerBtnText}>
              {file ? file.name : "Choose file…"}
            </Text>
          </TouchableOpacity>
          {file && file.size ? (
            <Text style={styles.fileMeta}>
              {(file.size / 1024).toFixed(1)} KB
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>2. Preview diff</Text>
          <PrimaryButton
            label={previewing ? "Analysing…" : "Preview"}
            onPress={runPreview}
            disabled={!file || previewing}
            testID="oem-import-preview"
          />
          {error ? (
            <View style={styles.errorBox}>
              <MaterialCommunityIcons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {preview ? (
            <View style={{ marginTop: spacing.md }}>
              {!preview.ok ? (
                <View style={styles.errorBox}>
                  <MaterialCommunityIcons name="alert" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{preview.error || "Preview failed"}</Text>
                </View>
              ) : (
                <>
                  <SummaryRow
                    icon="table"
                    label="Excel rows"
                    value={preview.counts.excel_rows_on_disk}
                  />
                  <SummaryRow
                    icon="plus-circle-outline"
                    label="Brand-new rows"
                    value={preview.counts.new_rows ?? 0}
                    tint="#DFF3EA"
                    fg="#0F7B4C"
                  />
                  <SummaryRow
                    icon="swap-horizontal"
                    label="Conflicts (row already exists but differs)"
                    value={preview.counts.conflicts}
                    tint="#FFF3D6"
                    fg="#8D4F00"
                  />
                  <SummaryRow
                    icon="content-copy"
                    label="Duplicates inside file"
                    value={preview.counts.duplicates_within_file}
                  />
                  <SummaryRow
                    icon="close-octagon-outline"
                    label="Invalid rows"
                    value={preview.counts.invalid}
                    tint="#FFDAD6"
                    fg="#B3261E"
                  />

                  {preview.invalid_rows.length > 0 ? (
                    <View style={styles.detailBlock}>
                      <Text style={styles.detailTitle}>Invalid rows</Text>
                      {preview.invalid_rows.slice(0, 8).map((r) => (
                        <Text key={r.row} style={styles.detailLine}>
                          Row {r.row}: missing {r.missing.join(", ")}
                        </Text>
                      ))}
                      {preview.invalid_rows.length > 8 ? (
                        <Text style={styles.detailLine}>
                          … +{preview.invalid_rows.length - 8} more
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  {preview.conflicts.length > 0 ? (
                    <View style={styles.detailBlock}>
                      <Text style={styles.detailTitle}>First 5 conflicts</Text>
                      {preview.conflicts.slice(0, 5).map((c) => (
                        <Text key={c.row} style={styles.detailLine} numberOfLines={2}>
                          Row {c.row}: {c.diff_fields.join(", ")}
                        </Text>
                      ))}
                    </View>
                  ) : null}

                  {preview.new_rows.length > 0 ? (
                    <View style={styles.detailBlock}>
                      <Text style={styles.detailTitle}>First 5 new rows</Text>
                      {preview.new_rows.slice(0, 5).map((n) => (
                        <Text key={n.row} style={styles.detailLine} numberOfLines={2}>
                          Row {n.row}: {n.make} {n.model} · {n.variant || "—"} · {n.front_tyre_size}/{n.rear_tyre_size}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </>
              )}
            </View>
          ) : null}
        </View>

        {preview && preview.ok ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>3. Commit to database</Text>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Overwrite conflicting rows</Text>
                <Text style={styles.switchHint}>
                  Off = new rows added, conflicts skipped for manual review.{"\n"}
                  On = new rows added AND conflicts replaced with the incoming values.
                </Text>
              </View>
              <Switch
                value={overwrite}
                onValueChange={setOverwrite}
                testID="oem-import-overwrite-toggle"
              />
            </View>
            <PrimaryButton
              label={committing ? "Importing…" : "Commit import"}
              onPress={runCommit}
              disabled={!canCommit}
              testID="oem-import-commit"
            />
            {hasInvalid ? (
              <Text style={styles.blockedNote}>
                Invalid rows must be fixed before commit is allowed.
              </Text>
            ) : null}
          </View>
        ) : null}

        {commitResult ? (
          <View style={[styles.card, styles.successCard]}>
            <MaterialCommunityIcons name="check-circle" size={28} color={colors.success} />
            <Text style={styles.successTitle}>Import complete</Text>
            <Text style={styles.successLine}>Added: {commitResult.added}</Text>
            <Text style={styles.successLine}>Overwritten: {commitResult.overwritten}</Text>
            <Text style={styles.successLine}>
              Skipped (awaiting review): {commitResult.skipped_conflicts_awaiting_review}
            </Text>
            <Text style={styles.successLine}>
              Final record count: {commitResult.final_count}
            </Text>
            <PrimaryButton
              label="Back to OEM viewer"
              onPress={() => router.replace("/admin/oem")}
              testID="oem-import-done"
            />
          </View>
        ) : null}

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  tint,
  fg,
}: {
  icon: any;
  label: string;
  value: number;
  tint?: string;
  fg?: string;
}) {
  return (
    <View style={[styles.summary, tint ? { backgroundColor: tint } : null]}>
      <MaterialCommunityIcons name={icon} size={18} color={fg ?? colors.onSurface} />
      <Text style={[styles.summaryLabel, fg ? { color: fg } : null]}>{label}</Text>
      <Text style={[styles.summaryValue, fg ? { color: fg } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: "#0F172A",
    gap: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  title: { fontSize: fontSize.lg, fontWeight: "700", color: "#FFFFFF" },
  sub: { fontSize: fontSize.xs, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  scroll: { padding: spacing.lg },

  card: {
    padding: spacing.md,
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface, marginBottom: 4 },
  cardHint: { fontSize: fontSize.xs, color: colors.muted, marginBottom: spacing.md, lineHeight: 16 },

  pickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brand,
    borderStyle: "dashed",
    backgroundColor: colors.brandTertiary,
  },
  pickerBtnText: { color: colors.brand, fontWeight: "700", fontSize: fontSize.base, flex: 1 },
  fileMeta: { fontSize: fontSize.xs, color: colors.muted, marginTop: 6 },

  errorBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: "#FFEDEA",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#F5C0B9",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  errorText: { flex: 1, color: colors.error, fontSize: fontSize.sm },

  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: 6,
    backgroundColor: colors.surfaceSecondary,
  },
  summaryLabel: { flex: 1, fontSize: fontSize.sm, color: colors.onSurface, fontWeight: "500" },
  summaryValue: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },

  detailBlock: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  detailTitle: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: colors.brandSecondary,
    marginBottom: 4,
  },
  detailLine: { fontSize: fontSize.xs, color: colors.onSurface, lineHeight: 18 },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  switchLabel: { fontSize: fontSize.sm, fontWeight: "700", color: colors.onSurface },
  switchHint: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2, lineHeight: 15 },
  blockedNote: { color: colors.error, fontSize: fontSize.xs, marginTop: spacing.sm, textAlign: "center" },

  successCard: {
    alignItems: "center",
    borderColor: colors.success,
    borderWidth: 1.5,
    padding: spacing.lg,
  },
  successTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.success, marginTop: spacing.sm },
  successLine: { fontSize: fontSize.sm, color: colors.onSurface, marginTop: 4 },
});
