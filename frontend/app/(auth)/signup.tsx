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

export default function SignupScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [role, setRole] = useState<UserRole>("owner");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!name.trim() || !email.trim() || !password) {
      setError("Please fill all required fields.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      await signUp(name.trim(), email.trim(), password, role);
      router.replace("/(tabs)/dashboard");
    } catch (e: any) {
      setError(e?.message ?? "Signup failed. Please try again.");
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
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.logoRow}>
            <View style={styles.logo}>
              <MaterialCommunityIcons name="tire" size={40} color={colors.onBrandPrimary} />
            </View>
            <Text style={styles.brand}>TyreBook</Text>
          </View>

          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Set up your tyre shop in minutes</Text>

          <View style={styles.segment}>
            {(["owner", "staff"] as UserRole[]).map((r) => {
              const active = role === r;
              return (
                <TouchableOpacity
                  key={r}
                  testID={`signup-role-${r}`}
                  onPress={() => setRole(r)}
                  activeOpacity={0.85}
                  style={[styles.segItem, active && styles.segItemActive]}
                >
                  <Text
                    style={[styles.segText, active && { color: colors.onBrandTertiary, fontWeight: "700" }]}
                  >
                    {r === "owner" ? "Owner" : "Staff"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <AppTextField
              label="Full name"
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              testID="signup-name-input"
              leftIcon={<MaterialCommunityIcons name="account-outline" size={20} color={colors.muted} />}
            />
            <AppTextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@tyreshop.in"
              autoCapitalize="none"
              keyboardType="email-address"
              testID="signup-email-input"
              leftIcon={<MaterialCommunityIcons name="email-outline" size={20} color={colors.muted} />}
            />
            <AppTextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Minimum 6 characters"
              secureTextEntry
              testID="signup-password-input"
              leftIcon={<MaterialCommunityIcons name="lock-outline" size={20} color={colors.muted} />}
            />
          </View>

          {error ? (
            <Text testID="signup-error" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <PrimaryButton
            label="Create account"
            onPress={onSubmit}
            loading={loading}
            testID="signup-submit-button"
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity testID="go-to-login">
                <Text style={styles.footerLink}>Sign in</Text>
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
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  segItemActive: { backgroundColor: colors.brandTertiary },
  segText: { color: colors.onSurfaceSecondary, fontSize: fontSize.base, fontWeight: "600" },
  error: { color: colors.error, fontSize: fontSize.sm, marginBottom: spacing.md },
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
