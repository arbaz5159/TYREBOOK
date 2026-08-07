import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/PrimaryButton";
import { useAuth } from "@/src/context/AuthContext";
import {
  effectiveStatus,
  extendPlanDays,
  extendTrialDays,
  getShop,
  setShopStatus,
  type Shop,
} from "@/src/firebase/shops";
import { setActiveShopId } from "@/src/firebase/tenant";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

// Per-shop management screen for Super Admin. Actions:
//   - Enter shop (opens Owner Admin Panel scoped to this tenant)
//   - Change subscription status
//   - Extend trial / renew plan by N days
//   - Suspend / re-activate

function fmt(ts?: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function confirm(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: "Confirm", onPress: onConfirm, style: "destructive" },
  ]);
}

export default function SuperAdminShopDetail() {
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const s = await getShop(id);
      setShop(s);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;
  if (user.role !== "super_admin") return <Redirect href="/(tabs)/dashboard" />;
  if (!id) return <Redirect href="/super-admin" />;

  const status = effectiveStatus(shop);

  const runAction = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg(`${label} ✓`);
      await load();
    } catch (e: any) {
      setMsg(`${label} failed: ${e?.message ?? "unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  const enterShop = () => {
    if (!shop) return;
    setActiveShopId(shop.id);
    router.push("/admin");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="super-shop-back">
          <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.title}>{shop?.name ?? "Loading…"}</Text>
          <Text style={styles.sub}>{shop?.id}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading || !shop ? (
          <Text style={styles.body}>Loading shop details…</Text>
        ) : (
          <>
            <View style={styles.card}>
              <Row label="Owner email" value={shop.ownerEmail} />
              <Row label="Owner UID" value={shop.ownerUid} />
              <Row label="Created" value={fmt(shop.createdAt)} />
              <Row label="Status" value={status} highlight />
              <Row label="Trial ends" value={fmt(shop.trialEndsAt)} />
              <Row label="Plan expires" value={fmt(shop.planExpiresAt)} />
            </View>

            <PrimaryButton
              label="Enter this shop"
              onPress={enterShop}
              testID="super-enter-shop"
            />

            <View style={{ height: spacing.md }} />
            <Text style={styles.sectionTitle}>Subscription actions</Text>

            <View style={styles.grid}>
              <ActionButton
                icon="clock-plus-outline"
                label="Extend trial 14d"
                onPress={() => runAction("Trial extended", () => extendTrialDays(shop.id, 14))}
                disabled={busy}
                testID="action-trial-14"
              />
              <ActionButton
                icon="calendar-check-outline"
                label="Renew 30 days"
                onPress={() => runAction("Plan renewed 30d", () => extendPlanDays(shop.id, 30))}
                disabled={busy}
                testID="action-renew-30"
              />
              <ActionButton
                icon="calendar-star"
                label="Renew 1 year"
                onPress={() => runAction("Plan renewed 1yr", () => extendPlanDays(shop.id, 365))}
                disabled={busy}
                testID="action-renew-365"
              />
              <ActionButton
                icon="lock-outline"
                label="Suspend"
                tint="#FFDAD6"
                fg={colors.error}
                onPress={() =>
                  confirm(
                    "Suspend shop",
                    "Members will be immediately locked out until reactivated.",
                    () => runAction("Shop suspended", () => setShopStatus(shop.id, "suspended")),
                  )
                }
                disabled={busy}
                testID="action-suspend"
              />
              <ActionButton
                icon="check-circle-outline"
                label="Activate"
                onPress={() =>
                  runAction("Shop activated", () =>
                    extendPlanDays(shop.id, shop.planExpiresAt && shop.planExpiresAt > Date.now() ? 0 : 30),
                  )
                }
                disabled={busy}
                testID="action-activate"
              />
              <ActionButton
                icon="clock-alert-outline"
                label="Mark expired"
                onPress={() =>
                  confirm(
                    "Mark expired",
                    "Members will see the renew screen immediately.",
                    () => runAction("Shop marked expired", () => setShopStatus(shop.id, "expired")),
                  )
                }
                disabled={busy}
                testID="action-expire"
              />
            </View>

            {msg ? <Text style={styles.msg}>{msg}</Text> : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          highlight && { textTransform: "capitalize", color: colors.brandPrimary, fontWeight: "800" },
        ]}
      >
        {value || "—"}
      </Text>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
  tint,
  fg,
  testID,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tint?: string;
  fg?: string;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[styles.action, { backgroundColor: tint ?? colors.brandTertiary }, disabled && { opacity: 0.4 }]}
      testID={testID}
    >
      <MaterialCommunityIcons name={icon} size={22} color={fg ?? colors.onBrandTertiary} />
      <Text style={[styles.actionLabel, { color: fg ?? colors.onBrandTertiary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: "#0F172A",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: fontSize.xl, fontWeight: "800", color: "#FFFFFF" },
  sub: { fontSize: fontSize.xs, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  card: {
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    gap: spacing.md,
  },
  rowLabel: { fontSize: fontSize.xs, color: colors.muted, fontWeight: "600" },
  rowValue: {
    fontSize: fontSize.sm,
    color: colors.onSurface,
    fontWeight: "700",
    flex: 1,
    textAlign: "right",
  },
  body: { fontSize: fontSize.base, color: colors.muted, textAlign: "center" },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.sm,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: {
    flexBasis: "48%",
    flexGrow: 1,
    minHeight: 72,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 4,
  },
  actionLabel: { fontSize: fontSize.sm, fontWeight: "700" },
  msg: { marginTop: spacing.md, fontSize: fontSize.sm, color: colors.brandPrimary, fontWeight: "600" },
});
