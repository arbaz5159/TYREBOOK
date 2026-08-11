/**
 * Phase 3 handoff placeholder — reached from the "Check Available Tyres"
 * button on the OEM Result screen. Per user directive #10 we do NOT
 * invent inventory results here; Phase 3 will replace this file with
 * the real inventory-matching flow that queries the current shop's
 * `tyres` collection by normalized size.
 */

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

export default function StockPlaceholder() {
  const router = useRouter();
  const p = useLocalSearchParams<{
    front?: string;
    rear?: string;
    make?: string;
    model?: string;
    variant?: string;
    year?: string;
  }>();

  const sameSize = (p.front ?? "").trim() === (p.rear ?? "").trim();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.iconBtn}
          testID="stock-placeholder-back"
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Available Tyres</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="wrench-clock" size={72} color={colors.brandSecondary} />
        </View>

        <Text style={styles.headline}>Inventory matching arrives in Phase 3</Text>
        <Text style={styles.subline}>
          Your OEM sizes have been carried through — Phase 3 will match them against your shop
          inventory (brand, pattern, TL/TT, price, quantity) and surface out-of-stock actions.
        </Text>

        <View style={styles.card} testID="stock-placeholder-summary">
          <Text style={styles.cardLabel}>SELECTED VEHICLE</Text>
          <Text style={styles.vehicle}>
            {p.make} {p.model}
          </Text>
          {p.variant ? <Text style={styles.meta}>Variant · {p.variant}</Text> : null}
          {p.year ? <Text style={styles.meta}>Year · {p.year}</Text> : null}

          <View style={styles.divider} />

          <Text style={styles.cardLabel}>OEM TYRE SIZES</Text>
          <View style={styles.tyresRow}>
            <View style={styles.tyreBox}>
              <Text style={styles.tyrePos}>FRONT</Text>
              <Text style={styles.tyreSize}>{p.front || "—"}</Text>
            </View>
            <View style={styles.tyreBox}>
              <Text style={styles.tyrePos}>REAR</Text>
              <Text style={styles.tyreSize}>{p.rear || "—"}</Text>
            </View>
          </View>
          {sameSize && p.front ? (
            <Text style={styles.sameNote}>Same OEM tyre size for front and rear</Text>
          ) : null}
        </View>

        <TouchableOpacity
          style={styles.backCta}
          onPress={() => router.back()}
          testID="stock-placeholder-refine"
        >
          <MaterialCommunityIcons name="arrow-left" size={18} color={colors.onBrandPrimary} />
          <Text style={styles.backCtaText}>Back to OEM Result</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
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

  body: { flex: 1, padding: spacing.lg, alignItems: "center" },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  headline: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.onSurface,
    marginTop: spacing.lg,
    textAlign: "center",
  },
  subline: {
    fontSize: fontSize.sm,
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 20,
  },

  card: {
    marginTop: spacing.xl,
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    width: "100%",
  },
  cardLabel: {
    fontSize: fontSize.xs,
    color: colors.muted,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  vehicle: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.onSurface,
    marginTop: 2,
  },
  meta: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },

  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.md,
  },

  tyresRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  tyreBox: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  tyrePos: {
    fontSize: fontSize.xs,
    color: colors.brandSecondary,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  tyreSize: {
    fontSize: fontSize.xl,
    fontWeight: "800",
    color: colors.onSurface,
    marginTop: 2,
  },
  sameNote: {
    marginTop: spacing.sm,
    fontSize: fontSize.xs,
    color: colors.brandSecondary,
    fontWeight: "600",
  },

  backCta: {
    marginTop: spacing.xl,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  backCtaText: {
    color: colors.onBrandPrimary,
    fontSize: fontSize.base,
    fontWeight: "700",
  },
});
