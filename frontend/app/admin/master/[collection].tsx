import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/src/components/EmptyState";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { useAuth } from "@/src/context/AuthContext";
import {
  createMaster,
  deleteMaster,
  listMaster,
  updateMaster,
  type MasterCollection,
  type MasterItem,
} from "@/src/firebase/master";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

const TITLES: Record<MasterCollection, { title: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; placeholder: string }> = {
  brands: { title: "Brands", icon: "tag-multiple-outline", placeholder: "e.g. MRF" },
  tyreModels: { title: "Tyre Models", icon: "text-box-multiple-outline", placeholder: "e.g. ZLX" },
  tyreSizes: { title: "Tyre Sizes", icon: "ruler-square", placeholder: "e.g. 205/55 R16" },
  vehicleCategories: { title: "Vehicle Categories", icon: "car-multiple", placeholder: "e.g. E-Rickshaw" },
  suppliers: { title: "Suppliers", icon: "truck-outline", placeholder: "e.g. Sri Balaji Tyres" },
};

const ALLOWED: MasterCollection[] = ["brands", "tyreModels", "tyreSizes", "vehicleCategories", "suppliers"];

export default function MasterEditor() {
  const { collection } = useLocalSearchParams<{ collection: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<MasterItem[]>([]);
  const [input, setInput] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validCollection =
    collection && ALLOWED.includes(collection as MasterCollection)
      ? (collection as MasterCollection)
      : null;

  const load = useCallback(async () => {
    if (!validCollection) return;
    setItems(await listMaster(validCollection));
  }, [validCollection]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null; if (user.role !== "owner") return <Redirect href="/(tabs)/settings" />;
  if (!validCollection) return <Redirect href="/admin" />;
  const col = validCollection;
  const meta = TITLES[col];

  const submit = async () => {
    const name = input.trim();
    if (!name) return;
    setLoading(true);
    try {
      if (editId) {
        await updateMaster(col, editId, { name });
      } else {
        await createMaster(col, { name });
      }
      setInput("");
      setEditId(null);
      await load();
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.title}>{meta.title}</Text>
          <Text style={styles.sub}>{items.length} entries</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.formRow}>
          <View style={styles.inputWrap}>
            <MaterialCommunityIcons name={meta.icon} size={20} color={colors.muted} />
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={meta.placeholder}
              placeholderTextColor={colors.muted}
              style={styles.input}
              testID="master-input"
            />
          </View>
          <PrimaryButton
            label={editId ? "Update" : "Add"}
            onPress={submit}
            loading={loading}
            fullWidth={false}
            style={{ paddingHorizontal: spacing.lg }}
            testID="master-add-btn"
          />
        </View>

        {items.length === 0 ? (
          <EmptyState
            title={`No ${meta.title.toLowerCase()} yet`}
            message="Add the first entry using the field above."
            icon={<MaterialCommunityIcons name={meta.icon} size={40} color={colors.brandPrimary} />}
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(x) => x.id}
            contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            renderItem={({ item }) => (
              <View style={styles.row} testID={`master-${item.id}`}>
                <View style={styles.rowIcon}>
                  <MaterialCommunityIcons name={meta.icon} size={20} color={colors.brandPrimary} />
                </View>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <TouchableOpacity
                  onPress={() => {
                    setEditId(item.id);
                    setInput(item.name);
                  }}
                  style={styles.miniBtn}
                  testID={`edit-master-${item.id}`}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.brandPrimary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={async () => {
                    await deleteMaster(col, item.id);
                    await load();
                  }}
                  style={[styles.miniBtn, { marginLeft: 6 }]}
                  testID={`delete-master-${item.id}`}
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
  formRow: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    height: 48,
  },
  input: { flex: 1, color: colors.onSurface, fontSize: fontSize.base, paddingVertical: 0 },
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
  rowTitle: { flex: 1, fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
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
