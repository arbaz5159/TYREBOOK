import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChipRow } from "@/src/components/ChipRow";
import { EmptyState } from "@/src/components/EmptyState";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";
import { listSales } from "@/src/firebase/sales";
import type { Sale } from "@/src/constants/inventory";

type Filter = "all" | "today" | "credit";

function inr(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function isToday(ts: number) {
  const d = new Date(ts);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export default function Billing() {
  const router = useRouter();
  const [sales, setSales] = useState<Sale[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setSales(await listSales());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = sales.filter((s) => {
    if (filter === "today") return isToday(s.date);
    if (filter === "credit") return s.paymentMode === "Credit";
    return true;
  });

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Billing</Text>
        <TouchableOpacity
          onPress={() => router.push("/sales/new")}
          style={styles.headerBtn}
          testID="billing-new-sale"
        >
          <MaterialCommunityIcons name="plus" size={20} color={colors.onBrandPrimary} />
          <Text style={styles.headerBtnText}>New Bill</Text>
        </TouchableOpacity>
      </View>

      <ChipRow
        options={[
          { value: "all", label: "All Bills" },
          { value: "today", label: "Today" },
          { value: "credit", label: "Credit / Khata" },
        ]}
        value={filter}
        onChange={setFilter}
        testIDPrefix="bill-filter"
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No bills yet"
          message="Create your first sale to see it here."
          icon={<MaterialCommunityIcons name="receipt-text-outline" size={40} color={colors.brandPrimary} />}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <View style={styles.row} testID={`sale-${item.id}`}>
              <View style={styles.rowIcon}>
                <MaterialCommunityIcons name="receipt-text-outline" size={22} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.customerName || "Walk-in customer"}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {item.brand} {item.model} · {item.size} · Qty {item.quantity}
                </Text>
                <Text style={styles.rowMeta}>{fmtDate(item.date)} · {item.paymentMode}</Text>
              </View>
              <Text style={styles.amt}>{inr(item.totalValue)}</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    gap: spacing.xs,
  },
  headerBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: fontSize.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  rowTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: fontSize.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  rowMeta: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  amt: { fontSize: fontSize.base, fontWeight: "800", color: colors.brandPrimary, marginLeft: spacing.sm },
});
