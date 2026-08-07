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

// Signup is now role-less: the platform decides based on the email.
//   - If EXPO_PUBLIC_SUPER_ADMIN_EMAILS contains this email → super_admin
//   - Else if a pending shopInvites/{email} exists                → staff (auto-linked)
//   - Else                                                        → shop_admin
//     (a new tenant is auto-created with a 14-day trial)
export default function SignupScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [shopName, setShopName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!name.trim() || !email.trim() || !password) {
      setError("Please fill your name, email and password.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      await signUp(name.trim(), email.trim(), password, shopName.trim() || undefined);
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

          <Text style={styles.title}>Create your shop</Text>
          <Text style={styles.subtitle}>Start a 14-day free trial. No card needed.</Text>

          <View style={styles.hintCard}>
            <MaterialCommunityIcons name="information-outline" size={20} color={colors.brandPrimary} />
            <Text style={styles.hintText}>
              Invited by another shop? Just sign up with the same email you were invited
              on — you&apos;ll join their team automatically.
            </Text>
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <AppTextField
              label="Your full name"
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              testID="signup-name-input"
              leftIcon={<MaterialCommunityIcons name="account-outline" size={20} color={colors.muted} />}
            />
            <AppTextField
              label="Shop name (optional)"
              value={shopName}
              onChangeText={setShopName}
              placeholder="e.g. QA Tyre House"
              testID="signup-shop-name-input"
              leftIcon={<MaterialCommunityIcons name="storefront-outline" size={20} color={colors.muted} />}
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
            label="Start free trial"
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
  hintCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.brandTertiary,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  hintText: { flex: 1, fontSize: fontSize.xs, color: colors.onBrandTertiary, lineHeight: 18 },
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
