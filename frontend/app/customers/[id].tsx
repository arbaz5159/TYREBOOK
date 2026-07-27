import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/src/components/EmptyState";
import { listSalesForCustomer } from "@/src/firebase/sales";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";
import type { Sale } from "@/src/constants/inventory";

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function CustomerDetail() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const [items, setItems] = useState<Sale[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setItems(await listSalesForCustomer(id));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const total = items.reduce((s, x) => s + (x.totalValue ?? 0), 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.title}>{name ?? "Customer"}</Text>
          <Text style={styles.sub}>{id} · Total ₹{total.toLocaleString("en-IN")}</Text>
        </View>
      </View>

      {items.length === 0 ? (
        <EmptyState
          title="No purchase history"
          message="Sales for this customer will appear here."
          icon={<MaterialCommunityIcons name="history" size={40} color={colors.brandPrimary} />}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <MaterialCommunityIcons name="tire" size={22} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.brand} {item.model} · {item.size}</Text>
                <Text style={styles.rowSub}>Qty {item.quantity} · {item.paymentMode} · {fmtDate(item.date)}</Text>
              </View>
              <Text style={styles.amt}>₹{item.totalValue.toLocaleString("en-IN")}</Text>
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
  amt: { fontSize: fontSize.base, fontWeight: "800", color: colors.brandPrimary },
});
