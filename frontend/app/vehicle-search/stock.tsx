/**
 * "Available Tyres" — Phase 3 real inventory match screen.
 *
 * Reached from the OEM Result screen's "Check Available Tyres" button
 * with the resolved OEM front/rear sizes and vehicle context passed
 * via route params.
 *
 * Design invariants (per user directives 1-6, 9-10):
 *
 *  #1 / #4 / #5  Inventory rows come EXCLUSIVELY from the logged-in
 *                shop's `shops/{shopId}/tyres` subcollection via the
 *                existing `listTyres()` data layer — never from the
 *                OEM master and never from another tenant.
 *
 *  #2 / #3        Match is done client-side after normalising both the
 *                OEM size and the shop's tyre `size` field with the
 *                shared `normalizeSize()` helper (backend + frontend
 *                use the same rule). Front and Rear are matched
 *                SEPARATELY so we never silently combine different
 *                sizes.
 *
 *  #6 / #9        Out-of-stock, no-match, and mixed-availability cases
 *                each render a distinct card with actions that don't
 *                fabricate stock or recommend a different size.
 *
 *  #10           Price / stock is read from Firestore on every mount —
 *                edits by the Shop Admin in Inventory reflect here
 *                without any OEM-side changes.
 */

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/src/components/EmptyState";
import { listTyres } from "@/src/firebase/inventory";
import type { Tyre } from "@/src/constants/inventory";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";
import { normalizeSize, tyreSizeEquals } from "@/src/utils/tyreSize";

interface MatchBucket {
  size: string;              // original OEM string (never mutated)
  normalized: string;         // for equality only
  matches: Tyre[];            // shop tyres whose size normalises to this
}

