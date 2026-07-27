import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChipRow } from "@/src/components/ChipRow";
import { TYRE_CLASSES, VEHICLE_CATEGORIES, type TyreClass } from "@/src/constants/inventory";
import { listTyres } from "@/src/firebase/inventory";
import { usePermissions } from "@/src/hooks/usePermissions";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

export default function InventoryHome() {
  const router = useRouter();
  const perms = usePermissions();
  const [tyreClass, setTyreClass] = useState<TyreClass>("new");
  const [counts, setCounts] = useState<Record<TyreClass, number>>({ new: 0, old: 0, remould: 0 });
  const [stockByCat, setStockByCat] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const all = await listTyres();
    const by: Record<TyreClass, number> = { new: 0, old: 0, remould: 0 };
    for (const t of all) by[(t.tyreClass ?? "new") as TyreClass] += t.currentStock ?? 0;
    setCounts(by);
    const byCat: Record<string, number> = {};
    for (const t of all) {
      if ((t.tyreClass ?? "new") !== tyreClass) continue;
      byCat[t.categoryId] = (byCat[t.categoryId] ?? 0) + (t.currentStock ?? 0);
    }
    setStockByCat(byCat);
  }, [tyreClass]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventory</Text>
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push("/search")}
            testID="open-search"
          >
            <MaterialCommunityIcons name="magnify" size={20} color={colors.onSurface} />
          </TouchableOpacity>
          {perms.canEditStock ? (
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => router.push({ pathname: "/inventory/tyre-form", params: { tyreClass } })}
              testID="inventory-add-tyre"
            >
              <MaterialCommunityIcons name="plus" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.headerBtnText}>Add Tyre</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ChipRow
        options={TYRE_CLASSES.map((c) => ({
          value: c.value,
          label: `${c.label} (${counts[c.value] ?? 0})`,
        }))}
        value={tyreClass}
        onChange={setTyreClass}
        testIDPrefix="inv-class"
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sub}>
          {tyreClass === "new"
            ? "Pick a vehicle category to manage stock"
            : `Manage ${tyreClass === "old" ? "old" : "remould"} tyre stock in / out`}
        </Text>
        <View style={styles.grid}>
          {VEHICLE_CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={styles.card}
              activeOpacity={0.85}
              onPress={() =>
                router.push({ pathname: "/inventory/[category]", params: { category: c.id, class: tyreClass } })
              }
              testID={`category-${c.id}`}
            >
              <View style={styles.cardIcon}>
                <MaterialCommunityIcons
                  name={c.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                  size={30}
                  color={colors.brandPrimary}
                />
              </View>
              <Text style={styles.cardTitle}>{c.name}</Text>
              <Text style={styles.cardHint}>{stockByCat[c.id] ?? 0} in stock · {c.hint}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {perms.canCreatePurchase ? (
          <TouchableOpacity
            style={styles.rowLink}
            onPress={() => router.push("/old-tyres")}
            testID="open-old-tyres"
          >
            <MaterialCommunityIcons name="tire" size={22} color={colors.brandPrimary} />
            <Text style={styles.rowLinkTitle}>Old Tyres · Car & Truck</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.rowLink}
          onPress={() => router.push("/remould")}
          testID="open-remould"
        >
          <MaterialCommunityIcons name="recycle-variant" size={22} color={colors.brandPrimary} />
          <Text style={styles.rowLinkTitle}>Remould Tyres · Bike/Truck/Tractor</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
        </TouchableOpacity>

        {perms.canCreatePurchase ? (
          <TouchableOpacity
            style={styles.rowLink}
            onPress={() => router.push("/purchase")}
            testID="open-purchase-history"
          >
            <MaterialCommunityIcons name="cart-arrow-down" size={22} color={colors.brandPrimary} />
            <Text style={styles.rowLinkTitle}>Purchase History</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
          </TouchableOpacity>
        ) : null}

        {perms.canCreatePurchase ? (
          <TouchableOpacity
            style={styles.rowLink}
            onPress={() => router.push("/smart-purchase")}
            testID="open-ai-scan"
          >
            <MaterialCommunityIcons name="text-recognition" size={22} color={colors.brandPrimary} />
            <Text style={styles.rowLinkTitle}>AI Invoice Scanner</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
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
  sub: {
    color: colors.muted,
    fontSize: fontSize.base,
    marginBottom: spacing.md,
  },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  card: {
    width: "48%",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  cardHint: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  rowLink: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.md,
  },
  rowLinkTitle: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.onSurface,
  },
});
