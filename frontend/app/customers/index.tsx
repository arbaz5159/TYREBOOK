import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/src/components/EmptyState";
import { listCustomers } from "@/src/firebase/sales";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";
import type { Customer } from "@/src/constants/inventory";

export default function Customers() {
  const router = useRouter();
  const [items, setItems] = useState<Customer[]>([]);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setItems(await listCustomers());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        c.mobileNumber.includes(s) ||
        (c.vehicleNumbers ?? []).some((v) => v.toLowerCase().includes(s)),
    );
  }, [items, q]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Customers</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search by name, mobile, vehicle…"
          placeholderTextColor={colors.muted}
          style={styles.search}
          testID="customer-search-input"
        />
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          title="No customers yet"
          message="Customers are added automatically when you record a sale."
          icon={<MaterialCommunityIcons name="account-multiple-outline" size={40} color={colors.brandPrimary} />}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.85}
              onPress={() =>
                router.push({ pathname: "/customers/[id]", params: { id: item.id, name: item.name } })
              }
              testID={`customer-${item.id}`}
            >
              <View style={styles.rowIcon}>
                <Text style={styles.initials}>
                  {(item.name || "?").slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.name || "Unknown"}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {item.mobileNumber} · {item.saleCount} sales
                </Text>
                {item.vehicleNumbers?.length ? (
                  <Text style={styles.rowMeta} numberOfLines={1}>{item.vehicleNumbers.join(" · ")}</Text>
                ) : null}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.amt}>₹{item.totalSpent.toLocaleString("en-IN")}</Text>
                <Text style={styles.stockLabel}>total</Text>
              </View>
            </TouchableOpacity>
          )}
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
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  initials: { color: colors.onBrandTertiary, fontWeight: "800", fontSize: fontSize.lg },
  rowTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: fontSize.xs, color: colors.onSurfaceSecondary, marginTop: 2 },
  rowMeta: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  amt: { fontSize: fontSize.base, fontWeight: "800", color: colors.brandPrimary },
  stockLabel: { fontSize: 10, color: colors.muted },
});
