// Persistent bottom navigation for the Admin Panel — 5 primary sections.
// Uses expo-router usePathname to highlight the active tab.

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/src/theme/tokens";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface Tab {
  href: string;
  label: string;
  icon: IconName;
  match: (path: string) => boolean;
}

const TABS: Tab[] = [
  {
    href: "/admin",
    label: "Home",
    icon: "view-dashboard-outline",
    match: (p) => p === "/admin" || p === "/admin/",
  },
  {
    href: "/admin/dashboard",
    label: "KPIs",
    icon: "chart-box-outline",
    match: (p) => p.startsWith("/admin/dashboard"),
  },
  {
    href: "/admin/master/brands",
    label: "Master",
    icon: "database-outline",
    match: (p) => p.startsWith("/admin/master"),
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: "account-group-outline",
    match: (p) =>
      p.startsWith("/admin/users") || p.startsWith("/admin/shop") || p.startsWith("/admin/pricing"),
  },
  {
    href: "/admin/app-settings",
    label: "Settings",
    icon: "cog-outline",
    match: (p) =>
      p.startsWith("/admin/app-settings") ||
      p.startsWith("/admin/backup") ||
      p.startsWith("/admin/ai-scanner"),
  },
];

export function AdminBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
      testID="admin-bottom-nav"
    >
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <TouchableOpacity
            key={t.href}
            style={styles.tab}
            activeOpacity={0.85}
            onPress={() => router.push(t.href as any)}
            testID={`admin-nav-${t.label.toLowerCase()}`}
          >
            <View style={[styles.iconPill, active && styles.iconPillActive]}>
              <MaterialCommunityIcons
                name={t.icon}
                size={20}
                color={active ? colors.onBrandTertiary : colors.onSurfaceSecondary}
              />
            </View>
            <Text style={[styles.label, active && styles.labelActive]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  iconPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginBottom: 2,
  },
  iconPillActive: {
    backgroundColor: colors.brandTertiary,
  },
  label: {
    fontSize: 10,
    color: colors.onSurfaceSecondary,
    fontWeight: "600",
  },
  labelActive: {
    color: colors.onSurface,
    fontWeight: "800",
  },
});
