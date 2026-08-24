import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useAuth } from "@/src/context/AuthContext";
import { colors, fontSize, spacing } from "@/src/theme/tokens";

// Duration of the splash before we hand off to routing. 2.4 s gives the
// fade-in + scale a chance to breathe on cold-start without feeling slow.
const SPLASH_MS = 2400;

export default function Index() {
  const { user, initializing } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.7);
  const wordmarkOpacity = useSharedValue(0);
  const wordmarkTranslate = useSharedValue(12);
  const spinnerRot = useSharedValue(0);

  useEffect(() => {
    // Logo fades in and scales up
    logoOpacity.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    logoScale.value = withSequence(
      withTiming(1.08, { duration: 600, easing: Easing.out(Easing.cubic) }),
      withTiming(1.0, { duration: 350, easing: Easing.inOut(Easing.quad) }),
    );
    // Wordmark + tagline slide up shortly after the logo starts
    wordmarkOpacity.value = withDelay(
      280,
      withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }),
    );
    wordmarkTranslate.value = withDelay(
      280,
      withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) }),
    );
    // Loader spinner
    spinnerRot.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.linear }),
      -1,
      false,
    );

    const t = setTimeout(() => setShowSplash(false), SPLASH_MS);
    return () => clearTimeout(t);
    // shared values are stable — safe to depend on []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));
  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
    transform: [{ translateY: wordmarkTranslate.value }],
  }));
  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinnerRot.value * 360}deg` }],
  }));

  if (showSplash || initializing) {
    return (
      <View style={styles.wrap} testID="splash-screen">
        {/* Deep-navy top and bottom "wave" gradient bars mimic the splash reference. */}
        <View style={styles.topWave} pointerEvents="none" />
        <View style={styles.bottomWave} pointerEvents="none" />

        <View style={styles.content}>
          <Animated.View style={[styles.logoWrap, logoStyle]}>
            {/* Uses the same icon.png that Android/iOS launcher use — keeps
                the brand feel consistent across launcher and splash. */}
            <Image
              source={require("../assets/images/icon.png")}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="TYRE KHATA logo"
            />
          </Animated.View>

          <Animated.View style={[styles.wordmarkBlock, wordmarkStyle]}>
            <Text style={styles.wordmark}>
              <Text style={styles.wordmarkDark}>TYRE</Text>
              <Text style={styles.wordmarkBright}>KHATA</Text>
            </Text>
            <View style={styles.rule} />
            <View style={styles.secureRow}>
              <Text style={styles.secureIcon}>🔒</Text>
              <Text style={styles.tagline}>Secure &amp; Protected</Text>
            </View>
          </Animated.View>
        </View>

        <View style={styles.loaderRow}>
          <Animated.View style={[styles.spinner, spinnerStyle]} />
          <Text style={styles.loading}>Loading…</Text>
        </View>
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
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  // Decorative navy wave bars top and bottom — pure View shapes, no images.
  topWave: {
    position: "absolute",
    top: -160,
    left: -60,
    right: -60,
    height: 300,
    backgroundColor: colors.surfaceInverse,
    borderBottomLeftRadius: 220,
    borderBottomRightRadius: 220,
    opacity: 0.95,
  },
  bottomWave: {
    position: "absolute",
    bottom: -160,
    left: -60,
    right: -60,
    height: 300,
    backgroundColor: colors.surfaceInverse,
    borderTopLeftRadius: 220,
    borderTopRightRadius: 220,
    opacity: 0.95,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xl,
  },
  logoWrap: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { width: 160, height: 160 },
  wordmarkBlock: { alignItems: "center", gap: spacing.sm },
  wordmark: {
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  wordmarkDark: { color: colors.brandSecondary },
  wordmarkBright: { color: colors.brand },
  rule: {
    width: 96,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.brand,
    opacity: 0.6,
  },
  tagline: {
    fontSize: fontSize.base,
    color: colors.onSurfaceSecondary,
    letterSpacing: 0.4,
    fontWeight: "600",
  },
  secureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  secureIcon: {
    fontSize: fontSize.base,
  },
  loaderRow: {
    position: "absolute",
    bottom: 90,
    alignItems: "center",
    gap: spacing.sm,
  },
  spinner: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 4,
    borderColor: colors.border,
    borderTopColor: colors.brand,
  },
  loading: {
    fontSize: fontSize.sm,
    color: colors.onSurfaceSecondary,
    fontWeight: "600",
  },
});
