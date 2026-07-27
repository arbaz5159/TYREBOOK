import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChipRow } from "@/src/components/ChipRow";
import { listPurchases } from "@/src/firebase/purchase";
import { listSales } from "@/src/firebase/sales";
import { listTyres } from "@/src/firebase/inventory";
import { usePermissions } from "@/src/hooks/usePermissions";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

type Range = "today" | "week" | "month";

function inr(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
function withinRange(ts: number, r: Range) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  if (r === "today") {
    const d = new Date(ts);
    const n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }
  if (r === "week") return now - ts <= 7 * day;
  return now - ts <= 30 * day;
}

export default function Reports() {
  const perms = usePermissions();
  const [range, setRange] = useState<Range>("today");
  const [sales, setSales] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [tyres, setTyres] = useState<any[]>([]);

  const load = useCallback(async () => {
    const [s, p, t] = await Promise.all([listSales(), listPurchases(), listTyres()]);
    setSales(s);
    setPurchases(p);
    setTyres(t);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const sFiltered = sales.filter((s) => withinRange(s.date, range));
  const pFiltered = purchases.filter((p) => withinRange(p.date, range));

  const totalSales = sFiltered.reduce((a, b) => a + (b.totalValue ?? 0), 0);
  const retailSales = sFiltered
    .filter((s) => (s.customerType ?? "Retail") === "Retail")
    .reduce((a, b) => a + (b.totalValue ?? 0), 0);
  const wholesaleSales = sFiltered
    .filter((s) => s.customerType && s.customerType !== "Retail")
    .reduce((a, b) => a + (b.totalValue ?? 0), 0);
  const totalDiscount = sFiltered.reduce(
    (a, b) => a + (Number(b.discountAmount ?? 0) * Number(b.quantity ?? 0)),
    0,
  );
  const totalPurchase = pFiltered.reduce((a, b) => a + (b.totalValue ?? 0), 0);
  const gstCollected = sFiltered.reduce((a, b) => {
    const sub = b.sellingPrice * b.quantity;
    return a + (sub * (b.gstPercent ?? 0)) / 100;
  }, 0);
  const gstPaid = pFiltered.reduce((a, b) => {
    const sub = b.purchasePrice * b.quantity;
    return a + (sub * (b.gstPercent ?? 0)) / 100;
  }, 0);
  const pendingKhata = sales
    .filter((s) => s.paymentMode === "Credit")
    .reduce((a, b) => a + (b.totalValue ?? 0), 0);
  const profit = sFiltered.reduce((a, b) => {
    const tyre = tyres.find((t) => t.id === b.linkedTyreId);
    const cost = (tyre?.purchasePrice ?? 0) * b.quantity;
    return a + (b.sellingPrice * b.quantity - cost);
  }, 0);

  const salesByClass = (cls: "old" | "remould") =>
    sFiltered.filter((s) => s.tyreClass === cls);
  const oldSales = salesByClass("old").reduce((a, b) => a + (b.totalValue ?? 0), 0);
  const oldQty = salesByClass("old").reduce((a, b) => a + (b.quantity ?? 0), 0);
  const oldProfit = salesByClass("old").reduce((a, b) => {
    const tyre = tyres.find((t) => t.id === b.linkedTyreId);
    const cost = (tyre?.purchasePrice ?? 0) * b.quantity;
    return a + (b.sellingPrice * b.quantity - cost);
  }, 0);
  const remouldSales = salesByClass("remould").reduce((a, b) => a + (b.totalValue ?? 0), 0);
  const remouldQty = salesByClass("remould").reduce((a, b) => a + (b.quantity ?? 0), 0);
  const remouldProfit = salesByClass("remould").reduce((a, b) => {
    const tyre = tyres.find((t) => t.id === b.linkedTyreId);
    const cost = (tyre?.purchasePrice ?? 0) * b.quantity;
    return a + (b.sellingPrice * b.quantity - cost);
  }, 0);
  const oldStockCount = tyres
    .filter((t) => (t.tyreClass ?? "new") === "old")
    .reduce((a, b) => a + (b.currentStock ?? 0), 0);
  const remouldStockCount = tyres
    .filter((t) => (t.tyreClass ?? "new") === "remould")
    .reduce((a, b) => a + (b.currentStock ?? 0), 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.sub}>Sales, taxes & khata balances</Text>
      </View>

      <ChipRow
        options={[
          { value: "today", label: "Today" },
          { value: "week", label: "This Week" },
          { value: "month", label: "This Month" },
        ]}
        value={range}
        onChange={setRange}
        testIDPrefix="report-range"
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sales Overview</Text>
          <Row icon="trending-up" label="Total Sales" value={inr(totalSales)} tint={colors.brandTertiary} />
          <Row icon="storefront-outline" label="Retail Sales" value={inr(retailSales)} tint={colors.brandTertiary} />
          {perms.isOwner ? (
            <Row icon="warehouse" label="Wholesale + Dealer/Fleet/Govt" value={inr(wholesaleSales)} tint="#DCE7FF" />
          ) : null}
          {perms.isOwner ? (
            <Row icon="trending-down" label="Total Purchases" value={inr(totalPurchase)} tint="#FFEAD1" />
          ) : null}
          {perms.canViewProfit ? (
            <Row icon="cash-multiple" label="Estimated Profit" value={inr(profit)} tint="#D6F3E0" />
          ) : null}
          {perms.isOwner ? (
            <Row icon="sale" label="Total Discount Given" value={inr(totalDiscount)} tint="#FFDAD6" />
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Khata Balance</Text>
          <Row icon="account-cash-outline" label="Pending Credit" value={inr(pendingKhata)} tint="#FFDAD6" />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Old Tyres</Text>
          <Row icon="tire" label="Sales Value" value={inr(oldSales)} tint="#FFEAD1" />
          <Row icon="counter" label="Tyres Sold" value={String(oldQty)} tint="#FFEAD1" />
          <Row icon="package-variant" label="Current Stock" value={String(oldStockCount)} tint={colors.brandTertiary} />
          {perms.canViewProfit ? (
            <Row icon="cash-multiple" label="Old Tyre Profit" value={inr(oldProfit)} tint="#D6F3E0" />
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Remould Tyres</Text>
          <Row icon="recycle-variant" label="Sales Value" value={inr(remouldSales)} tint="#E9DAFF" />
          <Row icon="counter" label="Tyres Sold" value={String(remouldQty)} tint="#E9DAFF" />
          <Row icon="package-variant" label="Current Stock" value={String(remouldStockCount)} tint={colors.brandTertiary} />
          {perms.canViewProfit ? (
            <Row icon="cash-multiple" label="Remould Profit" value={inr(remouldProfit)} tint="#D6F3E0" />
          ) : null}
        </View>

        {perms.canManageGst ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tax Summary (GST)</Text>
            <Row icon="receipt" label="Output GST (Sales)" value={inr(gstCollected)} tint={colors.brandTertiary} />
            <Row icon="receipt-text-outline" label="Input GST (Purchase)" value={inr(gstPaid)} tint="#FFEAD1" />
            <Row
              icon="calculator-variant-outline"
              label="Net GST Payable"
              value={inr(Math.max(0, gstCollected - gstPaid))}
              tint="#DCE7FF"
            />
          </View>
        ) : null}

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  value,
  tint,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <View style={rowStyles.row}>
      <View style={[rowStyles.icon, { backgroundColor: tint }]}>
        <MaterialCommunityIcons name={icon} size={20} color={colors.onBrandTertiary} />
      </View>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: fontSize.base, color: colors.muted, marginTop: 2 },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  section: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.onSurface,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.xs,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  label: { flex: 1, color: colors.onSurface, fontSize: fontSize.base, fontWeight: "500" },
  value: { color: colors.onSurface, fontSize: fontSize.base, fontWeight: "800" },
});
