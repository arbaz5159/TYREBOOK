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
        <Text style={styles.tag}>Inventory · Billing · Khata</Text>
      </View>
    );
  }

  return <Redirect href={user ? "/(tabs)/dashboard" : "/(auth)/login"} />;
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
