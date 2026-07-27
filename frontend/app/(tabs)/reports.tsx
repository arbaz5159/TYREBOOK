import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChipRow } from "@/src/components/ChipRow";
import { listPurchases } from "@/src/firebase/purchase";
import { listSales } from "@/src/firebase/sales";
import { listTyres } from "@/src/firebase/inventory";
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

  useEffect(() => {
    load();
  }, [load]);

  const sFiltered = sales.filter((s) => withinRange(s.date, range));
  const pFiltered = purchases.filter((p) => withinRange(p.date, range));

  const totalSales = sFiltered.reduce((a, b) => a + (b.totalValue ?? 0), 0);
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
          <Row icon="trending-down" label="Total Purchases" value={inr(totalPurchase)} tint="#FFEAD1" />
          <Row icon="cash-multiple" label="Estimated Profit" value={inr(profit)} tint="#D6F3E0" />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Khata Balance</Text>
          <Row icon="account-cash-outline" label="Pending Credit" value={inr(pendingKhata)} tint="#FFDAD6" />
        </View>

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
