import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/src/components/EmptyState";
import { listCustomers } from "@/src/firebase/sales";
import { balanceOf, listKhata } from "@/src/firebase/khata";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";
import type { Customer } from "@/src/constants/inventory";

interface Row {
  customer: Customer;
  balance: number;
}

function inr(n: number) {
  return "₹" + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export default function KhataHome() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const customers = await listCustomers();
    const enriched: Row[] = [];
    for (const c of customers) {
      const entries = await listKhata(c.id);
      enriched.push({ customer: c, balance: balanceOf(entries) });
    }
    // Sort: customers who owe first, then paid up, then no entries
    enriched.sort((a, b) => b.balance - a.balance);
    setRows(enriched);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = rows.filter((r) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      r.customer.name.toLowerCase().includes(s) || r.customer.mobileNumber.includes(s)
    );
  });

  const totalDue = rows.reduce((s, r) => s + (r.balance > 0 ? r.balance : 0), 0);
  const totalAdvance = rows.reduce((s, r) => s + (r.balance < 0 ? -r.balance : 0), 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.title}>KhataBook</Text>
          <Text style={styles.sub}>Customer ledger</Text>
        </View>
      </View>

      <View style={styles.summary}>
        <View style={[styles.pill, { backgroundColor: "#FFDAD6" }]}>
          <Text style={styles.pillLabel}>To Receive</Text>
          <Text style={[styles.pillValue, { color: colors.error }]}>{inr(totalDue)}</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: "#D6F3E0" }]}>
          <Text style={styles.pillLabel}>Advances</Text>
          <Text style={[styles.pillValue, { color: colors.success }]}>{inr(totalAdvance)}</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search by name or mobile…"
          placeholderTextColor={colors.muted}
          style={styles.search}
          testID="khata-search"
        />
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          title="No customer ledger"
          message="Ledger entries auto-appear when you record a credit sale."
          icon={<MaterialCommunityIcons name="book-account-outline" size={40} color={colors.brandPrimary} />}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.customer.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => {
            const owes = item.balance > 0;
            const isZero = item.balance === 0;
            return (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({
                    pathname: "/khata/[id]",
                    params: { id: item.customer.id, name: item.customer.name },
                  })
                }
                testID={`khata-row-${item.customer.id}`}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(item.customer.name || "?").slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.customer.name || "Unknown"}</Text>
                  <Text style={styles.rowSub}>{item.customer.mobileNumber} · {item.customer.saleCount} sales</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={[
                      styles.amt,
                      { color: isZero ? colors.muted : owes ? colors.error : colors.success },
                    ]}
                  >
                    {isZero ? "Cleared" : (owes ? "OWES " : "ADV ") + inr(item.balance)}
                  </Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
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
  summary: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  pill: {
    flex: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  pillLabel: { fontSize: fontSize.xs, color: colors.onSurfaceSecondary },
  pillValue: { fontSize: fontSize.xl, fontWeight: "800", marginTop: 2 },
  searchWrap: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    height: 44,
  },
  search: { flex: 1, color: colors.onSurface, fontSize: fontSize.base, paddingVertical: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  avatarText: { color: colors.onBrandTertiary, fontWeight: "800", fontSize: fontSize.lg },
  rowTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  amt: { fontSize: fontSize.base, fontWeight: "800" },
});
