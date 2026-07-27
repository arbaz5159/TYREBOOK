import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/context/AuthContext";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface Row {
  icon: IconName;
  label: string;
  hint: string;
  href: string;
  tint?: string;
}

const ROWS: Row[] = [
  { icon: "tag-multiple-outline", label: "Brands", hint: "Add / edit / delete brands", href: "/admin/master/brands" },
  { icon: "text-box-multiple-outline", label: "Tyre Models", hint: "Manage tyre models", href: "/admin/master/tyreModels" },
  { icon: "ruler-square", label: "Tyre Sizes", hint: "Manage tyre sizes", href: "/admin/master/tyreSizes" },
  { icon: "car-multiple", label: "Vehicle Categories", hint: "Custom categories", href: "/admin/master/vehicleCategories" },
  { icon: "truck-outline", label: "Suppliers", hint: "Manage suppliers", href: "/admin/master/suppliers" },
  { icon: "account-multiple-outline", label: "Customers", hint: "View & search customers", href: "/customers" },
  { icon: "account-key-outline", label: "Manage Users", hint: "Owner & staff accounts", href: "/admin/users" },
  { icon: "store-outline", label: "Shop / GST / Invoice Settings", hint: "Business details & invoice format", href: "/admin/shop" },
  { icon: "database-import-outline", label: "Backup & Restore", hint: "Export or import your database", href: "/admin/backup" },
];

export default function AdminHome() {
  const router = useRouter();
  const { user } = useAuth();

  if (user && user.role !== "owner") {
    return <Redirect href="/(tabs)/settings" />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.title}>Admin Panel</Text>
          <Text style={styles.sub}>Owner-only controls</Text>
        </View>
        <View style={styles.badge}>
          <MaterialCommunityIcons name="crown" size={14} color={colors.onBrandPrimary} />
          <Text style={styles.badgeText}>OWNER</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {ROWS.map((r) => (
          <TouchableOpacity
            key={r.label}
            style={styles.row}
            activeOpacity={0.85}
            onPress={() => router.push(r.href as any)}
            testID={`admin-${r.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
          >
            <View style={styles.rowIcon}>
              <MaterialCommunityIcons name={r.icon} size={22} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{r.label}</Text>
              <Text style={styles.rowHint}>{r.hint}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
          </TouchableOpacity>
        ))}
        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
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
  badgeText: { color: colors.onBrandPrimary, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
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
  rowTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  rowHint: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
});
