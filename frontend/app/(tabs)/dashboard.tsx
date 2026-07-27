import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/context/AuthContext";
import { listPurchases } from "@/src/firebase/purchase";
import { listSales, listCustomers } from "@/src/firebase/sales";
import { listTyres } from "@/src/firebase/inventory";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

interface Stats {
  todayPurchase: number;
  todaySales: number;
  todayProfit: number;
  totalStock: number;
  pendingKhata: number;
  lowStock: number;
  customerCount: number;
}

const ZERO: Stats = {
  todayPurchase: 0,
  todaySales: 0,
  todayProfit: 0,
  totalStock: 0,
  pendingKhata: 0,
  lowStock: 0,
  customerCount: 0,
};

const LOW_STOCK_THRESHOLD = 3;

function isToday(ts?: number) {
  if (!ts) return false;
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function inr(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>(ZERO);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [purchases, sales, tyres, customers] = await Promise.all([
      listPurchases(),
      listSales(),
      listTyres(),
      listCustomers(),
    ]);
    const todayPurchase = purchases
      .filter((p) => isToday(p.date))
      .reduce((s, p) => s + (p.totalValue ?? 0), 0);
    const todaySales = sales
      .filter((s) => isToday(s.date))
      .reduce((sum, s) => sum + (s.totalValue ?? 0), 0);
    const todayProfit = sales
      .filter((s) => isToday(s.date))
      .reduce((sum, s) => {
        const tyre = tyres.find((t) => t.id === s.linkedTyreId);
        const cost = (tyre?.purchasePrice ?? 0) * s.quantity;
        return sum + ((s.sellingPrice * s.quantity) - cost);
      }, 0);
    const pendingKhata = sales
      .filter((s) => s.paymentMode === "Credit")
      .reduce((sum, s) => sum + (s.totalValue ?? 0), 0);
    const totalStock = tyres.reduce((s, t) => s + (t.currentStock ?? 0), 0);
    const lowStock = tyres.filter((t) => (t.currentStock ?? 0) <= LOW_STOCK_THRESHOLD).length;

    setStats({
      todayPurchase,
      todaySales,
      todayProfit,
      totalStock,
      pendingKhata,
      lowStock,
      customerCount: customers.length,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Sticky header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Namaste 👋</Text>
          <Text style={styles.name} testID="dashboard-user-name">
            {user?.displayName ?? "Shop Owner"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/language")}
          style={styles.iconBtn}
          testID="open-language-switcher"
        >
          <MaterialCommunityIcons name="translate" size={22} color={colors.onSurface} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Hero KPI: Today's Sales */}
        <View style={styles.hero} testID="hero-todays-sales">
          <View style={styles.heroTop}>
            <Text style={styles.heroLabel}>Today&apos;s Sales</Text>
            <MaterialCommunityIcons name="trending-up" size={22} color={colors.onSurfaceInverse} />
          </View>
          <Text style={styles.heroValue}>{inr(stats.todaySales)}</Text>
          <View style={styles.heroSubRow}>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>Profit</Text>
              <Text style={styles.heroPillValue}>{inr(stats.todayProfit)}</Text>
            </View>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>Purchase</Text>
              <Text style={styles.heroPillValue}>{inr(stats.todayPurchase)}</Text>
            </View>
          </View>
        </View>

        {/* KPI grid */}
        <View style={styles.grid}>
          <KpiCard
            icon="package-variant"
            label="Total Stock"
            value={String(stats.totalStock)}
            tint={colors.brandTertiary}
            testID="kpi-total-stock"
          />
          <KpiCard
            icon="account-cash-outline"
            label="Pending Khata"
            value={inr(stats.pendingKhata)}
            tint="#FFEAD1"
            testID="kpi-pending-khata"
          />
          <KpiCard
            icon="alert-decagram-outline"
            label="Low Stock"
            value={String(stats.lowStock)}
            tint="#FFDAD6"
            testID="kpi-low-stock"
            tone={stats.lowStock > 0 ? "danger" : "default"}
          />
          <KpiCard
            icon="account-group-outline"
            label="Customers"
            value={String(stats.customerCount)}
            tint="#DCE7FF"
            testID="kpi-customers"
          />
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actions}>
          <QuickAction
            icon="cart-plus"
            label="New Sale"
            onPress={() => router.push("/sales/new")}
            testID="qa-new-sale"
          />
          <QuickAction
            icon="cart-arrow-down"
            label="New Purchase"
            onPress={() => router.push("/purchase/new")}
            testID="qa-new-purchase"
          />
          <QuickAction
            icon="plus-box-outline"
            label="Add Tyre"
            onPress={() => router.push("/inventory/tyre-form")}
            testID="qa-add-tyre"
          />
          <QuickAction
            icon="account-multiple-outline"
            label="Customers"
            onPress={() => router.push("/customers")}
            testID="qa-customers"
          />
        </View>

        {user?.role === "owner" ? (
          <TouchableOpacity
            style={styles.adminBanner}
            onPress={() => router.push("/admin")}
            testID="open-admin-panel"
          >
            <MaterialCommunityIcons name="shield-crown-outline" size={24} color={colors.onBrandPrimary} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.adminTitle}>Owner Admin Panel</Text>
              <Text style={styles.adminSub}>Manage master data, users, GST & backups</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.onBrandPrimary} />
          </TouchableOpacity>
        ) : null}

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>

      {/* FAB — Quick Bill */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/sales/new")}
        testID="fab-quick-bill"
        activeOpacity={0.9}
      >
        <MaterialCommunityIcons name="receipt-text-plus-outline" size={22} color="#FFFFFF" />
        <Text style={styles.fabText}>Quick Bill</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tint,
  testID,
  tone = "default",
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
  tint: string;
  testID?: string;
  tone?: "default" | "danger";
}) {
  return (
    <View style={styles.kpi} testID={testID}>
      <View style={[styles.kpiIcon, { backgroundColor: tint }]}>
        <MaterialCommunityIcons
          name={icon}
          size={22}
          color={tone === "danger" ? colors.error : colors.onBrandTertiary}
        />
      </View>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, tone === "danger" && { color: colors.error }]}>{value}</Text>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity style={styles.qa} onPress={onPress} activeOpacity={0.85} testID={testID}>
      <View style={styles.qaIcon}>
        <MaterialCommunityIcons name={icon} size={22} color={colors.brandPrimary} />
      </View>
      <Text style={styles.qaLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
  },
  hello: { fontSize: fontSize.sm, color: colors.muted },
  name: { fontSize: fontSize.xl, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  hero: {
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroLabel: { color: colors.onSurfaceInverse, fontSize: fontSize.base, opacity: 0.8 },
  heroValue: {
    color: "#FFFFFF",
    fontSize: fontSize.display,
    fontWeight: "800",
    marginTop: spacing.sm,
  },
  heroSubRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  heroPill: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: radius.md,
    padding: spacing.md,
  },
  heroPillText: { color: "rgba(255,255,255,0.7)", fontSize: fontSize.xs },
  heroPillValue: { color: "#FFFFFF", fontSize: fontSize.lg, fontWeight: "700", marginTop: 2 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  kpi: {
    width: "48%",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  kpiIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  kpiLabel: { fontSize: fontSize.sm, color: colors.onSurfaceSecondary },
  kpiValue: { fontSize: fontSize.xl, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.onSurface,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  qa: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  qaIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  qaLabel: { fontSize: fontSize.sm, color: colors.onSurface, fontWeight: "600", flex: 1 },
  adminBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  adminTitle: { color: "#FFFFFF", fontSize: fontSize.base, fontWeight: "700" },
  adminSub: { color: "rgba(255,255,255,0.8)", fontSize: fontSize.xs, marginTop: 2 },
  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    elevation: 6,
  },
  fabText: { color: "#FFFFFF", fontWeight: "700", fontSize: fontSize.base },
});
