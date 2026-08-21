// Primary login screen — Mobile OTP as the main method, small "Admin
// Login" toggle for the super-admin email/password path.
//
// Two internal modes:
//   * "otp-phone"  → collect +91 mobile, send OTP via Firebase Phone Auth.
//   * "otp-code"   → collect the 6-digit code, verify.
//   * "admin"      → email + password (existing super-admin flow).
//
// Persistent login is handled by Firebase Auth's default local persistence
// (SecureStore-backed on native, IndexedDB on web) so no extra work here.

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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
import {
  isValidIndianMobile,
  resetRecaptcha,
  sendOtp,
  verifyOtp,
  type OtpTicket,
} from "@/src/firebase/auth";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

const RESEND_SECONDS = 30;
const RECAPTCHA_ID = "tyrebook-recaptcha";

type Mode = "otp-phone" | "otp-code" | "admin";

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [mode, setMode] = useState<Mode>("otp-phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState<OtpTicket | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // reCAPTCHA verifier is DOM-only. Clean up on unmount so returning to
  // this screen creates a fresh verifier (Firebase rejects stale ones).
  useEffect(() => {
    return () => {
      resetRecaptcha();
      if (resendTimer.current) clearInterval(resendTimer.current);
    };
  }, []);

  const startResendCountdown = () => {
    setResendIn(RESEND_SECONDS);
    if (resendTimer.current) clearInterval(resendTimer.current);
    resendTimer.current = setInterval(() => {
      setResendIn((n) => {
        if (n <= 1) {
          if (resendTimer.current) clearInterval(resendTimer.current);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
  };

  const handleSendOtp = async () => {
    setError(null);
    if (!isValidIndianMobile(phone)) {
      setError("Please enter a valid 10-digit Indian mobile number.");
      return;
    }
    setLoading(true);
    try {
      // Web needs the reCAPTCHA container id; native ignores it entirely
      // (RNFB uses Play Integrity / silent verification and does NOT
      // render a reCAPTCHA challenge).
      const t = await sendOtp(
        phone,
        Platform.OS === "web" ? { recaptchaContainerId: RECAPTCHA_ID } : {},
      );
      setTicket(t);
      setMode("otp-code");
      setCode("");
      startResendCountdown();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    if (!ticket) {
      setError("Please request an OTP first.");
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(ticket, code);
      // AuthContext's onAuthStateChanged listener will pick up the new
      // Firebase user and route us; we just navigate back to the entry
      // point which re-computes the destination based on role/shop.
      router.replace("/");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e ?? "");
      if (msg.includes("invalid-verification-code")) {
        setError("That OTP doesn't match. Please check and try again.");
      } else {
        setError(msg || "Could not verify OTP.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendIn > 0) return;
    setCode("");
    await handleSendOtp();
  };

  const handleAdminSignIn = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError("Please enter your admin email and password.");
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/(tabs)/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand header */}
          <View style={styles.brandRow}>
            <View style={styles.logoTile}>
              <MaterialCommunityIcons name="car-tire-alert" size={30} color="#FFFFFF" />
            </View>
            <Text style={styles.brand}>
              <Text style={styles.brandDark}>TYRE</Text>
              <Text style={styles.brandBright}>KHATA</Text>
            </Text>
          </View>

          {mode === "admin" ? (
            <>
              <Text style={styles.title}>Admin login</Text>
              <Text style={styles.subtitle}>Sign in with email and password</Text>

              <View style={{ marginTop: spacing.xl }}>
                <AppTextField
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="admin@tyrebook.com"
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

              {error ? <Text testID="login-error" style={styles.error}>{error}</Text> : null}

              <PrimaryButton
                label="Sign in"
                onPress={handleAdminSignIn}
                loading={loading}
                testID="login-submit-button"
              />

              <TouchableOpacity
                onPress={() => {
                  setError(null);
                  setMode("otp-phone");
                }}
                style={styles.linkRow}
                testID="switch-to-otp"
              >
                <MaterialCommunityIcons name="cellphone-message" size={16} color={colors.brand} />
                <Text style={styles.linkText}>Back to mobile OTP login</Text>
              </TouchableOpacity>
            </>
          ) : mode === "otp-phone" ? (
            <>
              <Text style={styles.title}>Sign in</Text>
              <Text style={styles.subtitle}>
                Enter your mobile number to receive a 6-digit OTP.
              </Text>

              <View style={{ marginTop: spacing.xl }}>
                <View style={styles.phoneRow}>
                  <View style={styles.ccBox}>
                    <Text style={styles.ccText}>+91</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppTextField
                      label="Mobile number"
                      value={phone}
                      onChangeText={(v) => setPhone(v.replace(/\D+/g, "").slice(0, 10))}
                      placeholder="10-digit mobile"
                      keyboardType="number-pad"
                      maxLength={10}
                      testID="login-phone-input"
                      leftIcon={
                        <MaterialCommunityIcons
                          name="cellphone"
                          size={20}
                          color={colors.muted}
                        />
                      }
                    />
                  </View>
                </View>
              </View>

              {error ? <Text testID="login-error" style={styles.error}>{error}</Text> : null}

              <PrimaryButton
                label={loading ? "Sending OTP…" : "Send OTP"}
                onPress={handleSendOtp}
                loading={loading}
                disabled={phone.length !== 10}
                testID="send-otp-btn"
              />

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                onPress={() => {
                  setError(null);
                  setMode("admin");
                }}
                style={styles.adminChip}
                testID="switch-to-admin"
              >
                <MaterialCommunityIcons
                  name="shield-account-outline"
                  size={16}
                  color={colors.brandSecondary}
                />
                <Text style={styles.adminChipText}>Admin login (email &amp; password)</Text>
              </TouchableOpacity>
            </>
          ) : (
            // otp-code
            <>
              <Text style={styles.title}>Enter OTP</Text>
              <Text style={styles.subtitle}>
                We&apos;ve sent a 6-digit code to {ticket?.phoneNumber ?? "your mobile"}.
              </Text>

              <View style={{ marginTop: spacing.xl }}>
                <AppTextField
                  label="6-digit OTP"
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D+/g, "").slice(0, 6))}
                  placeholder="123456"
                  keyboardType="number-pad"
                  maxLength={6}
                  testID="login-otp-input"
                  leftIcon={
                    <MaterialCommunityIcons
                      name="numeric"
                      size={20}
                      color={colors.muted}
                    />
                  }
                />
              </View>

              {error ? <Text testID="login-error" style={styles.error}>{error}</Text> : null}

              <PrimaryButton
                label={loading ? "Verifying…" : "Verify & sign in"}
                onPress={handleVerifyOtp}
                loading={loading}
                disabled={code.length !== 6}
                testID="verify-otp-btn"
              />

              <View style={styles.resendRow}>
                <Text style={styles.resendPrompt}>Didn&apos;t receive it?</Text>
                <TouchableOpacity
                  disabled={resendIn > 0 || loading}
                  onPress={handleResendOtp}
                  testID="resend-otp-btn"
                >
                  <Text
                    style={[
                      styles.resendLink,
                      (resendIn > 0 || loading) && { color: colors.muted },
                    ]}
                  >
                    {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={() => {
                  setError(null);
                  setMode("otp-phone");
                  setCode("");
                }}
                style={styles.linkRow}
                testID="change-phone"
              >
                <MaterialCommunityIcons
                  name="pencil-outline"
                  size={16}
                  color={colors.brand}
                />
                <Text style={styles.linkText}>Change mobile number</Text>
              </TouchableOpacity>
            </>
          )}

          <Text style={styles.legal}>
            By continuing you agree to TYRE KHATA&apos;s Terms of Service and Privacy Policy.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* reCAPTCHA host — required by Firebase Phone Auth on Web. Rendering
          an empty View with nativeID injects a matching DOM element on
          Expo Web. On native it's just an inert 0-height view. */}
      <View nativeID={RECAPTCHA_ID} style={styles.recaptchaHost} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, paddingTop: spacing.xxl },
  brandRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.xxl },
  logoTile: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  brand: { fontSize: 26, fontWeight: "900", letterSpacing: 1 },
  brandDark: { color: colors.brandSecondary },
  brandBright: { color: colors.brand },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface },
  subtitle: {
    fontSize: fontSize.base,
    color: colors.onSurfaceSecondary,
    marginTop: spacing.xs,
  },
  phoneRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-end" },
  ccBox: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  ccText: { color: colors.onBrandTertiary, fontWeight: "700", fontSize: fontSize.base },
  error: {
    color: colors.error,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
    marginTop: -spacing.sm,
  },
  resendRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  resendPrompt: { color: colors.muted, fontSize: fontSize.sm },
  resendLink: { color: colors.brand, fontSize: fontSize.sm, fontWeight: "700" },

  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.xl,
    gap: spacing.md,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.divider },
  dividerText: { color: colors.muted, fontSize: fontSize.sm, fontWeight: "600" },

  adminChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  adminChipText: { color: colors.brandSecondary, fontWeight: "700", fontSize: fontSize.sm },

  linkRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  linkText: { color: colors.brand, fontSize: fontSize.sm, fontWeight: "700" },

  legal: {
    marginTop: spacing.xxl,
    color: colors.muted,
    fontSize: fontSize.xs,
    textAlign: "center",
    lineHeight: 16,
  },
  recaptchaHost: { position: "absolute", bottom: 0, height: 0, width: 0 },
});
