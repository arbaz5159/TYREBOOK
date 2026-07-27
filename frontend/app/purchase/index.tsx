import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/src/components/EmptyState";
import { CATEGORY_MAP, type Purchase } from "@/src/constants/inventory";
import { deletePurchase, listPurchases } from "@/src/firebase/purchase";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

function inr(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function PurchaseHistory() {
  const router = useRouter();
  const [items, setItems] = useState<Purchase[]>([]);

  const load = useCallback(async () => {
    setItems(await listPurchases());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const total = items.reduce((s, p) => s + (p.totalValue ?? 0), 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.title}>Purchases</Text>
          <Text style={styles.sub}>{items.length} entries · Total {inr(total)}</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/purchase/new")}
          style={styles.addBtn}
          testID="new-purchase-btn"
        >
          <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {items.length === 0 ? (
        <EmptyState
          title="No purchases yet"
          message="Record your first supplier purchase."
          icon={<MaterialCommunityIcons name="cart-arrow-down" size={40} color={colors.brandPrimary} />}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <View style={styles.row} testID={`purchase-${item.id}`}>
              <View style={styles.rowIcon}>
                <MaterialCommunityIcons name="cart-arrow-down" size={22} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.supplierName || "Supplier"} · #{item.invoiceNumber || "—"}</Text>
                <Text style={styles.rowSub}>
                  {CATEGORY_MAP[item.categoryId]?.name} · {item.brand} {item.model} · {item.size} · Qty {item.quantity}
                </Text>
                <Text style={styles.rowMeta}>{fmtDate(item.date)} · GST {item.gstPercent}%</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.amt}>{inr(item.totalValue)}</Text>
                <TouchableOpacity
                  onPress={async () => {
                    await deletePurchase(item.id);
                    load();
                  }}
                  style={styles.miniBtn}
                  testID={`delete-purchase-${item.id}`}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.error} />
                </TouchableOpacity>
              </View>
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
    flexDirection: "row",
    alignItems: "center",
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
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: fontSize.xl, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
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
  rowSub: { fontSize: fontSize.xs, color: colors.onSurfaceSecondary, marginTop: 2 },
  rowMeta: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  amt: { fontSize: fontSize.base, fontWeight: "800", color: colors.brandPrimary },
  miniBtn: {
    marginTop: spacing.xs,
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
