// Admin OEM Audit Log — Super-Admin-only listing of every mutation
// (edit / import-insert / import-overwrite) with actor + timestamp +
// changed fields. Reads require a Firebase ID token because entries
// contain email PII.

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/src/components/EmptyState";
import { useAuth } from "@/src/context/AuthContext";
import {
  getFirebaseIdToken,
  oemAdminAuditList,
  type OemAuditEntry,
} from "@/src/api/oem";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

const PAGE_SIZE = 50;

export default function AdminOemAudit() {
  const router = useRouter();
  const { user } = useAuth();

  const [rows, setRows] = useState<OemAuditEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getFirebaseIdToken();
      const r = await oemAdminAuditList(token, { page, page_size: PAGE_SIZE });
      setRows(r.rows);
      setTotal(r.total);
    } catch (e: any) {
      setError(e?.message || "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;
  if (user.role !== "super_admin") return <Redirect href="/(tabs)/dashboard" />;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>OEM Audit Log</Text>
          <Text style={styles.sub}>
            {total > 0 ? `${total} entries` : loading ? "Loading…" : "No entries yet"}
          </Text>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <MaterialCommunityIcons name="alert-circle" size={18} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={load} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading && rows.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : rows.length === 0 ? (
        <View style={{ padding: spacing.xl }}>
          <EmptyState
            title="No audit entries"
            message="Every edit and import is recorded here. Once you make your first change you'll see it below."
            icon={<MaterialCommunityIcons name="history" size={44} color={colors.brand} />}
          />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
            setRefreshing(true); try { await load(); } finally { setRefreshing(false); }
          }} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                item.fitment_id
                  ? router.push({ pathname: "/admin/oem/[id]", params: { id: item.fitment_id } })
                  : null
              }
              activeOpacity={item.fitment_id ? 0.85 : 1}
              disabled={!item.fitment_id}
            >
              <View style={styles.rowIcon}>
                <MaterialCommunityIcons
                  name={
                    item.action === "edit"
                      ? "pencil-outline"
                      : item.action === "import-insert"
                        ? "plus-circle-outline"
                        : "swap-horizontal"
                  }
                  size={20}
                  color={colors.brandSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {item.action.toUpperCase()}
                  {item.changed_fields.length
                    ? `  ·  ${item.changed_fields.slice(0, 3).join(", ")}${item.changed_fields.length > 3 ? "…" : ""}`
                    : ""}
                </Text>
                <Text style={styles.rowSub}>
                  {item.actor_email ?? "unknown"} · {new Date(item.timestamp).toLocaleString()}
                </Text>
                {item.fitment_id ? (
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    Fitment id: {item.fitment_id.slice(0, 12)}…
                  </Text>
                ) : null}
              </View>
              {item.fitment_id ? (
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
              ) : null}
            </TouchableOpacity>
          )}
          ListFooterComponent={
            <View style={styles.pager}>
              <TouchableOpacity
                disabled={page <= 1}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                style={[styles.pagerBtn, page <= 1 && styles.pagerBtnDisabled]}
              >
                <Text style={styles.pagerBtnText}>Prev</Text>
              </TouchableOpacity>
              <Text style={styles.pagerLabel}>Page {page} / {totalPages}</Text>
              <TouchableOpacity
                disabled={page >= totalPages}
                onPress={() => setPage((p) => p + 1)}
                style={[styles.pagerBtn, page >= totalPages && styles.pagerBtnDisabled]}
              >
                <Text style={styles.pagerBtnText}>Next</Text>
              </TouchableOpacity>
            </View>
          }
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: "#0F172A",
    gap: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  title: { fontSize: fontSize.lg, fontWeight: "700", color: "#FFFFFF" },
  sub: { fontSize: fontSize.xs, color: "rgba(255,255,255,0.75)", marginTop: 2 },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

  errorBox: {
    margin: spacing.md,
    padding: spacing.md,
    backgroundColor: "#FFEDEA",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#F5C0B9",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  errorText: { flex: 1, color: colors.error, fontSize: fontSize.sm },
  retryBtn: { paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.error, borderRadius: radius.pill },
  retryText: { color: colors.onError, fontSize: fontSize.sm, fontWeight: "700" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    minHeight: 72,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandTertiary,
  },
  rowTitle: { fontSize: fontSize.sm, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: fontSize.xs, color: colors.onSurfaceSecondary, marginTop: 2 },
  rowMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },

  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  pagerBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  pagerBtnDisabled: { opacity: 0.4 },
  pagerBtnText: { fontSize: fontSize.sm, fontWeight: "700", color: colors.onSurface },
  pagerLabel: { fontSize: fontSize.xs, color: colors.muted },
});
