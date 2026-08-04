import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
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
  TYRE_CLASSES,
  VEHICLE_CATEGORIES,
  type ConstructionType,
  type TubeType,
  type TyreClass,
  type VehicleCategoryId,
} from "@/src/constants/inventory";
import { createTyre, getTyre, updateTyre } from "@/src/firebase/inventory";
import { usePermissions } from "@/src/hooks/usePermissions";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

export default function TyreForm() {
  const router = useRouter();
  const perms = usePermissions();
  const params = useLocalSearchParams<{ id?: string; category?: VehicleCategoryId; tyreClass?: TyreClass }>();
  const editingId = params.id;

  const [tyreClass, setTyreClass] = useState<TyreClass>((params.tyreClass as TyreClass) ?? "new");
  const [categoryId, setCategoryId] = useState<VehicleCategoryId>(
    (params.category as VehicleCategoryId) ?? "car",
  );
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [pattern, setPattern] = useState("");
  const [size, setSize] = useState("");
  const [tubeType, setTubeType] = useState<TubeType>("Tubeless");
  const [construction, setConstruction] = useState<ConstructionType>("Radial");
  const [plyRating, setPlyRating] = useState("");
  const [loadIndex, setLoadIndex] = useState("");
  const [speedRating, setSpeedRating] = useState("");
  const [vehicleCompatibility, setVehicleCompatibility] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [mrp, setMrp] = useState("");
  const [companyPriceList, setCompanyPriceList] = useState("");
  const [minStockAlert, setMinStockAlert] = useState("");
  const [currentStock, setCurrentStock] = useState("");
  const [rackNumber, setRackNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isDetailed = tyreClass === "new";

  useEffect(() => {
    if (perms.loading) return;
    if (!perms.canEditStock) return;
    (async () => {
      if (!editingId) return;
      const t = await getTyre(editingId);
      if (!t) return;
      setTyreClass(t.tyreClass ?? "new");
      setCategoryId(t.categoryId);
      setBrand(t.brand);
      setModel(t.model);
      setPattern(t.pattern ?? "");
      setSize(t.size);
      setTubeType(t.tubeType);
      setConstruction(t.construction);
      setPlyRating(t.plyRating);
      setLoadIndex(t.loadIndex ?? "");
      setSpeedRating(t.speedRating ?? "");
      setVehicleCompatibility(t.vehicleCompatibility ?? "");
      setPurchasePrice(String(t.purchasePrice ?? ""));
      setSellingPrice(String(t.sellingPrice ?? ""));
      setMrp(String(t.mrp ?? ""));
      setCompanyPriceList(String(t.companyPriceList ?? ""));
      setMinStockAlert(String(t.minStockAlert ?? ""));
      setCurrentStock(String(t.currentStock ?? ""));
      setRackNumber(t.rackNumber ?? "");
    })();
  }, [editingId, perms.loading, perms.canEditStock]);

  // Wait for the auth hydration to finish before deciding to redirect —
  // otherwise a hard refresh on this route bounces the Owner back to the
  // Inventory tab because `user` is momentarily null.
  if (perms.loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <View style={{ width: 40 }} />
          <Text style={styles.title}>Loading…</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>
    );
  }
  if (!perms.canEditStock) return <Redirect href="/(tabs)/inventory" />;

  const onSave = async () => {
    setErr(null);
    if (!brand.trim() || !size.trim()) {
      setErr("Brand and tyre size are required.");
      return;
    }
    if (isDetailed && !model.trim()) {
      setErr("Model is required for new tyres.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        categoryId,
        tyreClass,
        brand: brand.trim(),
        model: model.trim() || "-",
        pattern: pattern.trim() || "-",
        size: size.trim(),
        tubeType,
        construction,
        plyRating: plyRating.trim() || "-",
        loadIndex: loadIndex.trim() || "-",
        speedRating: speedRating.trim().toUpperCase() || "-",
        vehicleCompatibility: vehicleCompatibility.trim(),
        purchasePrice: Number(purchasePrice) || 0,
        sellingPrice: Number(sellingPrice) || 0,
        mrp: Number(mrp) || 0,
        companyPriceList: Number(companyPriceList) || 0,
        minStockAlert: Number(minStockAlert) || 3,
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
          <Text style={styles.label}>Tyre Class</Text>
          <ChipRow
            options={TYRE_CLASSES.map((c) => ({ value: c.value, label: c.label }))}
            value={tyreClass}
            onChange={setTyreClass}
            testIDPrefix="tyre-class"
          />

          <View style={{ height: spacing.md }} />
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
            <AppTextField label="Pattern" value={pattern} onChangeText={setPattern} placeholder="e.g. Nylo Grip Zapper" testID="tyre-pattern" />
            <AppTextField label="Tyre Size" value={size} onChangeText={setSize} placeholder="e.g. 205/55 R16" testID="tyre-size" />
            <AppTextField
              label="Vehicle Compatibility"
              value={vehicleCompatibility}
              onChangeText={setVehicleCompatibility}
              placeholder="Honda Activa 6G, Suzuki Access 125"
              testID="tyre-compat"
            />

            {isDetailed ? (
              <>
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
                <View style={styles.priceRow}>
                  <View style={{ flex: 1, marginRight: spacing.sm }}>
                    <AppTextField
                      label="Ply Rating"
                      value={plyRating}
                      onChangeText={setPlyRating}
                      placeholder="e.g. 8"
                      keyboardType="number-pad"
                      testID="tyre-ply"
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <AppTextField
                      label="Load Index"
                      value={loadIndex}
                      onChangeText={setLoadIndex}
                      placeholder="e.g. 91"
                      keyboardType="number-pad"
                      testID="tyre-load-index"
                    />
                  </View>
                </View>
                <AppTextField
                  label="Speed Rating"
                  value={speedRating}
                  onChangeText={setSpeedRating}
                  placeholder="e.g. H, V, W"
                  autoCapitalize="characters"
                  testID="tyre-speed-rating"
                />
              </>
            ) : null}

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
                  label="MRP (₹)"
                  value={mrp}
                  onChangeText={setMrp}
                  keyboardType="numeric"
                  placeholder="Max Retail Price"
                  testID="tyre-mrp"
                />
              </View>
            </View>
            <View style={styles.priceRow}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <AppTextField
                  label="Company Price List (₹)"
                  value={companyPriceList}
                  onChangeText={setCompanyPriceList}
                  keyboardType="numeric"
                  placeholder="Dealer list price"
                  testID="tyre-company-price"
                />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <AppTextField
                  label="Retail Price (₹)"
                  value={sellingPrice}
                  onChangeText={setSellingPrice}
                  keyboardType="numeric"
                  placeholder="Counter selling"
                  testID="tyre-selling-price"
                />
              </View>
            </View>
            <View style={styles.priceRow}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <AppTextField
                  label="Min Stock Alert"
                  value={minStockAlert}
                  onChangeText={setMinStockAlert}
                  keyboardType="number-pad"
                  placeholder="3"
                  testID="tyre-min-alert"
                />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <AppTextField
                  label="Current Stock"
                  value={currentStock}
                  onChangeText={setCurrentStock}
                  keyboardType="number-pad"
                  placeholder="0"
                  testID="tyre-stock"
                />
              </View>
            </View>
            <AppTextField
              label="Rack Number"
              value={rackNumber}
              onChangeText={setRackNumber}
              placeholder="e.g. R-12"
              testID="tyre-rack"
            />
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
