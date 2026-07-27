import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/src/components/EmptyState";
import { CATEGORY_MAP, type VehicleCategoryId, type Tyre } from "@/src/constants/inventory";
import { deleteTyre, listTyres } from "@/src/firebase/inventory";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

const LOW_STOCK_THRESHOLD = 3;

export default function CategoryTyres() {
  const { category } = useLocalSearchParams<{ category: VehicleCategoryId }>();
  const router = useRouter();
  const cat = category ? CATEGORY_MAP[category] : undefined;
  const [items, setItems] = useState<Tyre[]>([]);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    if (!category) return;
    setItems(await listTyres(category));
  }, [category]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter((t) =>
      [t.brand, t.model, t.size, t.rackNumber]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(query)),
    );
  }, [items, q]);

  const onDelete = async (id: string) => {
    await deleteTyre(id);
    load();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.title}>{cat?.name ?? "Tyres"}</Text>
          <Text style={styles.sub}>{items.length} SKUs</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push({ pathname: "/inventory/tyre-form", params: { category } })}
          style={styles.addBtn}
          testID="category-add-tyre"
        >
          <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search brand, model, size, rack…"
          placeholderTextColor={colors.muted}
          style={styles.search}
          testID="tyre-search-input"
        />
        {q ? (
          <TouchableOpacity onPress={() => setQ("")} testID="clear-search">
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          title="No tyres yet"
          message="Add your first SKU for this category."
          icon={<MaterialCommunityIcons name="package-variant-closed" size={40} color={colors.brandPrimary} />}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => {
            const low = (item.currentStock ?? 0) <= LOW_STOCK_THRESHOLD;
            return (
              <View style={styles.row} testID={`tyre-${item.id}`}>
                <View style={styles.rowIcon}>
                  <MaterialCommunityIcons name="tire" size={24} color={colors.brandPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.brand} · {item.model}</Text>
                  <Text style={styles.rowSub}>
                    {item.size} · {item.tubeType} · {item.construction} · {item.plyRating}PR
                  </Text>
                  <Text style={styles.rowMeta}>
                    ₹{item.sellingPrice.toLocaleString("en-IN")} · Rack {item.rackNumber}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.stock, low && { color: colors.error }]}>
                    {item.currentStock}
                  </Text>
                  <Text style={styles.stockLabel}>in stock</Text>
                  <View style={{ flexDirection: "row", marginTop: spacing.xs }}>
                    <TouchableOpacity
                      onPress={() =>
                        router.push({ pathname: "/inventory/tyre-form", params: { id: item.id } })
                      }
                      style={styles.miniBtn}
                      testID={`edit-tyre-${item.id}`}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.brandPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => onDelete(item.id)}
                      style={[styles.miniBtn, { marginLeft: 6 }]}
                      testID={`delete-tyre-${item.id}`}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
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
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  rowTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: fontSize.xs, color: colors.onSurfaceSecondary, marginTop: 2 },
  rowMeta: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  stock: { fontSize: fontSize.lg, fontWeight: "800", color: colors.brandPrimary },
  stockLabel: { fontSize: 10, color: colors.muted },
  miniBtn: {
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
