import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppTextField } from "@/src/components/AppTextField";
import { EmptyState } from "@/src/components/EmptyState";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { useAuth } from "@/src/context/AuthContext";
import {
  deleteUser,
  inviteStaff,
  listInvitesForShop,
  listUsers,
  revokeInvite,
  updateUser,
  type StaffUser,
} from "@/src/firebase/users";
import type { ShopInvite } from "@/src/firebase/invites";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

// Convert Firestore Timestamp / seconds / unix-ms to a local date string.
function fmtInviteDate(ts: any): string {
  if (ts == null) return "—";
  let ms: number | null = null;
  if (typeof ts === "number") ms = ts;
  else if (typeof ts === "object" && typeof ts.toDate === "function") ms = ts.toDate().getTime();
  else if (typeof ts === "object" && typeof ts.seconds === "number") ms = ts.seconds * 1000;
  else {
    const n = Number(ts);
    if (Number.isFinite(n)) ms = n;
  }
  if (ms == null) return "—";
  return new Date(ms).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Shop Admin — team management via invites.
//
// The old flow (create user + password inside the app) is gone; users
// authenticate through Firebase Auth, so we invite them by email and the
// signup flow auto-links them to this shop.

export default function ManageUsers() {
  const router = useRouter();
  const { user } = useAuth();

  const [members, setMembers] = useState<StaffUser[]>([]);
  const [invites, setInvites] = useState<ShopInvite[]>([]);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setMembers(await listUsers());
    if (user?.shopId) setInvites(await listInvitesForShop(user.shopId));
  }, [user?.shopId]);
  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;
  if (user.role === "staff") return <Redirect href="/(tabs)/settings" />;
  if (user.role === "super_admin" && !user.shopId) return <Redirect href="/super-admin" />;

  const submit = async () => {
    setMsg(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setMsg("Enter a valid email address.");
      return;
    }
    if (!user.shopId) {
      setMsg("No active shop selected.");
      return;
    }
    setSaving(true);
    try {
      await inviteStaff({ email: trimmed, shopId: user.shopId, invitedByUid: user.uid });
      setMsg(`Invite sent to ${trimmed}. They'll join your shop after signup.`);
      setEmail("");
      await load();
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to send invite.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.title}>Manage Team</Text>
          <Text style={styles.sub}>{members.length} members · {invites.length} pending invites</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.form}>
          <AppTextField
            label="Invite staff by email"
            value={email}
            onChangeText={setEmail}
            placeholder="staff@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            testID="invite-email"
          />
          <View style={{ marginTop: spacing.sm }}>
            <PrimaryButton label="Send Invite" onPress={submit} loading={saving} testID="send-invite-btn" />
          </View>
          {msg ? <Text style={styles.msg}>{msg}</Text> : null}
          <Text style={styles.hint}>
            The invitee signs up on this app with the same email; they&apos;ll be added to your shop as Staff automatically.
          </Text>
        </View>

        {invites.length ? (
          <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.sm }}>
            <Text style={styles.section}>Pending invites</Text>
            {invites.map((inv) => (
              <View key={inv.id} style={styles.row} testID={`invite-${inv.id}`}>
                <View style={[styles.rowIcon, { backgroundColor: "#FFEAD1" }]}>
                  <MaterialCommunityIcons name="email-fast-outline" size={20} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{inv.email}</Text>
                  <Text style={styles.rowSub}>Awaiting signup · sent {fmtInviteDate(inv.createdAt)}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => revokeInvite(inv.id).then(load)}
                  style={styles.miniBtn}
                  testID={`revoke-${inv.id}`}
                >
                  <MaterialCommunityIcons name="close" size={16} color={colors.error} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={[styles.section, { paddingHorizontal: spacing.xl }]}>Members</Text>
        {members.length === 0 ? (
          <EmptyState
            title="No members yet"
            message="Invite your staff by email — they'll join automatically after signup."
            icon={<MaterialCommunityIcons name="account-group-outline" size={40} color={colors.brandPrimary} />}
          />
        ) : (
          <FlatList
            data={members}
            keyExtractor={(u) => u.id}
            contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            renderItem={({ item }) => (
              <View style={styles.row} testID={`user-${item.id}`}>
                <View style={styles.rowIcon}>
                  <MaterialCommunityIcons
                    name={item.role === "shop_admin" ? "crown" : "account-tie"}
                    size={20}
                    color={colors.brandPrimary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.name || item.email}</Text>
                  <Text style={styles.rowSub}>
                    {item.email} · {(item.role || "staff").replace("_", " ").toUpperCase()} · {item.active ? "Active" : "Disabled"}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => updateUser(item.id, { active: !item.active }).then(load)}
                  style={styles.miniBtn}
                  testID={`toggle-user-${item.id}`}
                >
                  <MaterialCommunityIcons
                    name={item.active ? "eye-off-outline" : "eye-outline"}
                    size={16}
                    color={colors.brandPrimary}
                  />
                </TouchableOpacity>
                {item.role !== "shop_admin" ? (
                  <TouchableOpacity
                    onPress={() => deleteUser(item.id).then(load)}
                    style={[styles.miniBtn, { marginLeft: 6 }]}
                    testID={`delete-user-${item.id}`}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.error} />
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: fontSize.xl, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  form: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  hint: {
    fontSize: fontSize.xs,
    color: colors.muted,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  msg: { marginTop: spacing.sm, fontSize: fontSize.sm, color: colors.brandPrimary, fontWeight: "600" },
  section: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  rowTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: fontSize.xs, color: colors.onSurfaceSecondary, marginTop: 2 },
  miniBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
