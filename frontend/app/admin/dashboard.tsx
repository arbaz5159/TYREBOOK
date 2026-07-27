// Admin Dashboard — detailed KPIs and quick-access counters just for owner.
// Uses the same data sources as the main dashboard but shows admin-oriented
// metrics like inventory value, GST liability, top brand, staff count.

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AdminBottomNav } from "@/src/components/AdminBottomNav";
import { AdminHeader } from "@/src/components/AdminHeader";
import { useAuth } from "@/src/context/AuthContext";
import { listTyres } from "@/src/firebase/inventory";
import { listPurchases } from "@/src/firebase/purchase";
import { listSales, listCustomers } from "@/src/firebase/sales";
import { listUsers } from "@/src/firebase/users";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

interface Kpis {
  totalStock: number;
  stockValue: number;
  monthSales: number;
  monthPurchase: number;
  monthProfit: number;
  gstOut: number;
  gstIn: number;
  pendingKhata: number;
  topBrand: string;
  lowStockCount: number;
  ownerCount: number;
  staffCount: number;
  customerCount: number;
  oldStock: number;
  remouldStock: number;
}

const ZERO: Kpis = {
  totalStock: 0,
  stockValue: 0,
  monthSales: 0,
  monthPurchase: 0,
  monthProfit: 0,
  gstOut: 0,
  gstIn: 0,
  pendingKhata: 0,
  topBrand: "—",
  lowStockCount: 0,
  ownerCount: 0,
  staffCount: 0,
  customerCount: 0,
  oldStock: 0,
  remouldStock: 0,
};

function inr(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [k, setK] = useState<Kpis>(ZERO);

  const load = useCallback(async () => {
    try {
      const [tyres, sales, purchases, customers, users] = await Promise.all([
        listTyres(),
        listSales(),
        listPurchases(),
        listCustomers(),
        listUsers(),
      ]);
      const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const mSales = sales.filter((s) => s.date >= monthAgo);
      const mPurchases = purchases.filter((p) => p.date >= monthAgo);
      const monthSales = mSales.reduce((a, b) => a + (b.totalValue ?? 0), 0);
      const monthPurchase = mPurchases.reduce((a, b) => a + (b.totalValue ?? 0), 0);
      const monthProfit = mSales.reduce((a, s) => {
        const t = tyres.find((x) => x.id === s.linkedTyreId);
        return a + (s.sellingPrice * s.quantity - (t?.purchasePrice ?? 0) * s.quantity);
      }, 0);
      const gstOut = mSales.reduce(
        (a, s) => a + ((s.sellingPrice * s.quantity * (s.gstPercent ?? 0)) / 100),
        0,
      );
      const gstIn = mPurchases.reduce(
        (a, p) => a + ((p.purchasePrice * p.quantity * (p.gstPercent ?? 0)) / 100),
        0,
      );
      const pendingKhata = sales
        .filter((s) => s.paymentMode === "Credit")
        .reduce((a, b) => a + (b.totalValue ?? 0), 0);
      const totalStock = tyres.reduce((a, t) => a + (t.currentStock ?? 0), 0);
      const stockValue = tyres.reduce(
        (a, t) => a + (t.currentStock ?? 0) * (t.purchasePrice ?? 0),
        0,
      );
      const lowStockCount = tyres.filter(
        (t) => (t.currentStock ?? 0) <= (t.minStockAlert ?? 3),
      ).length;
      const oldStock = tyres
        .filter((t) => (t.tyreClass ?? "new") === "old")
        .reduce((a, b) => a + (b.currentStock ?? 0), 0);
      const remouldStock = tyres
        .filter((t) => (t.tyreClass ?? "new") === "remould")
        .reduce((a, b) => a + (b.currentStock ?? 0), 0);
      const byBrand: Record<string, number> = {};
      for (const s of mSales)
        byBrand[s.brand ?? "—"] = (byBrand[s.brand ?? "—"] ?? 0) + (s.totalValue ?? 0);
      const topBrand =
        Object.entries(byBrand).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
      const ownerCount = users.filter((u) => u.role === "owner").length;
      const staffCount = users.filter((u) => u.role === "staff").length;
      setK({
        totalStock,
        stockValue,
        monthSales,
        monthPurchase,
        monthProfit,
        gstOut,
        gstIn,
        pendingKhata,
        topBrand,
        lowStockCount,
        ownerCount,
        staffCount,
        customerCount: customers.length,
        oldStock,
        remouldStock,
      });
    } catch (e) {
      console.warn("[admin-dashboard] load error", e);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!user) return null; if (user.role !== "owner") return <Redirect href="/(tabs)/settings" />;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AdminHeader title="Admin Dashboard" subtitle="Last 30 days" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Section title="Business Health">
          <Row icon="cash-multiple" label="Sales · 30d" value={inr(k.monthSales)} tint="#DCE7FF" />
          <Row icon="cart-arrow-down" label="Purchases · 30d" value={inr(k.monthPurchase)} tint="#FFEAD1" />
          <Row icon="trending-up" label="Estimated Profit" value={inr(k.monthProfit)} tint="#D6F3E0" />
          <Row icon="account-cash-outline" label="Pending Khata" value={inr(k.pendingKhata)} tint="#FFDAD6" />
        </Section>

        <Section title="Inventory">
          <Row icon="package-variant" label="Total Tyres" value={String(k.totalStock)} tint="#CCE8E3" />
          <Row icon="currency-inr" label="Inventory Value" value={inr(k.stockValue)} tint="#CCE8E3" />
          <Row icon="tire" label="Old Tyre Stock" value={String(k.oldStock)} tint="#FFEAD1" />
          <Row icon="recycle" label="Remould Stock" value={String(k.remouldStock)} tint="#E9DAFF" />
          <Row
            icon="alert-decagram-outline"
            label="Low Stock Items"
            value={String(k.lowStockCount)}
            tint="#FFDAD6"
            tone={k.lowStockCount > 0 ? "danger" : "default"}
          />
        </Section>

        <Section title="Tax">
          <Row icon="receipt" label="Output GST" value={inr(k.gstOut)} tint="#CCE8E3" />
          <Row icon="receipt-text-outline" label="Input GST" value={inr(k.gstIn)} tint="#FFEAD1" />
          <Row
            icon="calculator-variant-outline"
            label="Net GST Payable"
            value={inr(Math.max(0, k.gstOut - k.gstIn))}
            tint="#DCE7FF"
          />
        </Section>

        <Section title="People">
          <Row icon="crown" label="Owners" value={String(k.ownerCount)} tint="#CCE8E3" />
          <Row icon="account-tie" label="Staff" value={String(k.staffCount)} tint="#DCE7FF" />
          <Row icon="account-group-outline" label="Customers" value={String(k.customerCount)} tint="#FFEAD1" />
          <Row icon="star-outline" label="Top Selling Brand" value={k.topBrand} tint="#E9DAFF" />
        </Section>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>

      <AdminBottomNav />
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  tint,
  tone = "default",
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
  tint: string;
  tone?: "default" | "danger";
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: tint }]}>
        <MaterialCommunityIcons
          name={icon}
          size={18}
          color={tone === "danger" ? colors.error : colors.onBrandTertiary}
        />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, tone === "danger" && { color: colors.error }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  section: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.onSurfaceSecondary,
    padding: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: 6,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  rowLabel: { flex: 1, color: colors.onSurface, fontSize: fontSize.base, fontWeight: "500" },
  rowValue: { color: colors.onSurface, fontSize: fontSize.base, fontWeight: "800" },
});
