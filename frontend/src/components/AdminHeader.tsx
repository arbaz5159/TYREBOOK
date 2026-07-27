// Consistent header for every Admin Panel screen — back button, title,
// optional subtitle, and an OWNER badge in the top-right.

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

interface Props {
  title: string;
  subtitle?: string;
  showBadge?: boolean;
  rightSlot?: React.ReactNode;
  onBack?: () => void;
}

export function AdminHeader({
  title,
  subtitle,
  showBadge = true,
  rightSlot,
  onBack,
}: Props) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => (onBack ? onBack() : router.back())}
        style={styles.iconBtn}
        testID="admin-back-btn"
      >
        <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
      </TouchableOpacity>
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>
      {rightSlot ? (
        <View style={{ marginRight: spacing.sm }}>{rightSlot}</View>
      ) : null}
      {showBadge ? (
        <View style={styles.badge} testID="owner-badge">
          <MaterialCommunityIcons name="crown" size={14} color={colors.onBrandPrimary} />
          <Text style={styles.badgeText}>OWNER</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: fontSize.xl, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    gap: 4,
  },
  badgeText: {
    color: colors.onBrandPrimary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
});
