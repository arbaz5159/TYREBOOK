// Admin OEM Viewer — Super-Admin-only browser of the 450-row global tyre
// fitment database. Supports live search, category filter, "Category
// Review Required" toggle, and pagination. Tapping a row opens the
// editor at /admin/oem/[id].

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
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
import {
  oemAdminList,
  oemCategories,
  oemStats,
  type OemFitment,
  type OemStats,
  OEM_UNCATEGORISED_LABEL,
} from "@/src/api/oem";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

const PAGE_SIZE = 25;

export default function AdminOemViewer() {
  const router = useRouter();
  const { user } = useAuth();

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<OemFitment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<string[] | null>(null);
  const [stats, setStats] = useState<OemStats | null>(null);
  const [catPickerOpen, setCatPickerOpen] = useState(false);

  // Load stats + categories once
  useEffect(() => {
    (async () => {
      try {
        const [c, s] = await Promise.all([oemCategories(), oemStats()]);
        setCategories(c);
        setStats(s);
      } catch (e: any) {
        // Non-fatal — just don't show filter chips.
        console.warn("Failed to load OEM stats/categories:", e?.message);
      }
    })();
  }, []);

  // Debounce the query — we search by "make" or "model" via server-side filter.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // We fetch a superset (server-side filter by exact make/model isn't
      // ideal for substring search) so the client filters within the current
      // page. For 450 rows this is fine; if the DB grows we can add a
      // dedicated /admin/search endpoint.
      const params: any = { page, page_size: PAGE_SIZE };
      if (categoryFilter) params.category = categoryFilter;
      if (needsReviewOnly) params.needs_review = true;
      const r = await oemAdminList(params);
      // Client-side substring filter on make/model/variant.
      let matched = r.rows;
      if (debouncedQuery) {
        const q = debouncedQuery.toLowerCase();
        matched = matched.filter(
          (row) =>
            (row.make ?? "").toLowerCase().includes(q) ||
            (row.model ?? "").toLowerCase().includes(q) ||
            (row.variant ?? "").toLowerCase().includes(q),
        );
      }
      setRows(matched);
      setTotal(r.total);
    } catch (e: any) {
      setError(e?.message || "Failed to load OEM records");
    } finally {
      setLoading(false);
    }
  }, [page, categoryFilter, needsReviewOnly, debouncedQuery]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh when returning from the editor screen.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!user) return null;
  if (user.role !== "super_admin") return <Redirect href="/(tabs)/dashboard" />;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const clearFilters = () => {
    setQuery("");
    setCategoryFilter(null);
    setNeedsReviewOnly(false);
    setPage(1);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="oem-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>OEM Fitment Database</Text>
          <Text style={styles.sub}>
            {stats
              ? `${stats.total} records · ${stats.oem_verified} OEM verified · ${stats.uncategorised} need category review`
              : "Loading catalogue…"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/admin/oem/import")}
          style={styles.iconBtn}
          testID="oem-open-import"
        >
          <MaterialCommunityIcons name="file-upload-outline" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push("/admin/oem/audit")}
          style={[styles.iconBtn, { marginLeft: spacing.xs }]}
          testID="oem-open-audit"
        >
          <MaterialCommunityIcons name="history" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Search + filters */}
      <View style={styles.filterBar}>
        <View style={styles.searchWrap}>
          <MaterialCommunityIcons name="magnify" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              setPage(1);
            }}
            placeholder="Search make, model or variant…"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCorrect={false}
            testID="oem-search-input"
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={10}>
              <MaterialCommunityIcons name="close-circle" size={16} color={colors.muted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.chipRow}>
          <FilterChip
            label={categoryFilter ?? "All categories"}
            icon="tag-outline"
            active={!!categoryFilter}
            onPress={() => setCatPickerOpen(true)}
            testID="oem-filter-category"
          />
          <FilterChip
            label="Needs review"
            icon={needsReviewOnly ? "flag" : "flag-outline"}
            active={needsReviewOnly}
            onPress={() => {
              setNeedsReviewOnly((v) => !v);
              setPage(1);
            }}
            testID="oem-filter-review"
          />
          {categoryFilter || needsReviewOnly || query ? (
            <TouchableOpacity onPress={clearFilters} testID="oem-filter-clear">
              <Text style={styles.clearLink}>Clear all</Text>
            </TouchableOpacity>
          ) : null}
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
          <Text style={styles.loadingText}>Loading OEM records…</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={{ padding: spacing.xl }}>
          <EmptyState
            title="No OEM records match"
            message={
              query || categoryFilter || needsReviewOnly
                ? "Try clearing filters or your search term."
                : "The catalogue is empty — try running the OEM import from the icon above."
            }
            icon={<MaterialCommunityIcons name="database-off" size={44} color={colors.brand} />}
          />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: "/admin/oem/[id]",
                  params: { id: item.id },
                })
              }
              testID={`oem-row-${item.id}`}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.make}  {item.model}
                  </Text>
                  {item._category_review_required ? (
                    <View style={styles.reviewBadge}>
                      <MaterialCommunityIcons name="flag-outline" size={11} color="#8D4F00" />
                      <Text style={styles.reviewBadgeText}>Review</Text>
                    </View>
                  ) : (
                    <View style={styles.catBadge}>
                      <Text style={styles.catBadgeText}>
                        {item.category ?? OEM_UNCATEGORISED_LABEL}
                      </Text>
                    </View>
                  )}
                </View>
                {item.variant ? (
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {item.variant}
                  </Text>
                ) : null}
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {item.year_generation || "—"}
                </Text>
                <View style={styles.tyreRow}>
                  <TyrePill label="F" value={item.front_tyre_size} />
                  <TyrePill label="R" value={item.rear_tyre_size} />
                  {item.front_tyre_size !== item.rear_tyre_size ? (
                    <View style={styles.diffPill}>
                      <MaterialCommunityIcons name="swap-horizontal" size={11} color={colors.brandSecondary} />
                      <Text style={styles.diffPillText}>F ≠ R</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
            </TouchableOpacity>
          )}
          ListFooterComponent={
            <View style={styles.pager}>
              <TouchableOpacity
                disabled={page <= 1}
                style={[styles.pagerBtn, page <= 1 && styles.pagerBtnDisabled]}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                testID="oem-page-prev"
              >
                <MaterialCommunityIcons name="chevron-left" size={18} color={colors.onSurface} />
                <Text style={styles.pagerBtnText}>Prev</Text>
              </TouchableOpacity>
              <Text style={styles.pagerLabel}>
                Page {page} of {totalPages} · {total} rows
              </Text>
              <TouchableOpacity
                disabled={page >= totalPages}
                style={[styles.pagerBtn, page >= totalPages && styles.pagerBtnDisabled]}
                onPress={() => setPage((p) => p + 1)}
                testID="oem-page-next"
              >
                <Text style={styles.pagerBtnText}>Next</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.onSurface} />
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Category picker */}
      <Modal
        visible={catPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCatPickerOpen(false)}
      >
        <View style={styles.modalWrap}>
          <Pressable style={styles.backdrop} onPress={() => setCatPickerOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filter by category</Text>
              <TouchableOpacity onPress={() => setCatPickerOpen(false)} hitSlop={12}>
                <MaterialCommunityIcons name="close" size={22} color={colors.onSurface} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={["__all__", ...(categories ?? [])]}
              keyExtractor={(c) => c}
              renderItem={({ item }) => {
                const label = item === "__all__" ? "All categories" : item;
                const count =
                  item === "__all__"
                    ? stats?.total
                    : stats?.by_category.find((b) => b.category === item)?.count;
                const active =
                  item === "__all__"
                    ? categoryFilter === null
                    : categoryFilter === item;
                return (
                  <TouchableOpacity
                    style={styles.pickerRow}
                    onPress={() => {
                      setCategoryFilter(item === "__all__" ? null : item);
                      setPage(1);
                      setCatPickerOpen(false);
                    }}
                    testID={`oem-cat-pick-${item}`}
                  >
                    <Text style={[styles.pickerText, active && styles.pickerTextActive]}>
                      {label}
                    </Text>
                    {typeof count === "number" ? (
                      <Text style={styles.pickerCount}>{count}</Text>
                    ) : null}
                    {active ? (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={18}
                        color={colors.brand}
                        style={{ marginLeft: spacing.sm }}
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.divider} />}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function FilterChip({
  label,
  icon,
  active,
  onPress,
  testID,
}: {
  label: string;
  icon: any;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      testID={testID}
    >
      <MaterialCommunityIcons
        name={icon}
        size={14}
        color={active ? "#FFFFFF" : colors.onSurface}
      />
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function TyrePill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tyrePill}>
      <Text style={styles.tyrePillLabel}>{label}</Text>
      <Text style={styles.tyrePillValue} numberOfLines={1}>
        {value || "—"}
      </Text>
    </View>
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
    gap: spacing.xs,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  title: { fontSize: fontSize.lg, fontWeight: "700", color: "#FFFFFF", marginLeft: spacing.sm },
  sub: {
    fontSize: fontSize.xs,
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
    marginLeft: spacing.sm,
  },
  filterBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: fontSize.base,
    padding: 0,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipText: { fontSize: fontSize.xs, fontWeight: "600", color: colors.onSurface, maxWidth: 140 },
  chipTextActive: { color: "#FFFFFF" },
  clearLink: { color: colors.brand, fontWeight: "700", fontSize: fontSize.sm, marginLeft: spacing.xs },

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
  retryBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.error,
    borderRadius: radius.pill,
  },
  retryText: { color: colors.onError, fontSize: fontSize.sm, fontWeight: "700" },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  loadingText: { color: colors.muted, fontSize: fontSize.sm },

  list: { padding: spacing.md, paddingBottom: spacing.xxxl },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 88,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rowTitle: { flex: 1, fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: fontSize.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  rowMeta: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  tyreRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" },
  tyrePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.brandTertiary,
  },
  tyrePillLabel: { fontSize: 10, fontWeight: "800", color: colors.onBrandTertiary },
  tyrePillValue: { fontSize: fontSize.xs, fontWeight: "700", color: colors.onBrandTertiary, maxWidth: 120 },
  diffPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: "#EAF3F1",
  },
  diffPillText: { fontSize: 10, fontWeight: "700", color: colors.brandSecondary },
  catBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  catBadgeText: { fontSize: 10, fontWeight: "700", color: colors.onSurfaceSecondary, maxWidth: 100 },
  reviewBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: "#FFEECC",
  },
  reviewBadgeText: { fontSize: 10, fontWeight: "700", color: "#8D4F00" },

  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  pagerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  pagerBtnDisabled: { opacity: 0.4 },
  pagerBtnText: { fontSize: fontSize.sm, fontWeight: "700", color: colors.onSurface },
  pagerLabel: { fontSize: fontSize.xs, color: colors.muted },

  modalWrap: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "75%",
    paddingBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  sheetTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.onSurface },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  pickerText: { fontSize: fontSize.base, color: colors.onSurface, flex: 1 },
  pickerTextActive: { fontWeight: "700", color: colors.brand },
  pickerCount: { fontSize: fontSize.xs, color: colors.muted, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.lg },
});
