// Professional Owner Admin Panel — hub screen.
// Material 3 style, grouped tiles for all 11 sections + live KPI strip.
// Staff users are redirected out immediately.

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AdminBottomNav } from "@/src/components/AdminBottomNav";
import { AdminHeader } from "@/src/components/AdminHeader";
import { useAuth } from "@/src/context/AuthContext";
import { listTyres } from "@/src/firebase/inventory";
import { listSales, listCustomers } from "@/src/firebase/sales";
import { listUsers } from "@/src/firebase/users";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface Tile {
  key: string;
  icon: IconName;
  label: string;
  hint: string;
  href: string;
  tint: string;
}

interface Group {
  title: string;
  tiles: Tile[];
}

const GROUPS: Group[] = [
  {
    title: "Overview",
    tiles: [
      {
        key: "dashboard",
        icon: "chart-box-outline",
        label: "Dashboard",
        hint: "Admin KPIs & health",
        href: "/admin/dashboard",
        tint: "#CCE8E3",
      },
      {
        key: "reports",
        icon: "file-chart-outline",
        label: "Reports",
        hint: "Sales · GST · Khata · Old / Remould",
        href: "/(tabs)/reports",
        tint: "#DCE7FF",
      },
    ],
  },
  {
    title: "Data",
    tiles: [
      {
        key: "master",
        icon: "database-outline",
        label: "Master Data",
        hint: "Brands · Models · Sizes · Categories",
        href: "/admin/master/brands",
        tint: "#CCE8E3",
      },
      {
        key: "inventory",
        icon: "package-variant-closed",
        label: "Inventory",
        hint: "New · Old · Remould stock",
        href: "/(tabs)/inventory",
        tint: "#FFEAD1",
      },
      {
        key: "pricing",
        icon: "sale",
        label: "Pricing",
        hint: "MRP · Company Price · Discounts",
        href: "/admin/pricing",
        tint: "#E9DAFF",
      },
    ],
  },
  {
    title: "People",
    tiles: [
      {
        key: "customers",
        icon: "account-multiple-outline",
        label: "Customers",
        hint: "View · Search · Ledgers",
        href: "/customers",
        tint: "#DCE7FF",
      },
      {
        key: "suppliers",
        icon: "truck-outline",
        label: "Suppliers",
        hint: "Add / edit vendors",
        href: "/admin/master/suppliers",
        tint: "#FFEAD1",
      },
      {
        key: "users",
        icon: "shield-account-outline",
        label: "Staff & Roles",
        hint: "Owner / staff · permissions",
        href: "/admin/users",
        tint: "#CCE8E3",
      },
    ],
  },
  {
    title: "Configuration",
    tiles: [
      {
        key: "shop",
        icon: "store-outline",
        label: "Billing & GST",
        hint: "GSTIN · shop details · invoice",
        href: "/admin/shop",
        tint: "#DCE7FF",
      },
      {
        key: "ai",
        icon: "text-recognition",
        label: "AI Invoice Scanner",
        hint: "Model · limits · defaults",
        href: "/admin/ai-scanner",
        tint: "#E9DAFF",
      },
      {
        key: "settings",
        icon: "tune-vertical",
        label: "App Settings",
        hint: "Language · alerts · defaults",
        href: "/admin/app-settings",
        tint: "#CCE8E3",
      },
    ],
  },
  {
    title: "System",
    tiles: [
      {
        key: "backup",
        icon: "database-sync-outline",
        label: "Backup & Restore",
        hint: "Export / import full DB",
        href: "/admin/backup",
        tint: "#FFEAD1",
      },
    ],
  },
];

interface Kpi {
  tyreCount: number;
  monthSales: number;
  customerCount: number;
  userCount: number;
}

function inr(n: number) {
  if (n >= 100000) return "₹" + (n / 100000).toFixed(1) + "L";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export default function AdminHome() {
  const router = useRouter();
  const { user } = useAuth();
  const [kpi, setKpi] = useState<Kpi>({
    tyreCount: 0,
    monthSales: 0,
    customerCount: 0,
    userCount: 0,
  });

  const load = useCallback(async () => {
    try {
      const [tyres, sales, customers, users] = await Promise.all([
        listTyres(),
        listSales(),
        listCustomers(),
        listUsers(),
      ]);
      const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const monthSales = sales
        .filter((s) => s.date >= monthAgo)
        .reduce((a, b) => a + (b.totalValue ?? 0), 0);
      setKpi({
        tyreCount: tyres.reduce((a, b) => a + (b.currentStock ?? 0), 0),
        monthSales,
        customerCount: customers.length,
        userCount: users.length,
      });
    } catch (e) {
      // Non-fatal — hub still works if a collection is missing
      console.warn("[admin] KPI load failed", e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (user && user.role !== "owner") {
    return <Redirect href="/(tabs)/settings" />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AdminHeader title="Admin Panel" subtitle={`Welcome, ${user?.displayName ?? "Owner"}`} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* KPI strip */}
        <View style={styles.kpiStrip} testID="admin-kpi-strip">
          <KpiPill
            icon="tire"
            label="Tyres in Stock"
            value={String(kpi.tyreCount)}
            tint="#CCE8E3"
          />
          <KpiPill
            icon="cash-multiple"
            label="Sales · 30d"
            value={inr(kpi.monthSales)}
            tint="#DCE7FF"
          />
          <KpiPill
            icon="account-multiple-outline"
            label="Customers"
            value={String(kpi.customerCount)}
            tint="#FFEAD1"
          />
          <KpiPill
            icon="account-key-outline"
            label="Users"
            value={String(kpi.userCount)}
            tint="#E9DAFF"
          />
        </View>

        {GROUPS.map((g) => (
          <View key={g.title} style={styles.group}>
            <Text style={styles.groupTitle}>{g.title}</Text>
            <View style={styles.grid}>
              {g.tiles.map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={styles.tile}
                  activeOpacity={0.85}
                  onPress={() => router.push(t.href as any)}
                  testID={`admin-tile-${t.key}`}
                >
                  <View style={[styles.tileIcon, { backgroundColor: t.tint }]}>
                    <MaterialCommunityIcons
                      name={t.icon}
                      size={22}
                      color={colors.onBrandTertiary}
                    />
                  </View>
                  <Text style={styles.tileLabel} numberOfLines={1}>
                    {t.label}
                  </Text>
                  <Text style={styles.tileHint} numberOfLines={2}>
                    {t.hint}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Sign out shortcut */}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      <AdminBottomNav />
    </SafeAreaView>
  );
}

function KpiPill({
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
    <View style={styles.kpi}>
      <View style={[styles.kpiIcon, { backgroundColor: tint }]}>
        <MaterialCommunityIcons name={icon} size={16} color={colors.onBrandTertiary} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  kpiStrip: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  kpi: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
  },
  kpiIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  kpiValue: {
    fontSize: fontSize.lg,
    fontWeight: "800",
    color: colors.onSurface,
  },
  kpiLabel: {
    fontSize: 10,
    color: colors.muted,
    marginTop: 2,
    textAlign: "center",
  },
  group: {
    marginBottom: spacing.lg,
  },
  groupTitle: {
    fontSize: fontSize.sm,
    fontWeight: "800",
    color: colors.onSurfaceSecondary,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  tile: {
    width: "48%",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    minHeight: 116,
  },
  tileIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  tileLabel: {
    fontSize: fontSize.base,
    fontWeight: "800",
    color: colors.onSurface,
  },
  tileHint: {
    fontSize: fontSize.xs,
    color: colors.muted,
    marginTop: 2,
  },
});
