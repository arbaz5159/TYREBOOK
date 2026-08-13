// Admin OEM Editor — Super-Admin-only screen for editing a single row of
// the global OEM fitment database. Sends the caller's Firebase ID token
// as a Bearer to the FastAPI backend which verifies it against the
// Firebase JWKS + SUPER_ADMIN_EMAILS allow-list before persisting.

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import {
  getFirebaseIdToken,
  oemAdminAuditList,
  oemAdminGet,
  oemAdminUpdate,
  OEM_UNCATEGORISED_LABEL,
  type OemAuditEntry,
  type OemFitment,
} from "@/src/api/oem";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

interface FormState {
  category: string;
  make: string;
  model: string;
  variant: string;
  year_generation: string;
  front_tyre_size: string;
  rear_tyre_size: string;
  verification_status: string;
  oem_evidence: string;
  oem_source_url: string;
}

function toForm(f: OemFitment): FormState {
  return {
    category: f.category ?? "",
    make: f.make ?? "",
    model: f.model ?? "",
    variant: f.variant ?? "",
    year_generation: f.year_generation ?? "",
    front_tyre_size: f.front_tyre_size ?? "",
    rear_tyre_size: f.rear_tyre_size ?? "",
    verification_status: f.verification_status ?? "",
    oem_evidence: f.oem_evidence ?? "",
    oem_source_url: f.oem_source_url ?? "",
  };
}

