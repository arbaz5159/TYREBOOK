import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
import { ChipRow } from "@/src/components/ChipRow";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import {
  CONSTRUCTION_OPTIONS,
  TUBE_OPTIONS,
  VEHICLE_CATEGORIES,
  type ConstructionType,
  type TubeType,
  type VehicleCategoryId,
} from "@/src/constants/inventory";
import { createTyre, getTyre, updateTyre } from "@/src/firebase/inventory";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

export default function TyreForm() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; category?: VehicleCategoryId }>();
  const editingId = params.id;

  const [categoryId, setCategoryId] = useState<VehicleCategoryId>(
    (params.category as VehicleCategoryId) ?? "car",
  );
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [size, setSize] = useState("");
  const [tubeType, setTubeType] = useState<TubeType>("Tubeless");
  const [construction, setConstruction] = useState<ConstructionType>("Radial");
  const [plyRating, setPlyRating] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [currentStock, setCurrentStock] = useState("");
  const [rackNumber, setRackNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!editingId) return;
      const t = await getTyre(editingId);
      if (!t) return;
      setCategoryId(t.categoryId);
      setBrand(t.brand);
      setModel(t.model);
      setSize(t.size);
      setTubeType(t.tubeType);
      setConstruction(t.construction);
      setPlyRating(t.plyRating);
      setPurchasePrice(String(t.purchasePrice ?? ""));
      setSellingPrice(String(t.sellingPrice ?? ""));
      setCurrentStock(String(t.currentStock ?? ""));
      setRackNumber(t.rackNumber ?? "");
    })();
  }, [editingId]);

  const onSave = async () => {
    setErr(null);
    if (!brand.trim() || !model.trim() || !size.trim()) {
      setErr("Brand, model and size are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        categoryId,
        brand: brand.trim(),
        model: model.trim(),
        size: size.trim(),
        tubeType,
        construction,
        plyRating: plyRating.trim() || "-",
        purchasePrice: Number(purchasePrice) || 0,
        sellingPrice: Number(sellingPrice) || 0,
        currentStock: Number(currentStock) || 0,
        rackNumber: rackNumber.trim() || "-",
      };
      if (editingId) await updateTyre(editingId, payload);
      else await createTyre(payload);
      router.back();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save.");
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
        <Text style={styles.title}>{editingId ? "Edit Tyre" : "Add Tyre"}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.label}>Vehicle Category</Text>
          <ChipRow
            options={VEHICLE_CATEGORIES.map((c) => ({ value: c.id, label: c.name }))}
            value={categoryId}
            onChange={setCategoryId}
            testIDPrefix="tyre-category"
          />

          <View style={{ marginTop: spacing.lg }}>
            <AppTextField label="Brand" value={brand} onChangeText={setBrand} placeholder="MRF, Apollo, CEAT…" testID="tyre-brand" />
            <AppTextField label="Tyre Model" value={model} onChangeText={setModel} placeholder="e.g. ZLX" testID="tyre-model" />
            <AppTextField label="Tyre Size" value={size} onChangeText={setSize} placeholder="e.g. 205/55 R16" testID="tyre-size" />

            <Text style={styles.label}>Tube / Tubeless</Text>
            <ChipRow
              options={TUBE_OPTIONS.map((v) => ({ value: v, label: v }))}
              value={tubeType}
              onChange={setTubeType}
              testIDPrefix="tyre-tube"
            />

            <View style={{ height: spacing.md }} />
            <Text style={styles.label}>Radial / Bias</Text>
            <ChipRow
              options={CONSTRUCTION_OPTIONS.map((v) => ({ value: v, label: v }))}
              value={construction}
              onChange={setConstruction}
              testIDPrefix="tyre-construction"
            />

            <View style={{ height: spacing.md }} />
            <AppTextField
              label="Ply Rating"
              value={plyRating}
              onChangeText={setPlyRating}
              placeholder="e.g. 8"
              keyboardType="number-pad"
              testID="tyre-ply"
            />
            <View style={styles.priceRow}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <AppTextField
                  label="Purchase Price (₹)"
                  value={purchasePrice}
                  onChangeText={setPurchasePrice}
                  keyboardType="numeric"
                  placeholder="0"
                  testID="tyre-purchase-price"
                />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <AppTextField
                  label="Selling Price (₹)"
                  value={sellingPrice}
                  onChangeText={setSellingPrice}
                  keyboardType="numeric"
                  placeholder="0"
                  testID="tyre-selling-price"
                />
              </View>
            </View>
            <View style={styles.priceRow}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <AppTextField
                  label="Current Stock"
                  value={currentStock}
                  onChangeText={setCurrentStock}
                  keyboardType="number-pad"
                  placeholder="0"
                  testID="tyre-stock"
                />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <AppTextField
                  label="Rack Number"
                  value={rackNumber}
                  onChangeText={setRackNumber}
                  placeholder="e.g. R-12"
                  testID="tyre-rack"
                />
              </View>
            </View>
          </View>

          {err ? <Text style={styles.err}>{err}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton
            label={editingId ? "Update Tyre" : "Save Tyre"}
            onPress={onSave}
            loading={saving}
            testID="tyre-save-btn"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.xs,
  },
  priceRow: { flexDirection: "row" },
  err: { color: colors.error, fontSize: fontSize.sm, marginTop: spacing.sm },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
});
