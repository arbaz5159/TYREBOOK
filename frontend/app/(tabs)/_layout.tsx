import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/context/AuthContext";
import { useActiveShopId } from "@/src/firebase/tenant";
import { colors, fontSize } from "@/src/theme/tokens";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { user, authFired } = useAuth();
  // Super Admin has `user.shopId === null` (by design — the SUPER_ADMIN_EMAILS
  // whitelist is the ONLY source of truth for the super_admin role). But
  // when the Super Admin taps "Enter this shop" in /super-admin/shop/[id],
  // the tenant module's activeShopId is set — we use THAT to admit them
  // into the tabs so they can impersonate the shop and use its full UI.
  const activeShopId = useActiveShopId();

  // While Firebase Auth is still hydrating, render nothing rather than
  // making an incorrect gating decision. `authFired` flips true as soon as
  // onAuthStateChanged has actually reported for the first time (see
  // AuthContext), so this only blocks the initial rehydration window.
  if (!authFired) return null;

  if (!user) return <Redirect href="/(auth)/login" />;

  // Super Admin without a picked shop lives in the platform panel.
  if (user.role === "super_admin" && !activeShopId) {
    return <Redirect href="/super-admin" />;
  }

  // Non-super_admin members must have a shopId assigned to their user
  // record. If it's missing (edge case: broken account), send them to
  // Settings so they can at least logout gracefully.
  if (user.role !== "super_admin" && !user.shopId) {
    return <Redirect href="/(auth)/login" />;
  }

  // Locked shops (expired / suspended) can only view the lock screen.
  // Super Admin bypasses this — they need to inspect/renew every tenant.
  if (
    user.role !== "super_admin" &&
    (user.shopStatus === "expired" || user.shopStatus === "suspended")
  ) {
    return <Redirect href="/subscription-locked" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: "600" },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.divider,
          height: 64 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
        },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard-outline" size={size} color={color} />
          ),
          tabBarButtonTestID: "tab-dashboard",
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: "Inventory",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="warehouse" size={size} color={color} />
          ),
          tabBarButtonTestID: "tab-inventory",
        }}
      />
      <Tabs.Screen
        name="billing"
        options={{
          title: "Billing",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="receipt-text-outline" size={size} color={color} />
          ),
          tabBarButtonTestID: "tab-billing",
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "Reports",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="chart-bar" size={size} color={color} />
          ),
          tabBarButtonTestID: "tab-reports",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog-outline" size={size} color={color} />
          ),
          tabBarButtonTestID: "tab-settings",
        }}
      />
    </Tabs>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _s = StyleSheet.create({});
