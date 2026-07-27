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
import { VEHICLE_CATEGORIES, type VehicleCategoryId, type VehicleModel } from "@/src/constants/inventory";
import {
  createVehicle,
  deleteVehicle,
  listVehicles,
  seedStarterVehicles,
  updateVehicle,
} from "@/src/firebase/vehicles";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

export default function VehiclesAdmin() {
  const router = useRouter();
  const { user } = useAuth();

  const [items, setItems] = useState<VehicleModel[]>([]);
  const [name, setName] = useState("");
  const [front, setFront] = useState("");
  const [rear, setRear] = useState("");
  const [category, setCategory] = useState<VehicleCategoryId>("bike");
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    await seedStarterVehicles();
    setItems(await listVehicles());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null; if (user.role !== "owner") return <Redirect href="/(tabs)/settings" />;

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = { name: name.trim(), frontSize: front.trim(), rearSize: rear.trim(), category };
      if (editId) await updateVehicle(editId, payload);
      else await createVehicle(payload);
      setName("");
      setFront("");
      setRear("");
      setCategory("bike");
      setEditId(null);
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
          <Text style={styles.title}>Vehicles</Text>
          <Text style={styles.sub}>{items.length} models · Powers global search</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.form}>
          <AppTextField label="Vehicle Name" value={name} onChangeText={setName} placeholder="e.g. Honda Activa 6G" testID="veh-name" />
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <AppTextField label="Front Size" value={front} onChangeText={setFront} placeholder="e.g. 90/90-12" testID="veh-front" />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <AppTextField label="Rear Size" value={rear} onChangeText={setRear} placeholder="e.g. 90/100-10" testID="veh-rear" />
            </View>
          </View>
          <Text style={styles.label}>Category</Text>
          <ChipRow
            options={VEHICLE_CATEGORIES.map((c) => ({ value: c.id, label: c.name }))}
            value={category}
            onChange={setCategory}
            testIDPrefix="veh-cat"
          />
          <View style={{ marginTop: spacing.md }}>
            <PrimaryButton label={editId ? "Update Vehicle" : "Add Vehicle"} onPress={submit} loading={saving} testID="veh-save-btn" />
          </View>
        </View>

        {items.length === 0 ? (
          <EmptyState
            title="No vehicles"
            message="Add a vehicle model with its front/rear tyre size."
            icon={<MaterialCommunityIcons name="car-multiple" size={40} color={colors.brandPrimary} />}
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(v) => v.id}
            contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            renderItem={({ item }) => (
              <View style={styles.row} testID={`veh-${item.id}`}>
                <View style={styles.rowIcon}>
                  <MaterialCommunityIcons name="car-info" size={20} color={colors.brandPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  <Text style={styles.rowSub}>Front: {item.frontSize || "—"} · Rear: {item.rearSize || "—"}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setEditId(item.id);
                    setName(item.name);
                    setFront(item.frontSize);
                    setRear(item.rearSize);
                    setCategory(item.category);
                  }}
                  style={styles.miniBtn}
                  testID={`edit-veh-${item.id}`}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.brandPrimary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => deleteVehicle(item.id).then(load)}
                  style={[styles.miniBtn, { marginLeft: 6 }]}
                  testID={`delete-veh-${item.id}`}
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
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  rowTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
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
