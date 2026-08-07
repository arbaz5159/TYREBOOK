import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/src/context/AuthContext";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

export default function Index() {
  const { user, initializing } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 1200);
    return () => clearTimeout(t);
  }, []);

  if (showSplash || initializing) {
    return (
      <View style={styles.wrap} testID="splash-screen">
        <View style={styles.logoRing}>
          <View style={styles.logoInner}>
            <MaterialCommunityIcons name="tire" size={72} color={colors.brandPrimary} />
          </View>
        </View>
        <Text style={styles.brand}>TyreBook</Text>
        <Text style={styles.tag}>Multi-tenant · Inventory · Billing · Khata</Text>
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;

  // Route by role:
  //   - super_admin (no active shopId) → Super Admin panel
  //   - suspended / expired shop        → subscription-locked
  //   - everyone else                   → normal dashboard
  if (user.role === "super_admin" && !user.shopId) {
    return <Redirect href="/super-admin" />;
  }
  const status = user.shopStatus;
  if (status === "suspended" || status === "expired") {
    return <Redirect href="/subscription-locked" />;
  }
  return <Redirect href="/(tabs)/dashboard" />;
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  logoRing: {
    width: 168,
    height: 168,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xl,
  },
  logoInner: {
    width: 128,
    height: 128,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    color: "#FFFFFF",
    fontSize: fontSize.display,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  tag: {
    color: "rgba(255,255,255,0.75)",
    fontSize: fontSize.base,
    marginTop: spacing.sm,
    letterSpacing: 0.4,
  },
});
