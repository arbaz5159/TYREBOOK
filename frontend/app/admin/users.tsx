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
import { ChipRow } from "@/src/components/ChipRow";
import { EmptyState } from "@/src/components/EmptyState";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { useAuth } from "@/src/context/AuthContext";
import { createUser, deleteUser, listUsers, updateUser, type StaffUser } from "@/src/firebase/users";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

export default function ManageUsers() {
  const router = useRouter();
  const { user } = useAuth();

  const [items, setItems] = useState<StaffUser[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "staff">("staff");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setItems(await listUsers());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (user && user.role !== "owner") return <Redirect href="/(tabs)/settings" />;

  const submit = async () => {
    if (!name.trim() || !email.trim()) return;
    setSaving(true);
    try {
      await createUser({ name: name.trim(), email: email.trim(), role, active: true });
      setName("");
      setEmail("");
      setRole("staff");
      await load();
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
          <Text style={styles.title}>Manage Users</Text>
          <Text style={styles.sub}>{items.length} accounts</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.form}>
          <AppTextField label="Full Name" value={name} onChangeText={setName} placeholder="e.g. Rajesh" testID="user-name" />
          <AppTextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="user@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            testID="user-email"
          />
          <Text style={styles.label}>Role</Text>
          <ChipRow
            options={[
              { value: "owner", label: "Owner" },
              { value: "staff", label: "Staff" },
            ]}
            value={role}
            onChange={setRole}
            testIDPrefix="user-role"
          />
          <View style={{ marginTop: spacing.md }}>
            <PrimaryButton label="Add User" onPress={submit} loading={saving} testID="add-user-btn" />
          </View>
        </View>

        {items.length === 0 ? (
          <EmptyState
            title="No staff added"
            message="Add owners and staff who can access this shop."
            icon={<MaterialCommunityIcons name="account-group-outline" size={40} color={colors.brandPrimary} />}
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(u) => u.id}
            contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            renderItem={({ item }) => (
              <View style={styles.row} testID={`user-${item.id}`}>
                <View style={styles.rowIcon}>
                  <MaterialCommunityIcons
                    name={item.role === "owner" ? "crown" : "account-tie"}
                    size={20}
                    color={colors.brandPrimary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  <Text style={styles.rowSub}>
                    {item.email} · {item.role.toUpperCase()} · {item.active ? "Active" : "Disabled"}
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
                <TouchableOpacity
                  onPress={() => deleteUser(item.id).then(load)}
                  style={[styles.miniBtn, { marginLeft: 6 }]}
                  testID={`delete-user-${item.id}`}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.error} />
                </TouchableOpacity>
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
  label: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
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
