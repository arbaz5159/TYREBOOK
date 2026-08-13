import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/src/components/EmptyState";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { useAuth } from "@/src/context/AuthContext";
import { effectiveStatus, listAllShops, type Shop } from "@/src/firebase/shops";
import { setActiveShopId } from "@/src/firebase/tenant";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

// Super Admin landing page. Lists every shop with its subscription status
// and lets the platform owner inspect any tenant or change status.

const STATUS_BADGE: Record<
  "trial" | "active" | "expired" | "suspended",
  { bg: string; fg: string; label: string; icon: any }
> = {
  trial:     { bg: "#DFF3EA", fg: "#0F7B4C", label: "Trial",     icon: "clock-outline" },
  active:    { bg: "#DDEBFF", fg: "#0A56C4", label: "Active",    icon: "check-circle-outline" },
  expired:   { bg: "#FFE1D6", fg: "#B14A20", label: "Expired",   icon: "clock-alert-outline" },
  suspended: { bg: "#FFDAD6", fg: "#B3261E", label: "Suspended", icon: "lock-outline" },
};

function toMs(ts?: any): number | null {
  if (ts == null) return null;
  if (typeof ts === "number") return ts;
  if (typeof ts === "object" && typeof ts.toDate === "function") return ts.toDate().getTime();
  if (typeof ts === "object" && typeof ts.seconds === "number") return ts.seconds * 1000;
  const n = Number(ts);
  return Number.isFinite(n) ? n : null;
}

function fmtDate(ts?: any): string {
  const ms = toMs(ts);
  if (ms == null) return "—";
  return new Date(ms).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysLeft(ts?: any): string {
  const ms = toMs(ts);
  if (ms == null) return "";
  const diff = Math.ceil((ms - Date.now()) / (24 * 60 * 60 * 1000));
  if (diff <= 0) return "expired";
  return `${diff} day${diff === 1 ? "" : "s"} left`;
}

export default function SuperAdminHome() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listAllShops();
      setShops(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  if (!user) return null;
  if (user.role !== "super_admin") return <Redirect href="/(tabs)/dashboard" />;

  const openShop = (shop: Shop) => {
    // Setting the active shop lets Super Admin drop into any tenant's
    // Dashboard / Inventory / Sales just like the Shop Admin would see.
    setActiveShopId(shop.id);
    router.push(`/super-admin/shop/${shop.id}`);
  };

  const trialCount = shops.filter((s) => effectiveStatus(s) === "trial").length;
  const activeCount = shops.filter((s) => effectiveStatus(s) === "active").length;
  const expiredCount = shops.filter((s) => effectiveStatus(s) === "expired").length;
  const suspendedCount = shops.filter((s) => effectiveStatus(s) === "suspended").length;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}>
            <MaterialCommunityIcons name="shield-star-outline" size={22} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Super Admin</Text>
            <Text style={styles.sub}>{shops.length} shops · {user.email}</Text>
          </View>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push("/admin/oem")}
            testID="super-open-oem"
          >
            <MaterialCommunityIcons name="database-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, { marginLeft: spacing.sm }]}
            onPress={() => router.push("/super-admin/users")}
            testID="super-open-users"
          >
            <MaterialCommunityIcons name="account-search-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, { marginLeft: spacing.sm }]}
            onPress={async () => {
              await signOut();
              router.replace("/(auth)/login");
            }}
            testID="super-logout"
          >
            <MaterialCommunityIcons name="logout" size={20} color={colors.error} />
          </TouchableOpacity>
        </View>

        <View style={styles.kpiRow}>
          <KpiPill label="Trial" value={trialCount} tint={STATUS_BADGE.trial.bg} fg={STATUS_BADGE.trial.fg} />
          <KpiPill label="Active" value={activeCount} tint={STATUS_BADGE.active.bg} fg={STATUS_BADGE.active.fg} />
          <KpiPill label="Expired" value={expiredCount} tint={STATUS_BADGE.expired.bg} fg={STATUS_BADGE.expired.fg} />
          <KpiPill label="Suspended" value={suspendedCount} tint={STATUS_BADGE.suspended.bg} fg={STATUS_BADGE.suspended.fg} />
        </View>
      </View>

      {loading && shops.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={styles.sub}>Loading shops…</Text>
        </View>
      ) : shops.length === 0 ? (
        <View style={{ padding: spacing.xl }}>
          <EmptyState
            title="No shops yet"
            message="When merchants sign up they'll appear here automatically. You can also invite them by sharing the signup link."
            icon={<MaterialCommunityIcons name="storefront-outline" size={44} color={colors.brandPrimary} />}
          />
          <View style={{ height: spacing.md }} />
          <PrimaryButton
            label="Return to my shop"
            variant="ghost"
            onPress={() => router.replace("/(tabs)/dashboard")}
            testID="super-return"
          />
        </View>
      ) : (
        <FlatList
          data={shops}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing.xxxl,
          }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => {
            const status = effectiveStatus(item);
            const badge = STATUS_BADGE[status];
            const expiresAt =
              item.status === "trial" ? item.trialEndsAt : item.planExpiresAt;
            return (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.85}
                onPress={() => openShop(item)}
                testID={`super-shop-${item.id}`}
              >
                <View style={styles.rowIcon}>
                  <MaterialCommunityIcons name="storefront-outline" size={22} color={colors.brandPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <MaterialCommunityIcons name={badge.icon} size={12} color={badge.fg} />
                      <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.rowSub} numberOfLines={1}>{item.ownerEmail} · {item.id}</Text>
                  <Text style={styles.rowMeta}>
                    Since {fmtDate(item.createdAt)}
                    {expiresAt ? `  ·  ${status === "trial" ? "Trial ends" : "Plan ends"} ${fmtDate(expiresAt)}` : ""}
                    {expiresAt && (status === "trial" || status === "active") ? `  ·  ${daysLeft(expiresAt)}` : ""}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function KpiPill({ label, value, tint, fg }: { label: string; value: number; tint: string; fg: string }) {
  return (
    <View style={[styles.kpi, { backgroundColor: tint }]}>
      <Text style={[styles.kpiValue, { color: fg }]}>{value}</Text>
      <Text style={[styles.kpiLabel, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: "#0F172A",
  },
  brandRow: { flexDirection: "row", alignItems: "center" },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  title: { fontSize: fontSize.xl, fontWeight: "800", color: "#FFFFFF" },
  sub: { fontSize: fontSize.xs, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  kpiRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  kpi: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
  },
  kpiValue: { fontSize: fontSize.xl, fontWeight: "800" },
  kpiLabel: { fontSize: fontSize.xs, fontWeight: "600", marginTop: 2 },
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
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  rowTitle: { flex: 1, fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: fontSize.xs, color: colors.onSurfaceSecondary, marginTop: 2 },
  rowMeta: { fontSize: 11, color: colors.muted, marginTop: 4 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
});
