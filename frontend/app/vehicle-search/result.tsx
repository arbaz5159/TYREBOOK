/**
 * "Find Tyre by Vehicle" — Result screen.
 *
 * Shown after the wizard on `/vehicle-search` resolves a single (or
 * ambiguous) OEM fitment. The fitment is identified by its `id` in the
 * route params so this screen can refetch on refresh without depending
 * on route state serialisation.
 *
 * Per user directives:
 *   #7 — display FRONT + REAR prominently, and if equal also show
 *        "Same OEM tyre size for front and rear".
 *   #8 — always show ✓ OEM VERIFIED badge and a "View OEM Details"
 *        expander that reveals Evidence, Source URL, Source Pass.
 *   #9 — safety note under the tyre sizes.
 *   #10 — "Check Available Tyres" button that navigates to a Phase-3
 *         placeholder route (`/inventory?fromOem=1&size=...`). We do
 *         NOT invent inventory results here.
 *   #6 — if the URL param `isAmbiguous=1` we display a warning card
 *        with the exact wording asked for in the directive.
 */

import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/src/components/EmptyState";
import { OemFitment } from "@/src/api/oem";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

// The oem.ts client doesn't expose a "get by id" helper — the admin
// endpoint returns the same doc. Since the Vehicle Search screen
// navigates here with the id already resolved, we hit the admin route
// directly through a small inline helper.
const BASE = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";

async function fetchOemById(id: string): Promise<OemFitment | null> {
  const res = await fetch(`${BASE}/api/oem/admin/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OEM lookup failed (${res.status})`);
  return (await res.json()) as OemFitment;
}

