import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppTextField } from "@/src/components/AppTextField";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { useAuth } from "@/src/context/AuthContext";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";
import type { UserRole } from "@/src/firebase/auth";

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [role, setRole] = useState<UserRole>("owner");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password, role);
      router.replace("/(tabs)/dashboard");
    } catch (e: any) {
      setError(e?.message ?? "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoRow}>
            <View style={styles.logo}>
              <MaterialCommunityIcons name="tire" size={40} color={colors.onBrandPrimary} />
            </View>
            <Text style={styles.brand}>TyreBook</Text>
          </View>

          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to manage your tyre shop</Text>

          {/* Role segmented control */}
          <View style={styles.segment} testID="role-segmented">
            {(["owner", "staff"] as UserRole[]).map((r) => {
              const active = role === r;
              return (
                <TouchableOpacity
                  key={r}
                  testID={`role-${r}`}
                  onPress={() => setRole(r)}
                  activeOpacity={0.85}
                  style={[styles.segItem, active && styles.segItemActive]}
                >
                  <MaterialCommunityIcons
                    name={r === "owner" ? "crown" : "account-tie"}
                    size={18}
                    color={active ? colors.onBrandTertiary : colors.onSurfaceSecondary}
                  />
                  <Text
                    style={[styles.segText, active && { color: colors.onBrandTertiary, fontWeight: "700" }]}
                  >
                    {r === "owner" ? "Owner Login" : "Staff Login"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <AppTextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@tyreshop.in"
              autoCapitalize="none"
              keyboardType="email-address"
              testID="login-email-input"
              leftIcon={
                <MaterialCommunityIcons name="email-outline" size={20} color={colors.muted} />
              }
            />
            <AppTextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password"
              secureTextEntry
              testID="login-password-input"
              leftIcon={
                <MaterialCommunityIcons name="lock-outline" size={20} color={colors.muted} />
              }
            />
          </View>

          {error ? (
            <Text testID="login-error" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <PrimaryButton
            label="Sign in"
            onPress={onSubmit}
            loading={loading}
            testID="login-submit-button"
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don&apos;t have an account?</Text>
            <Link href="/(auth)/signup" asChild>
              <TouchableOpacity testID="go-to-signup">
                <Text style={styles.footerLink}>Sign up</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, paddingTop: spacing.xxl },
  logoRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.xl },
  logo: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  brand: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface },
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.onSurface },
  subtitle: {
    fontSize: fontSize.base,
    color: colors.muted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    padding: 4,
    marginTop: spacing.sm,
  },
  segItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: radius.pill,
    gap: spacing.xs,
  },
  segItemActive: { backgroundColor: colors.brandTertiary },
  segText: { color: colors.onSurfaceSecondary, fontSize: fontSize.base, fontWeight: "600" },
  error: {
    color: colors.error,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  footer: {
    marginTop: spacing.xl,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerText: { color: colors.muted, fontSize: fontSize.base },
  footerLink: {
    color: colors.brandPrimary,
    fontSize: fontSize.base,
    fontWeight: "700",
    marginLeft: spacing.xs,
  },
});