export default function AvailableTyresScreen() {
  const router = useRouter();
  const p = useLocalSearchParams<{
    front?: string;
    rear?: string;
    make?: string;
    model?: string;
    variant?: string;
    year?: string;
  }>();

  const front = String(p.front ?? "").trim();
  const rear = String(p.rear ?? "").trim();
  const sameSize = tyreSizeEquals(front, rear);

  const [tyres, setTyres] = useState<Tyre[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setErrorMsg(null);
    try {
      const list = await listTyres();
      setTyres(list);
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to load inventory");
      setTyres(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const frontBucket = useMemo<MatchBucket>(() => {
    const norm = normalizeSize(front);
    return {
      size: front,
      normalized: norm,
      matches: (tyres ?? []).filter(
        (t) => normalizeSize(t.size) === norm && (t.currentStock ?? 0) > 0,
      ),
    };
  }, [front, tyres]);

  const rearBucket = useMemo<MatchBucket>(() => {
    const norm = normalizeSize(rear);
    return {
      size: rear,
      normalized: norm,
      matches: (tyres ?? []).filter(
        (t) => normalizeSize(t.size) === norm && (t.currentStock ?? 0) > 0,
      ),
    };
  }, [rear, tyres]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.iconBtn}
          testID="stock-back"
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>Available Tyres</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {p.make} {p.model}
            {p.variant ? ` · ${p.variant}` : ""}
          </Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.iconBtn} testID="stock-refresh">
          <MaterialCommunityIcons name="refresh" size={20} color={colors.onSurface} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {tyres === null && !errorMsg ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={{ color: colors.muted, marginTop: spacing.md }}>Loading shop inventory…</Text>
          </View>
        ) : errorMsg ? (
          <View style={styles.errorBox} testID="stock-error">
            <MaterialCommunityIcons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity onPress={load} style={styles.retryBtn} testID="stock-retry">
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Same-size banner */}
            {sameSize && front ? (
              <View style={styles.sameSizeBanner} testID="stock-same-size">
                <MaterialCommunityIcons name="information-outline" size={16} color={colors.brandSecondary} />
                <Text style={styles.sameSizeText}>
                  Same OEM tyre size for Front &amp; Rear · quantity is selected separately below.
                </Text>
              </View>
            ) : null}

            {/* FRONT bucket */}
            <SizeSection
              position="FRONT"
              icon="arrow-up-bold"
              bucket={frontBucket}
              testIDPrefix="stock-front"
            />

            {/* REAR bucket — hidden if identical size AND same-size banner already shown? No — user directive #3 says show separately regardless. */}
            <SizeSection
              position="REAR"
              icon="arrow-down-bold"
              bucket={rearBucket}
              testIDPrefix="stock-rear"
            />

            {/* Global safety / footer */}
            <View style={styles.safetyNote}>
              <MaterialCommunityIcons name="shield-alert-outline" size={16} color={colors.muted} />
              <Text style={styles.safetyText}>
                Stock quantity and price come directly from your shop&apos;s inventory. Updates in the
                Inventory module reflect here on refresh.
              </Text>
            </View>

            <View style={{ height: spacing.xxxl }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// -----------------------------------------------------------------
// One position (FRONT or REAR) with either an inventory list, or an
// out-of-stock CTA card, or a no-size fallback.
// -----------------------------------------------------------------
function SizeSection(props: {
  position: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  bucket: MatchBucket;
  testIDPrefix: string;
}) {
  const router = useRouter();
  const { position, icon, bucket, testIDPrefix } = props;

  if (!bucket.size) {
    // OEM record has no size for this position — extremely rare given
    // Phase 1 required-field guard, but still handle gracefully.
    return (
      <View style={styles.sectionCard} testID={`${testIDPrefix}-nosize`}>
        <SectionHeader position={position} icon={icon} size="—" count={0} />
        <EmptyState
          title="OEM size not available"
          message="This vehicle has no OEM size recorded for this position."
        />
      </View>
    );
  }

  return (
    <View style={styles.sectionCard} testID={`${testIDPrefix}-section`}>
      <SectionHeader
        position={position}
        icon={icon}
        size={bucket.size}
        count={bucket.matches.length}
      />

      {bucket.matches.length === 0 ? (
        // Out-of-stock — per user directive #6 we NEVER recommend a
        // different size. Only actions grounded in the existing app.
        <View style={styles.oosBox} testID={`${testIDPrefix}-oos`}>
          <MaterialCommunityIcons name="package-variant-closed" size={28} color={colors.warning} />
          <Text style={styles.oosTitle}>
            Correct OEM tyre size found, but this size is currently out of stock.
          </Text>
          <Text style={styles.oosSub}>
            Do not fit a different size on the customer&apos;s vehicle. Order the correct size
            through Purchase, or contact the shop.
          </Text>
          <View style={styles.oosActions}>
            <TouchableOpacity
              style={styles.oosBtn}
              onPress={() =>
                router.push({
                  pathname: "/inventory/tyre-form",
                  params: { prefillSize: bucket.size },
                })
              }
              testID={`${testIDPrefix}-oos-add-to-inventory`}
            >
              <MaterialCommunityIcons name="plus-circle-outline" size={16} color={colors.brand} />
              <Text style={styles.oosBtnText}>Add to Inventory</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.oosBtn}
              onPress={() => router.push("/purchase/new")}
              testID={`${testIDPrefix}-oos-add-to-purchase`}
            >
              <MaterialCommunityIcons name="cart-plus" size={16} color={colors.brand} />
              <Text style={styles.oosBtnText}>Add Purchase Requirement</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View>
          {bucket.matches
            .slice()
            .sort((a, b) => (a.sellingPrice ?? 0) - (b.sellingPrice ?? 0))
            .map((t) => (
              <TyreCard
                key={t.id}
                tyre={t}
                testID={`${testIDPrefix}-item-${t.id}`}
                onPress={() =>
                  router.push({
                    pathname: "/inventory/tyre-form",
                    params: { id: t.id },
                  })
                }
              />
            ))}
        </View>
      )}
    </View>
  );
}

function SectionHeader(props: {
  position: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  size: string;
  count: number;
}) {
  const { position, icon, size, count } = props;
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        <MaterialCommunityIcons name={icon} size={14} color={colors.brandSecondary} />
        <Text style={styles.sectionPos}>{position}</Text>
      </View>
      <Text style={styles.sectionSize}>{size}</Text>
      <View
        style={[
          styles.countBadge,
          count > 0 ? styles.countBadgeOk : styles.countBadgeOos,
        ]}
      >
        <Text
          style={[
            styles.countBadgeText,
            count > 0 ? styles.countBadgeTextOk : styles.countBadgeTextOos,
          ]}
        >
          {count > 0 ? `${count} available` : "OUT OF STOCK"}
        </Text>
      </View>
    </View>
  );
}

function TyreCard(props: { tyre: Tyre; testID?: string; onPress?: () => void }) {
  const { tyre, testID, onPress } = props;
  const lowStock =
    typeof tyre.currentStock === "number" &&
    typeof tyre.minStockAlert === "number" &&
    tyre.currentStock <= tyre.minStockAlert;
  return (
    <TouchableOpacity
      style={styles.tyreCard}
      onPress={onPress}
      activeOpacity={0.85}
      testID={testID}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.tyreBrand}>{tyre.brand || "—"}</Text>
        <Text style={styles.tyrePattern} numberOfLines={1}>
          {tyre.pattern && tyre.pattern !== "-" ? tyre.pattern : tyre.model || "—"}
        </Text>
        <View style={styles.tyreMetaRow}>
          <MetaChip label={tyre.size} />
          {tyre.tubeType ? <MetaChip label={tyre.tubeType === "Tubeless" ? "TL" : "TT"} /> : null}
          {tyre.tyreClass && tyre.tyreClass !== "new" ? (
            <MetaChip label={tyre.tyreClass.toUpperCase()} tone="warn" />
          ) : null}
        </View>
      </View>

      <View style={styles.tyreRight}>
        <Text style={styles.tyrePrice}>
          ₹{(tyre.sellingPrice ?? 0).toLocaleString("en-IN")}
        </Text>
        <Text style={[styles.tyreStock, lowStock && styles.tyreStockLow]}>
          {tyre.currentStock ?? 0} in stock
        </Text>
        {lowStock ? (
          <Text style={styles.tyreLowLabel}>LOW</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function MetaChip({ label, tone }: { label: string; tone?: "warn" | "brand" }) {
  return (
    <View
      style={[
        styles.metaChip,
        tone === "warn" && { backgroundColor: "#FFF3D6" },
      ]}
    >
      <Text
        style={[
          styles.metaChipText,
          tone === "warn" && { color: "#7A4E00" },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

// -----------------------------------------------------------------
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  title: { fontSize: fontSize.lg, fontWeight: "700", color: colors.onSurface },
  subtitle: { fontSize: fontSize.xs, color: colors.muted, marginTop: 1 },

  scroll: { padding: spacing.lg },
  centerBox: { padding: spacing.xl, alignItems: "center" },

  errorBox: {
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
    paddingVertical: spacing.sm,
    backgroundColor: colors.error,
    borderRadius: radius.pill,
  },
  retryText: { color: colors.onError, fontSize: fontSize.sm, fontWeight: "600" },

  sameSizeBanner: {
    padding: spacing.md,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sameSizeText: { color: colors.onBrandTertiary, fontSize: fontSize.sm, fontWeight: "600", flex: 1 },

  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingBottom: spacing.sm,
  },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 4 },
  sectionPos: {
    fontSize: fontSize.xs,
    fontWeight: "800",
    color: colors.brandSecondary,
    letterSpacing: 0.5,
  },
  sectionSize: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: "800",
    color: colors.onSurface,
    marginLeft: spacing.sm,
  },
  countBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  countBadgeOk: { backgroundColor: colors.brandTertiary },
  countBadgeOos: { backgroundColor: "#FFEDEA" },
  countBadgeText: { fontSize: fontSize.xs, fontWeight: "800", letterSpacing: 0.5 },
  countBadgeTextOk: { color: colors.onBrandTertiary },
  countBadgeTextOos: { color: colors.error },

  oosBox: { padding: spacing.md, alignItems: "flex-start", gap: spacing.sm },
  oosTitle: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.onSurface,
  },
  oosSub: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 20 },
  oosActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  oosBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandTertiary,
  },
  oosBtnText: { color: colors.brand, fontWeight: "700", fontSize: fontSize.sm },

  tyreCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.md,
  },
  tyreBrand: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  tyrePattern: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  tyreMetaRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm, flexWrap: "wrap" },
  metaChip: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  metaChipText: {
    fontSize: fontSize.xs,
    color: colors.onSurface,
    fontWeight: "600",
  },
  tyreRight: { alignItems: "flex-end", minWidth: 100 },
  tyrePrice: {
    fontSize: fontSize.lg,
    fontWeight: "800",
    color: colors.brand,
  },
  tyreStock: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  tyreStockLow: { color: colors.warning, fontWeight: "700" },
  tyreLowLabel: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  safetyNote: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
  },
  safetyText: { flex: 1, color: colors.muted, fontSize: fontSize.xs, lineHeight: 16 },
});