export default function VehicleSearchResult() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    isAmbiguous?: string;
    count?: string;
  }>();

  const [fitment, setFitment] = useState<OemFitment | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const load = useCallback(async () => {
    if (!params.id) {
      setErrorMsg("Missing fitment id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const doc = await fetchOemById(String(params.id));
      if (!doc) {
        setErrorMsg("This OEM fitment was not found. It may have been re-imported.");
      } else {
        setFitment(doc);
      }
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to load OEM fitment");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const isAmbiguous = String(params.isAmbiguous ?? "0") === "1";
  const ambiguousCount = Number(params.count ?? 1) || 1;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScreenHeader title="OEM Fitment" onBack={() => router.back()} />
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={{ color: colors.muted, marginTop: spacing.md }}>Loading OEM fitment…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (errorMsg || !fitment) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScreenHeader title="OEM Fitment" onBack={() => router.back()} />
        <EmptyState
          title="OEM fitment unavailable"
          message={errorMsg ?? "Please go back and try again."}
        />
        <View style={{ padding: spacing.lg }}>
          <TouchableOpacity onPress={load} style={styles.retryBtn} testID="oem-result-retry">
            <MaterialCommunityIcons name="refresh" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const sameFrontRear =
    (fitment.front_size_normalized || "") === (fitment.rear_size_normalized || "") &&
    !!fitment.front_size_normalized;

  const openSource = async () => {
    if (!fitment.oem_source_url) return;
    try {
      const ok = await Linking.canOpenURL(fitment.oem_source_url);
      if (ok) await Linking.openURL(fitment.oem_source_url);
    } catch (e) {
      Alert.alert("Could not open link", String(e));
    }
  };

  const onCheckStock = () => {
    // Phase 3 will replace this with a real inventory lookup screen that
    // filters `shops/{shopId}/tyres` by normalized size. For Phase 2 we
    // hand off the OEM sizes via query params so the placeholder screen
    // can display context, without inventing inventory.
    router.push({
      pathname: "/vehicle-search/stock-placeholder",
      params: {
        front: fitment.front_tyre_size,
        rear: fitment.rear_tyre_size,
        make: fitment.make,
        model: fitment.model,
        variant: fitment.variant,
        year: fitment.year_generation,
      },
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScreenHeader title="OEM Fitment" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {isAmbiguous ? (
          <View style={styles.ambiguousBox} testID="oem-result-ambiguous">
            <MaterialCommunityIcons name="alert-outline" size={20} color={colors.warning} />
            <Text style={styles.ambiguousText}>
              Multiple OEM tyre fitments are available for this vehicle
              {ambiguousCount > 1 ? ` (${ambiguousCount} matches)` : ""}. Please go back and select
              the exact variant or wheel option, or confirm the tyre size currently fitted on your
              vehicle.
            </Text>
            <TouchableOpacity onPress={() => router.back()} testID="oem-result-refine">
              <Text style={styles.ambiguousLink}>Refine selection ›</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Vehicle summary */}
        <View style={styles.card} testID="oem-result-vehicle">
          <Text style={styles.cardLabel}>VEHICLE</Text>
          <Text style={styles.vehicleTitle}>
            {fitment.make} {fitment.model}
          </Text>
          {fitment.variant ? (
            <Text style={styles.vehicleSub}>Variant · {fitment.variant}</Text>
          ) : null}
          {fitment.year_generation ? (
            <Text style={styles.vehicleSub}>Year / Generation · {fitment.year_generation}</Text>
          ) : null}
          <View style={styles.badgesRow}>
            <View style={styles.verifiedBadge} testID="oem-verified-badge">
              <MaterialCommunityIcons name="check-decagram" size={16} color={colors.onSuccess} />
              <Text style={styles.verifiedText}>OEM VERIFIED</Text>
            </View>
            {fitment.category ? (
              <View style={styles.catBadge}>
                <Text style={styles.catBadgeText}>{fitment.category}</Text>
              </View>
            ) : (
              <View style={[styles.catBadge, { backgroundColor: "#FFF3D6" }]}>
                <Text style={[styles.catBadgeText, { color: "#7A4E00" }]}>Uncategorised</Text>
              </View>
            )}
          </View>
        </View>

        {/* Tyre sizes */}
        <View style={styles.tyreRow}>
          <TyreSizeCard
            position="FRONT"
            size={fitment.front_tyre_size}
            icon="arrow-up-bold"
            testID="oem-result-front"
          />
          <TyreSizeCard
            position="REAR"
            size={fitment.rear_tyre_size}
            icon="arrow-down-bold"
            testID="oem-result-rear"
          />
        </View>

        {sameFrontRear ? (
          <View style={styles.sameSizeBanner} testID="oem-result-same-size">
            <MaterialCommunityIcons
              name="information-outline"
              size={16}
              color={colors.brandSecondary}
            />
            <Text style={styles.sameSizeText}>Same OEM tyre size for front and rear</Text>
          </View>
        ) : (
          <View style={styles.diffSizeBanner} testID="oem-result-diff-size">
            <MaterialCommunityIcons name="swap-vertical" size={16} color={colors.warning} />
            <Text style={styles.diffSizeText}>
              This vehicle has DIFFERENT front and rear tyre sizes — order the correct size for
              each position.
            </Text>
          </View>
        )}

        {/* Safety note */}
        <View style={styles.safetyNote} testID="oem-result-safety">
          <MaterialCommunityIcons name="shield-alert-outline" size={16} color={colors.muted} />
          <Text style={styles.safetyText}>
            OEM tyre fitment can vary by model year, variant and wheel option. Please confirm your
            selected vehicle details before purchase.
          </Text>
        </View>

        {/* CTA — Phase 3 handoff */}
        <TouchableOpacity
          style={styles.cta}
          onPress={onCheckStock}
          activeOpacity={0.9}
          testID="oem-result-check-stock"
        >
          <MaterialCommunityIcons name="package-variant" size={20} color={colors.onBrandPrimary} />
          <Text style={styles.ctaText}>Check Available Tyres</Text>
        </TouchableOpacity>

        {/* OEM Details expander */}
        <TouchableOpacity
          style={styles.detailsToggle}
          onPress={() => setDetailsOpen((v) => !v)}
          testID="oem-result-details-toggle"
        >
          <MaterialCommunityIcons
            name={detailsOpen ? "chevron-up" : "chevron-down"}
            size={20}
            color={colors.brand}
          />
          <Text style={styles.detailsToggleText}>
            {detailsOpen ? "Hide OEM Details" : "View OEM Details"}
          </Text>
        </TouchableOpacity>

        {detailsOpen ? (
          <View style={styles.detailsCard} testID="oem-result-details">
            <DetailRow label="OEM Evidence" value={fitment.oem_evidence || "—"} />
            <DetailRow
              label="OEM Source"
              value={fitment.oem_source_url || "—"}
              linkable={!!fitment.oem_source_url}
              onPressLink={openSource}
            />
            <DetailRow
              label="Source Pass"
              value={fitment.source_pass != null ? `Pass ${fitment.source_pass}` : "—"}
            />
            <DetailRow label="Verification" value={fitment.verification_status} />
          </View>
        ) : null}

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ------------------ helpers ------------------
function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.iconBtn} testID="oem-result-back">
        <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
      </TouchableOpacity>
      <Text style={styles.title}>{title}</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

function TyreSizeCard(props: {
  position: string;
  size: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  testID?: string;
}) {
  const { position, size, icon, testID } = props;
  return (
    <View style={styles.tyreCard} testID={testID}>
      <View style={styles.tyrePosRow}>
        <MaterialCommunityIcons name={icon} size={16} color={colors.brandSecondary} />
        <Text style={styles.tyrePosLabel}>{position}</Text>
      </View>
      <Text style={styles.tyreSize} testID={`${testID}-size`}>
        {size}
      </Text>
      <View style={styles.tyreIconRow}>
        <MaterialCommunityIcons name="tire" size={28} color={colors.brand} />
      </View>
    </View>
  );
}

function DetailRow(props: {
  label: string;
  value: string;
  linkable?: boolean;
  onPressLink?: () => void;
}) {
  const { label, value, linkable, onPressLink } = props;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      {linkable ? (
        <TouchableOpacity onPress={onPressLink} activeOpacity={0.7}>
          <Text style={[styles.detailValue, { color: colors.brand, textDecorationLine: "underline" }]}>
            {value}
          </Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.detailValue}>{value}</Text>
      )}
    </View>
  );
}

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
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  title: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.onSurface,
    textAlign: "center",
  },
  scroll: { padding: spacing.lg },
  centerBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },

  ambiguousBox: {
    backgroundColor: "#FFF3D6",
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: "#F1D190",
    gap: spacing.sm,
  },
  ambiguousText: { color: "#5C3A00", fontSize: fontSize.sm, lineHeight: 20 },
  ambiguousLink: { color: colors.brand, fontSize: fontSize.sm, fontWeight: "700" },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLabel: {
    fontSize: fontSize.xs,
    color: colors.muted,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  vehicleTitle: {
    fontSize: fontSize.xxl,
    fontWeight: "700",
    color: colors.onSurface,
    marginTop: spacing.xs,
  },
  vehicleSub: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  badgesRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.success,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    gap: 4,
  },
  verifiedText: { color: colors.onSuccess, fontSize: fontSize.xs, fontWeight: "700" },
  catBadge: {
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  catBadgeText: { color: colors.onBrandTertiary, fontSize: fontSize.xs, fontWeight: "700" },

  tyreRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  tyreCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.brand,
    padding: spacing.md,
    minHeight: 140,
    justifyContent: "space-between",
  },
  tyrePosRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  tyrePosLabel: {
    fontSize: fontSize.xs,
    color: colors.brandSecondary,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  tyreSize: {
    fontSize: fontSize.xxl,
    fontWeight: "800",
    color: colors.onSurface,
    marginTop: spacing.sm,
  },
  tyreIconRow: { alignItems: "flex-end" },

  sameSizeBanner: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sameSizeText: { color: colors.onBrandTertiary, fontSize: fontSize.sm, fontWeight: "600", flex: 1 },
  diffSizeBanner: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: "#FFF3D6",
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: "#F1D190",
  },
  diffSizeText: { color: "#5C3A00", fontSize: fontSize.sm, fontWeight: "600", flex: 1 },

  safetyNote: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
  },
  safetyText: { flex: 1, color: colors.muted, fontSize: fontSize.xs, lineHeight: 16 },

  cta: {
    marginTop: spacing.xl,
    backgroundColor: colors.brandPrimary,
    padding: spacing.md,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 52,
  },
  ctaText: { color: colors.onBrandPrimary, fontSize: fontSize.base, fontWeight: "700" },

  detailsToggle: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: spacing.md,
  },
  detailsToggleText: { color: colors.brand, fontWeight: "700", fontSize: fontSize.base },
  detailsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  detailRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  detailLabel: { fontSize: fontSize.xs, color: colors.muted, fontWeight: "700", letterSpacing: 0.5 },
  detailValue: { fontSize: fontSize.sm, color: colors.onSurface, marginTop: 2 },

  retryBtn: {
    backgroundColor: colors.brandPrimary,
    padding: spacing.md,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  retryText: { color: colors.onBrandPrimary, fontSize: fontSize.base, fontWeight: "700" },
});
