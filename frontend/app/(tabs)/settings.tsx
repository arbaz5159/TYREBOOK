import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/context/AuthContext";
import { isFirebaseConfigured } from "@/src/firebase/auth";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface Row {
  icon: IconName;
  label: string;
  hint?: string;
  href?: string;
  onPress?: () => void;
  danger?: boolean;
  ownerOnly?: boolean;
}

export default function Settings() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const isOwner = user?.role === "shop_admin" || user?.role === "super_admin";
  const isSuperAdmin = user?.role === "super_admin";

  const roleLabel =
    user?.role === "super_admin"
      ? "Super Admin"
      : user?.role === "shop_admin"
        ? "Shop Admin"
        : "Staff";

  const rows: Row[] = [
    { icon: "shield-star-outline", label: "Super Admin Panel", hint: "Manage all shops & subscriptions", href: "/super-admin", ownerOnly: false },
    { icon: "shield-crown-outline", label: "Owner Admin Panel", hint: "Manage master data & users", href: "/admin", ownerOnly: true },
    { icon: "store-outline", label: "Shop Details", hint: "Name, address, phone", href: "/admin/shop", ownerOnly: true },
    { icon: "receipt-text-outline", label: "GST & Invoice Settings", hint: "GSTIN, prefix, footer", href: "/admin/shop", ownerOnly: true },
    { icon: "book-account-outline", label: "KhataBook", hint: "Customer ledger & credit", href: "/khata" },
    { icon: "text-recognition", label: "AI Invoice Scanner", hint: "OCR supplier invoices", href: "/smart-purchase" },
    { icon: "translate", label: "Language", hint: "Choose app language", href: "/language" },
    { icon: "account-multiple-outline", label: "Customers", href: "/customers" },
    { icon: "cart-arrow-down", label: "Purchase History", href: "/purchase" },
    { icon: "account-circle-outline", label: "Profile", hint: user?.email ?? "" },
    { icon: "information-outline", label: "About TyreBook", hint: "v1.0.0" },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.sub}>{roleLabel} · {user?.email}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {!isFirebaseConfigured() ? (
          <View style={styles.banner} testID="firebase-not-configured-banner">
            <MaterialCommunityIcons name="alert-circle-outline" size={22} color={colors.warning} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.bannerTitle}>Firebase not configured</Text>
              <Text style={styles.bannerText}>
                Add your Firebase Web config to /app/frontend/.env to enable Auth & Firestore. The app is
                using local storage in the meantime.
              </Text>
            </View>
          </View>
        ) : null}

        {rows
          .filter((r) => {
            // Super Admin panel row: only visible for super_admin
            if (r.label === "Super Admin Panel") return isSuperAdmin;
            return !r.ownerOnly || isOwner;
          })
          .map((row) => (
            <TouchableOpacity
              key={row.label}
              style={styles.row}
              activeOpacity={0.85}
              onPress={() => {
                if (row.onPress) row.onPress();
                else if (row.href) router.push(row.href as any);
              }}
              testID={`settings-row-${row.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            >
              <View style={styles.rowIcon}>
                <MaterialCommunityIcons name={row.icon} size={22} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{row.label}</Text>
                {row.hint ? <Text style={styles.rowHint}>{row.hint}</Text> : null}
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
            </TouchableOpacity>
          ))}

        <TouchableOpacity
          style={[styles.row, styles.logoutRow]}
          onPress={async () => {
            await signOut();
            router.replace("/(auth)/login");
          }}
          testID="settings-logout"
        >
          <View style={[styles.rowIcon, { backgroundColor: "#FFDAD6" }]}>
            <MaterialCommunityIcons name="logout" size={22} color={colors.error} />
          </View>
          <Text style={[styles.rowTitle, { color: colors.error }]}>Logout</Text>
        </TouchableOpacity>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  banner: {
    flexDirection: "row",
    padding: spacing.md,
    backgroundColor: "#FFEAD1",
    borderRadius: radius.md,
    marginBottom: spacing.md,
    alignItems: "flex-start",
  },
  bannerTitle: { fontWeight: "700", color: colors.warning, fontSize: fontSize.sm },
  bannerText: { fontSize: fontSize.xs, color: colors.onSurfaceSecondary, marginTop: 2 },
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
  logoutRow: { marginTop: spacing.md, backgroundColor: "#FFF1F0" },
});
