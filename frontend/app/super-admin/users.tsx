import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { collection, getDocs } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/src/components/EmptyState";
import { useAuth } from "@/src/context/AuthContext";
import { getDb } from "@/src/firebase/config";
import { listAllShops, type Shop } from "@/src/firebase/shops";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

// Super Admin — platform-wide user browser.
//
// Reads the EXISTING top-level `users/{uid}` collection (no new
// collections are created) and shows every account, its role, its shop
// membership, and last-login timestamp. Read-only; role changes must go
// through Firestore directly (or a future admin action). This screen is
// hard-gated to `super_admin` role — non-super-admins hitting the URL
// are redirected to /(tabs)/settings.

type PlatformRole = "super_admin" | "shop_admin" | "staff" | "unknown";

interface PlatformUser {
  uid: string;
  email: string | null;
  name: string | null;
  role: PlatformRole;
  shopId: string | null;
  active: boolean;
  lastLoginAt?: any;
  createdAt?: any;
}

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

const ROLE_BADGE: Record<PlatformRole, { bg: string; fg: string; label: string }> = {
  super_admin: { bg: "#0F172A", fg: "#FFFFFF", label: "Super Admin" },
  shop_admin: { bg: "#DDEBFF", fg: "#0A56C4", label: "Shop Admin" },
  staff: { bg: "#DFF3EA", fg: "#0F7B4C", label: "Staff" },
  unknown: { bg: "#EAEAEA", fg: "#555555", label: "Unknown" },
};

export default function SuperAdminUsers() {
  const router = useRouter();
  const { user } = useAuth();
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [shops, setShops] = useState<Record<string, Shop>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const db = getDb();
      const [snap, allShops] = await Promise.all([
        db ? getDocs(collection(db, "users")) : Promise.resolve(null),
        listAllShops(),
      ]);
      const byId: Record<string, Shop> = {};
      for (const s of allShops) byId[s.id] = s;
      setShops(byId);

      const list: PlatformUser[] = snap
        ? snap.docs.map((d) => {
            const data = d.data() as any;
            const rawRole = data.role;
            const role: PlatformRole =
              rawRole === "super_admin" || rawRole === "shop_admin" || rawRole === "staff"
                ? rawRole
                : rawRole === "owner"
                  ? "shop_admin"
                  : "unknown";
            return {
              uid: d.id,
              email: data.email ?? null,
              name: data.name ?? data.displayName ?? null,
              role,
              shopId: typeof data.shopId === "string" ? data.shopId : null,
              active: data.active !== false,
              lastLoginAt: data.lastLoginAt,
              createdAt: data.createdAt,
            };
          })
        : [];
      // Newest first.
      list.sort((a, b) => (toMs(b.createdAt) ?? 0) - (toMs(a.createdAt) ?? 0));
      setUsers(list);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      (u.email ?? "").toLowerCase().includes(q) ||
      (u.name ?? "").toLowerCase().includes(q) ||
      (u.shopId ?? "").toLowerCase().includes(q) ||
      (shops[u.shopId ?? ""]?.name ?? "").toLowerCase().includes(q),
    );
  }, [users, query, shops]);

  const kpi = useMemo(() => {
    const superAdmins = users.filter((u) => u.role === "super_admin").length;
    const shopAdmins = users.filter((u) => u.role === "shop_admin").length;
    const staff = users.filter((u) => u.role === "staff").length;
    return { total: users.length, superAdmins, shopAdmins, staff };
  }, [users]);

  // Guards ---------------------------------------------------------------
  if (!user) return null;
  if (user.role !== "super_admin") return <Redirect href="/(tabs)/settings" />;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="platform-users-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.title}>Platform Users</Text>
          <Text style={styles.sub}>
            {kpi.total} total · {kpi.superAdmins} super · {kpi.shopAdmins} owners · {kpi.staff} staff
          </Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by email, name, shop…"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          testID="platform-users-search"
          autoCapitalize="none"
        />
      </View>

      {loading && users.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={styles.body}>Loading users…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={query ? "No matches" : "No platform users yet"}
          message={query ? "Try a different search term." : "Users appear here after they sign up."}
          icon={<MaterialCommunityIcons name="account-search-outline" size={44} color={colors.brandPrimary} />}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.uid}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => {
            const badge = ROLE_BADGE[item.role];
            const shopName = item.shopId ? shops[item.shopId]?.name ?? item.shopId : "—";
            return (
              <View style={styles.row} testID={`platform-user-${item.uid}`}>
                <View style={styles.rowIcon}>
                  <MaterialCommunityIcons
                    name={
                      item.role === "super_admin"
                        ? "shield-star-outline"
                        : item.role === "shop_admin"
                          ? "crown"
                          : "account-tie"
                    }
                    size={20}
                    color={colors.brandPrimary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {item.name || item.email || "Unknown user"}
                    </Text>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {item.email ?? "—"}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {item.role === "super_admin" ? "Platform" : `Shop: ${shopName}`} · Joined {fmtDate(item.createdAt)}
                    {item.active ? "" : " · Disabled"}
                  </Text>
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
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: "#0F172A",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: fontSize.xl, fontWeight: "800", color: "#FFFFFF" },
  sub: { fontSize: fontSize.xs, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: spacing.xl,
    marginVertical: spacing.md,
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    gap: spacing.sm,
  },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: fontSize.base },
  body: { fontSize: fontSize.base, color: colors.muted },
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
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rowTitle: { flex: 1, fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: fontSize.xs, color: colors.onSurfaceSecondary, marginTop: 2 },
  rowMeta: { fontSize: 11, color: colors.muted, marginTop: 4 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
});
