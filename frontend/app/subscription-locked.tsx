import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/PrimaryButton";
import { useAuth } from "@/src/context/AuthContext";
import { effectiveStatus, getShop, type Shop } from "@/src/firebase/shops";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

// Full-screen lock shown to Shop Admin / Staff when their tenant's
// subscription is `expired` or `suspended`. Only Logout is available.
// Super Admin never reaches this screen (they can flip status themselves).

export default function SubscriptionLocked() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user?.shopId) {
        setLoading(false);
        return;
      }
      const s = await getShop(user.shopId);
      setShop(s);
      setLoading(false);
    })();
  }, [user?.shopId]);

  const status = useMemo(() => effectiveStatus(shop), [shop]);

  const heading =
    status === "suspended" ? "Shop suspended" : "Subscription expired";
  const subtitle =
    status === "suspended"
      ? "Your shop's access has been paused by the platform admin. Please contact support to restore access."
      : shop?.trialEndsAt && shop.status === "trial"
        ? "Your 14-day free trial has ended. Renew your plan to keep using TyreBook."
        : "Your subscription has expired. Renew your plan to keep managing your shop.";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons
            name={status === "suspended" ? "lock-alert-outline" : "clock-alert-outline"}
            size={64}
            color={colors.warning}
          />
        </View>

        <Text style={styles.title}>{heading}</Text>
        <Text style={styles.body}>{subtitle}</Text>

        {loading ? null : (
          <View style={styles.card} testID="lock-shop-details">
            <Text style={styles.cardLabel}>Shop</Text>
            <Text style={styles.cardValue}>{shop?.name ?? "—"}</Text>
            <View style={{ height: spacing.sm }} />
            <Text style={styles.cardLabel}>Shop ID</Text>
            <Text style={styles.cardValue}>{shop?.id ?? user?.shopId ?? "—"}</Text>
            <View style={{ height: spacing.sm }} />
            <Text style={styles.cardLabel}>Status</Text>
            <Text style={[styles.cardValue, { textTransform: "capitalize" }]}>{status}</Text>
            {shop?.trialEndsAt ? (
              <>
                <View style={{ height: spacing.sm }} />
                <Text style={styles.cardLabel}>Trial ended</Text>
                <Text style={styles.cardValue}>
                  {new Date(shop.trialEndsAt).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </Text>
              </>
            ) : null}
            {shop?.planExpiresAt ? (
              <>
                <View style={{ height: spacing.sm }} />
                <Text style={styles.cardLabel}>Plan expired</Text>
                <Text style={styles.cardValue}>
                  {new Date(shop.planExpiresAt).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </Text>
              </>
            ) : null}
          </View>
        )}

        <View style={styles.contactCard}>
          <MaterialCommunityIcons name="phone-outline" size={20} color={colors.brandPrimary} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.contactTitle}>Renew your subscription</Text>
            <Text style={styles.contactBody}>
              Please contact your TyreBook representative to reactivate service.
              Once reactivated, your shop&apos;s inventory, sales, and khata data
              will be immediately available — nothing is lost.
            </Text>
          </View>
        </View>

        <View style={{ height: spacing.lg }} />

        <PrimaryButton
          label="Open Settings"
          variant="ghost"
          onPress={() => router.replace("/(tabs)/settings")}
          testID="lock-open-settings"
        />

        <View style={{ height: spacing.sm }} />

        <TouchableOpacity
          style={styles.logout}
          onPress={async () => {
            await signOut();
            router.replace("/(auth)/login");
          }}
          testID="lock-logout"
        >
          <MaterialCommunityIcons name="logout" size={20} color={colors.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, paddingTop: spacing.xxxl },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#FFEAD1",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: "800",
    color: colors.onSurface,
    textAlign: "center",
  },
  body: {
    fontSize: fontSize.base,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  card: {
    padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  cardLabel: { fontSize: fontSize.xs, color: colors.muted, fontWeight: "600" },
  cardValue: { fontSize: fontSize.base, color: colors.onSurface, fontWeight: "700", marginTop: 2 },
  contactCard: {
    flexDirection: "row",
    padding: spacing.md,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    alignItems: "flex-start",
  },
  contactTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.onBrandTertiary,
    marginBottom: 2,
  },
  contactBody: { fontSize: fontSize.xs, color: colors.onBrandTertiary, lineHeight: 18 },
  logout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#FFF1F0",
    marginTop: spacing.md,
  },
  logoutText: { fontSize: fontSize.base, fontWeight: "700", color: colors.error },
});
