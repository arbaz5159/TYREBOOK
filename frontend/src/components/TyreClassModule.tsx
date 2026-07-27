// Shared UI for Old / Remould tyre modules. Filters existing `tyres`
// collection by tyreClass + a whitelist of allowed vehicle categories, shows
// per-sub-category totals (Stock, Sales, Profit) and inline Stock In/Out.

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChipRow } from "@/src/components/ChipRow";
import { EmptyState } from "@/src/components/EmptyState";
import {
  CATEGORY_MAP,
  type TyreClass,
  type VehicleCategoryId,
  type Tyre,
} from "@/src/constants/inventory";
import { listTyres } from "@/src/firebase/inventory";
import { listSales } from "@/src/firebase/sales";
import { recordMovement } from "@/src/firebase/stock";
import { usePermissions } from "@/src/hooks/usePermissions";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

interface Props {
  title: string;
  subtitle: string;
  tyreClass: TyreClass;
  categories: VehicleCategoryId[];
  testIDPrefix: string;
}

function inr(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export function TyreClassModule({ title, subtitle, tyreClass, categories, testIDPrefix }: Props) {
  const router = useRouter();
  const perms = usePermissions();
  const [category, setCategory] = useState<VehicleCategoryId>(categories[0]);
  const [tyres, setTyres] = useState<Tyre[]>([]);
  const [salesTotal, setSalesTotal] = useState(0);
  const [salesQty, setSalesQty] = useState(0);
  const [profitTotal, setProfitTotal] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [qtyInput, setQtyInput] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const list = await listTyres(category, tyreClass);
    setTyres(list);
    const sales = await listSales();
    const scoped = sales.filter(
      (s) => s.tyreClass === tyreClass && s.categoryId === category,
    );
    const total = scoped.reduce((a, b) => a + (b.totalValue ?? 0), 0);
    const qty = scoped.reduce((a, b) => a + (b.quantity ?? 0), 0);
    const profit = scoped.reduce((a, b) => {
      const tyre = list.find((t) => t.id === b.linkedTyreId);
      const cost = (tyre?.purchasePrice ?? 0) * b.quantity;
      return a + (b.sellingPrice * b.quantity - cost);
    }, 0);
    setSalesTotal(total);
    setSalesQty(qty);
    setProfitTotal(profit);
  }, [category, tyreClass]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const currentStock = tyres.reduce((s, t) => s + (t.currentStock ?? 0), 0);
  const stockValue = tyres.reduce(
    (s, t) => s + (t.currentStock ?? 0) * (t.purchasePrice ?? 0),
    0,
  );

  const move = async (t: Tyre, direction: "in" | "out") => {
    const q = Number(qtyInput[t.id]) || 1;
    if (!perms.canEditStock && direction === "in") return;
    setBusyId(t.id);
    try {
      await recordMovement({
        tyreId: t.id,
        direction,
        quantity: q,
        reason: direction === "in" ? "Maal Aaya" : "Maal Gaya",
      });
      setQtyInput((prev) => ({ ...prev, [t.id]: "" }));
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>{subtitle}</Text>
        </View>
        {perms.canEditStock ? (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push({ pathname: "/inventory/tyre-form", params: { tyreClass, category } })}
            testID={`${testIDPrefix}-add`}
          >
            <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        ) : null}
      </View>

      <ChipRow
        options={categories.map((c) => ({ value: c, label: CATEGORY_MAP[c].name }))}
        value={category}
        onChange={setCategory}
        testIDPrefix={`${testIDPrefix}-cat`}
      />

      <View style={styles.metrics}>
        <View style={[styles.metric, { backgroundColor: colors.brandTertiary }]}>
          <Text style={styles.mLabel}>Current Stock</Text>
          <Text style={styles.mValue}>{currentStock}</Text>
          <Text style={styles.mHint}>{inr(stockValue)}</Text>
        </View>
        <View style={[styles.metric, { backgroundColor: "#DCE7FF" }]}>
          <Text style={styles.mLabel}>Sales Value</Text>
          <Text style={styles.mValue}>{inr(salesTotal)}</Text>
          <Text style={styles.mHint}>{salesQty} tyre{salesQty === 1 ? "" : "s"} sold</Text>
        </View>
        {perms.canViewProfit ? (
          <View style={[styles.metric, { backgroundColor: "#D6F3E0" }]}>
            <Text style={styles.mLabel}>Profit</Text>
            <Text style={styles.mValue}>{inr(profitTotal)}</Text>
            <Text style={styles.mHint}>All-time</Text>
          </View>
        ) : null}
      </View>

      {tyres.length === 0 ? (
        <EmptyState
          title={`No ${title.toLowerCase()} in ${CATEGORY_MAP[category].name}`}
          message={perms.canEditStock ? "Tap + to add an item." : "Ask the owner to add an item."}
          icon={
            <MaterialCommunityIcons
              name={tyreClass === "old" ? "tire" : "recycle-variant"}
              size={40}
              color={colors.brandPrimary}
            />
          }
        />
      ) : (
        <FlatList
          data={tyres}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => {
            const low = (item.currentStock ?? 0) <= (item.minStockAlert ?? 3);
            const profitPerUnit = (item.sellingPrice ?? 0) - (item.purchasePrice ?? 0);
            return (
              <View style={styles.item} testID={`${testIDPrefix}-item-${item.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.iTitle}>
                    {item.brand}{item.size ? " · " + item.size : ""}
                  </Text>
                  <Text style={styles.iSub}>
                    Buy {inr(item.purchasePrice)} · Sell {inr(item.sellingPrice)}
                    {perms.canViewProfit && profitPerUnit > 0 ? ` · +${inr(profitPerUnit)}/unit` : ""}
                  </Text>
                </View>
                <View style={styles.stockCol}>
                  <Text style={[styles.stock, low && { color: colors.error }]}>
                    {item.currentStock}
                  </Text>
                  <Text style={styles.stockLabel}>in stock</Text>
                </View>
                <View style={styles.actions}>
                  <TextInput
                    value={qtyInput[item.id] ?? ""}
                    onChangeText={(v) => setQtyInput((p) => ({ ...p, [item.id]: v }))}
                    placeholder="Qty"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                    style={styles.qtyInput}
                    testID={`${testIDPrefix}-qty-${item.id}`}
                  />
                  <View style={{ flexDirection: "row", gap: spacing.xs, marginTop: 4 }}>
                    {perms.canEditStock ? (
                      <TouchableOpacity
                        style={[styles.mvBtn, { backgroundColor: colors.brandPrimary }]}
                        onPress={() => move(item, "in")}
                        disabled={busyId === item.id}
                        testID={`${testIDPrefix}-in-${item.id}`}
                      >
                        <MaterialCommunityIcons name="arrow-down-bold" size={14} color="#FFFFFF" />
                        <Text style={styles.mvText}>In</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.mvBtn, { backgroundColor: colors.error }]}
                      onPress={() => move(item, "out")}
                      disabled={busyId === item.id}
                      testID={`${testIDPrefix}-out-${item.id}`}
                    >
                      <MaterialCommunityIcons name="arrow-up-bold" size={14} color="#FFFFFF" />
                      <Text style={styles.mvText}>Out</Text>
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
  metrics: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  metric: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  mLabel: { fontSize: fontSize.xs, color: colors.onSurfaceSecondary },
  mValue: { fontSize: fontSize.xl, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
  mHint: { fontSize: 10, color: colors.muted, marginTop: 2 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  iTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  iSub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  stockCol: { alignItems: "center", width: 56 },
  stock: { fontSize: fontSize.xl, fontWeight: "800", color: colors.brandPrimary },
  stockLabel: { fontSize: 10, color: colors.muted },
  actions: { width: 112 },
  qtyInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontSize: fontSize.sm,
    color: colors.onSurface,
    textAlign: "center",
  },
  mvBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: radius.pill,
    gap: 2,
  },
  mvText: { color: "#FFFFFF", fontSize: fontSize.xs, fontWeight: "700" },
});
