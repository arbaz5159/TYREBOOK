import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/context/AuthContext";
import { colors, fontSize } from "@/src/theme/tokens";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { user, authFired } = useAuth();

  // While Firebase Auth is still hydrating, render nothing rather than
  // making an incorrect gating decision. `authFired` flips true as soon as
  // onAuthStateChanged has actually reported for the first time (see
  // AuthContext), so this only blocks the initial rehydration window.
  if (!authFired) return null;

  if (!user) return <Redirect href="/(auth)/login" />;

  // Super Admin without a chosen shop lives in a different tab-less panel.
  if (user.role === "super_admin" && !user.shopId) {
    return <Redirect href="/super-admin" />;
  }

  // Locked shops (expired / suspended) can only view the lock screen.
  if (user.shopStatus === "expired" || user.shopStatus === "suspended") {
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
