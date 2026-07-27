import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { VEHICLE_CATEGORIES } from "@/src/constants/inventory";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

export default function InventoryHome() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventory</Text>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => router.push("/inventory/tyre-form")}
          testID="inventory-add-tyre"
        >
          <MaterialCommunityIcons name="plus" size={20} color={colors.onBrandPrimary} />
          <Text style={styles.headerBtnText}>Add Tyre</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.sub}>Pick a vehicle category to manage stock</Text>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {VEHICLE_CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push({ pathname: "/inventory/[category]", params: { category: c.id } })}
              testID={`category-${c.id}`}
            >
              <View style={styles.cardIcon}>
                <MaterialCommunityIcons
                  name={c.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                  size={30}
                  color={colors.brandPrimary}
                />
              </View>
              <Text style={styles.cardTitle}>{c.name}</Text>
              <Text style={styles.cardHint}>{c.hint}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.rowLink}
          onPress={() => router.push("/purchase")}
          testID="open-purchase-history"
        >
          <MaterialCommunityIcons name="cart-arrow-down" size={22} color={colors.brandPrimary} />
          <Text style={styles.rowLinkTitle}>Purchase History</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    gap: spacing.xs,
  },
  headerBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: fontSize.sm },
  sub: {
    paddingHorizontal: spacing.xl,
    color: colors.muted,
    fontSize: fontSize.base,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  card: {
    width: "48%",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  cardHint: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  rowLink: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.md,
  },
  rowLinkTitle: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.onSurface,
  },
});