export default function AdminOemEditor() {
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [record, setRecord] = useState<OemFitment | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<OemAuditEntry[] | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await oemAdminGet(id);
      setRecord(r);
      setForm(toForm(r));
      // Best-effort audit fetch (requires token — only super_admin).
      try {
        const token = await getFirebaseIdToken();
        const a = await oemAdminAuditList(token, { fitment_id: id, page_size: 20 });
        setAudit(a.rows);
      } catch {
        setAudit([]);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load record");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;
  if (user.role !== "super_admin") return <Redirect href="/(tabs)/dashboard" />;

  const dirty =
    !!record &&
    !!form &&
    (Object.keys(form) as (keyof FormState)[]).some(
      (k) => (form[k] ?? "") !== ((record[k as keyof OemFitment] as string | null) ?? ""),
    );

  const onChange = (k: keyof FormState, v: string) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const onSave = async () => {
    if (!form || !id) return;
    if (!form.make.trim() || !form.model.trim()) {
      Alert.alert("Missing fields", "Make and Model are required.");
      return;
    }
    if (!form.front_tyre_size.trim() || !form.rear_tyre_size.trim()) {
      Alert.alert("Missing fields", "Both front and rear tyre size are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = await getFirebaseIdToken();
      // Send blank category as empty string — router coerces to null → the
      // row moves back to the "Uncategorised" bucket if intended.
      const patch: Partial<OemFitment> = {
        category: form.category.trim(),
        make: form.make.trim(),
        model: form.model.trim(),
        variant: form.variant.trim(),
        year_generation: form.year_generation.trim(),
        front_tyre_size: form.front_tyre_size.trim(),
        rear_tyre_size: form.rear_tyre_size.trim(),
        verification_status: form.verification_status.trim(),
        oem_evidence: form.oem_evidence.trim(),
        oem_source_url: form.oem_source_url.trim(),
      };
      const res = await oemAdminUpdate(id, patch, token);
      if (res.unchanged) {
        Alert.alert("No changes", "The record already matched the entered values.");
      } else {
        Alert.alert(
          "Saved",
          `Updated fields: ${res.changed?.join(", ") || "—"}`,
          [{ text: "OK", onPress: () => router.back() }],
        );
      }
      setRecord(res.fitment);
      setForm(toForm(res.fitment));
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Loading OEM record…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!form || !record) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingWrap}>
          <MaterialCommunityIcons name="alert-circle" size={40} color={colors.error} />
          <Text style={styles.loadingText}>{error || "Record not found"}</Text>
          <PrimaryButton label="Back" variant="ghost" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="oem-edit-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Edit OEM Fitment</Text>
          <Text style={styles.sub} numberOfLines={1}>
            #{record.no ?? "—"} · id {record.id.slice(0, 8)}…
          </Text>
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View style={styles.errorBox}>
            <MaterialCommunityIcons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {record._category_review_required ? (
          <View style={styles.reviewNotice}>
            <MaterialCommunityIcons name="flag" size={16} color="#8D4F00" />
            <Text style={styles.reviewNoticeText}>
              This record has no category in the master file — it&apos;s marked as
              &quot;{OEM_UNCATEGORISED_LABEL}&quot;. Add a category below to clear the review flag.
            </Text>
          </View>
        ) : null}

        <Section title="Classification">
          <Field label="Category" value={form.category} onChange={(v) => onChange("category", v)}
            placeholder="e.g. SUV, Motorcycle (blank ⇒ Uncategorised)" testID="oem-edit-category" />
          <Field label="Make" value={form.make} onChange={(v) => onChange("make", v)} required
            testID="oem-edit-make" />
          <Field label="Model" value={form.model} onChange={(v) => onChange("model", v)} required
            testID="oem-edit-model" />
          <Field label="Variant" value={form.variant} onChange={(v) => onChange("variant", v)}
            placeholder="(optional — leave blank if not specified)" testID="oem-edit-variant" />
          <Field label="Year / Generation" value={form.year_generation}
            onChange={(v) => onChange("year_generation", v)} testID="oem-edit-year" />
        </Section>

        <Section title="OEM Tyre Sizes">
          <Field label="Front tyre size" value={form.front_tyre_size}
            onChange={(v) => onChange("front_tyre_size", v)} required
            placeholder="e.g. 215/60 R17" testID="oem-edit-front" />
          <Field label="Rear tyre size" value={form.rear_tyre_size}
            onChange={(v) => onChange("rear_tyre_size", v)} required
            placeholder="e.g. 215/60 R17" testID="oem-edit-rear" />
          {form.front_tyre_size !== form.rear_tyre_size ? (
            <View style={styles.diffNote}>
              <MaterialCommunityIcons name="swap-horizontal" size={14} color={colors.brandSecondary} />
              <Text style={styles.diffNoteText}>
                Front and rear differ — vehicle-search UI will render them separately.
              </Text>
            </View>
          ) : null}
        </Section>

        <Section title="Verification">
          <Field label="Verification status" value={form.verification_status}
            onChange={(v) => onChange("verification_status", v)}
            placeholder="e.g. OEM VERIFIED" testID="oem-edit-status" />
          <Field label="OEM evidence" value={form.oem_evidence}
            onChange={(v) => onChange("oem_evidence", v)}
            multiline placeholder="e.g. Owner's manual page ref"
            testID="oem-edit-evidence" />
          <Field label="OEM source URL" value={form.oem_source_url}
            onChange={(v) => onChange("oem_source_url", v)}
            placeholder="https://…" keyboardType="url"
            testID="oem-edit-url" />
        </Section>

        {audit && audit.length > 0 ? (
          <Section title="Audit history">
            {audit.map((a) => (
              <View key={a.id} style={styles.auditRow}>
                <MaterialCommunityIcons
                  name={
                    a.action === "edit"
                      ? "pencil"
                      : a.action === "import-insert"
                        ? "plus-circle-outline"
                        : "swap-horizontal"
                  }
                  size={16}
                  color={colors.brandSecondary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.auditAction}>
                    {a.action.toUpperCase()} · {a.changed_fields.join(", ") || "—"}
                  </Text>
                  <Text style={styles.auditMeta}>
                    {a.actor_email ?? "unknown"} · {new Date(a.timestamp).toLocaleString()}
                  </Text>
                </View>
              </View>
            ))}
          </Section>
        ) : null}

        <View style={{ height: spacing.md }} />
        <PrimaryButton
          label={saving ? "Saving…" : dirty ? "Save changes" : "No changes to save"}
          onPress={onSave}
          disabled={!dirty || saving}
          testID="oem-edit-save"
        />
        <View style={{ height: spacing.sm }} />
        <PrimaryButton
          label="Cancel"
          variant="ghost"
          onPress={() => router.back()}
        />
        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  keyboardType?: "default" | "url" | "email-address";
  testID?: string;
}) {
  const { label, value, onChange, placeholder, required, multiline, keyboardType, testID } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label} {required ? <Text style={{ color: colors.error }}>*</Text> : null}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={label.includes("URL") ? "none" : "sentences"}
        autoCorrect={false}
        style={[styles.input, multiline && styles.inputMultiline]}
        testID={testID}
      />
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
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  loadingText: { color: colors.muted, fontSize: fontSize.sm },

  errorBox: {
    marginBottom: spacing.md,
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

  reviewNotice: {
    flexDirection: "row",
    padding: spacing.md,
    backgroundColor: "#FFF3D6",
    borderRadius: radius.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: "#F5D794",
  },
  reviewNoticeText: { flex: 1, color: "#8D4F00", fontSize: fontSize.xs, lineHeight: 16 },

  section: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.brandSecondary,
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  field: { marginBottom: spacing.md },
  fieldLabel: { fontSize: fontSize.xs, color: colors.muted, marginBottom: 4, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "ios" ? spacing.md : spacing.sm,
    fontSize: fontSize.base,
    color: colors.onSurface,
    backgroundColor: colors.surface,
    minHeight: 44,
  },
  inputMultiline: { minHeight: 72, textAlignVertical: "top" },

  diffNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.sm,
  },
  diffNoteText: { color: colors.onBrandTertiary, fontSize: fontSize.xs, flex: 1 },

  auditRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  auditAction: { fontSize: fontSize.xs, fontWeight: "700", color: colors.onSurface },
  auditMeta: { fontSize: 10, color: colors.muted, marginTop: 2 },
});
