import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
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
import { EmptyState } from "@/src/components/EmptyState";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import {
  addKhataEntry,
  balanceOf,
  deleteKhataEntry,
  listKhata,
  type KhataDirection,
  type KhataEntry,
} from "@/src/firebase/khata";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

function inr(n: number) {
  return "₹" + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function CustomerLedger() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const [entries, setEntries] = useState<KhataEntry[]>([]);
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<KhataDirection>("credit");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setEntries(await listKhata(id));
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const balance = balanceOf(entries);

  const submit = async () => {
    const amt = Number(amount);
    if (!amt) return;
    if (!id) return;
    setSaving(true);
    try {
      await addKhataEntry({
        customerId: id,
        customerName: name ?? id,
        direction,
        amount: Math.abs(amt),
        note: note.trim(),
        reference: "",
        date: Date.now(),
      });
      setAmount("");
      setNote("");
      setDirection("credit");
      await load();
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
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.title}>{name ?? "Customer"}</Text>
          <Text style={styles.sub}>{id}</Text>
        </View>
      </View>

      <View
        style={[
          styles.balanceCard,
          {
            backgroundColor:
              balance === 0
                ? colors.surfaceSecondary
                : balance > 0
                ? "#FFDAD6"
                : "#D6F3E0",
          },
        ]}
        testID="khata-balance"
      >
        <Text style={styles.balanceLabel}>
          {balance === 0 ? "All Settled" : balance > 0 ? "Customer owes you" : "Advance with you"}
        </Text>
        <Text
          style={[
            styles.balanceValue,
            { color: balance === 0 ? colors.muted : balance > 0 ? colors.error : colors.success },
          ]}
        >
          {inr(balance)}
        </Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.section}>Add Entry</Text>

          <ChipRow
            options={[
              { value: "credit", label: "Gave Credit (You Get)" },
              { value: "payment", label: "Received Payment" },
            ]}
            value={direction}
            onChange={setDirection}
            testIDPrefix="khata-direction"
          />

          <View style={{ marginTop: spacing.md }}>
            <AppTextField
              label="Amount (₹)"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0"
              testID="khata-amount"
            />
            <AppTextField
              label="Note"
              value={note}
              onChangeText={setNote}
              placeholder="Optional"
              testID="khata-note"
            />
            <PrimaryButton
              label={direction === "credit" ? "Add Credit" : "Add Payment"}
              onPress={submit}
              loading={saving}
              testID="khata-submit"
            />
          </View>

          <Text style={styles.section}>History</Text>

          {entries.length === 0 ? (
            <EmptyState
              title="No entries yet"
              message="Record credit given or payment received."
              icon={<MaterialCommunityIcons name="book-open-page-variant-outline" size={40} color={colors.brandPrimary} />}
            />
          ) : (
            entries.map((e) => {
              const owes = e.direction === "credit";
              return (
                <View key={e.id} style={styles.entry} testID={`khata-entry-${e.id}`}>
                  <View
                    style={[
                      styles.entryIcon,
                      { backgroundColor: owes ? "#FFDAD6" : "#D6F3E0" },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={owes ? "arrow-up-bold" : "arrow-down-bold"}
                      size={20}
                      color={owes ? colors.error : colors.success}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.entryTitle}>
                      {owes ? "Credit given" : "Payment received"}
                    </Text>
                    <Text style={styles.entrySub}>
                      {fmtDate(e.date)}
                      {e.note ? ` · ${e.note}` : ""}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.entryAmt,
                      { color: owes ? colors.error : colors.success },
                    ]}
                  >
                    {owes ? "+" : "-"}
                    {inr(e.amount)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => deleteKhataEntry(e.id).then(load)}
                    testID={`khata-delete-${e.id}`}
                    style={styles.trash}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.error} />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
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
  sub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  balanceCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: "center",
  },
  balanceLabel: { fontSize: fontSize.sm, color: colors.onSurfaceSecondary },
  balanceValue: { fontSize: fontSize.display, fontWeight: "800", marginTop: 4 },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  section: {
    fontSize: fontSize.base,
    fontWeight: "800",
    color: colors.onSurface,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  entryIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  entryTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  entrySub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  entryAmt: { fontSize: fontSize.base, fontWeight: "800", marginHorizontal: spacing.sm },
  trash: { padding: 4 },
});
