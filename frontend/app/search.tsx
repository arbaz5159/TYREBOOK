import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";
import { listTyres } from "@/src/firebase/inventory";
import { listMaster } from "@/src/firebase/master";
import { listCustomers } from "@/src/firebase/sales";
import { listPurchases } from "@/src/firebase/purchase";
import { listVehicles, seedStarterVehicles, splitCompat } from "@/src/firebase/vehicles";
import { CATEGORY_MAP, type Tyre, type VehicleModel } from "@/src/constants/inventory";

interface State {
  q: string;
  tyres: Tyre[];
  vehicles: VehicleModel[];
  suppliers: { id: string; name: string }[];
  customers: { id: string; name: string; mobileNumber: string }[];
  invoices: { supplierName: string; invoiceNumber: string; total: number }[];
}

export default function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [state, setState] = useState<State>({ q: "", tyres: [], vehicles: [], suppliers: [], customers: [], invoices: [] });

  const load = useCallback(async () => {
    await seedStarterVehicles();
    const [tyres, vehicles, suppliers, customers, purchases] = await Promise.all([
      listTyres(),
      listVehicles(),
      listMaster("suppliers"),
      listCustomers(),
      listPurchases(),
    ]);
    setState({
      q: "",
      tyres,
      vehicles,
      suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })),
      customers,
      invoices: purchases.map((p) => ({
        supplierName: p.supplierName,
        invoiceNumber: p.invoiceNumber,
        total: p.totalValue,
      })),
    });
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const term = q.trim().toLowerCase();
  const hasQuery = term.length > 0;

  const vehicleMatch = useMemo<VehicleModel | null>(() => {
    if (!hasQuery) return null;
    return (
      state.vehicles.find((v) => v.name.toLowerCase() === term) ??
      state.vehicles.find((v) => v.name.toLowerCase().includes(term)) ??
      null
    );
  }, [state.vehicles, term, hasQuery]);

  const tyreMatches = useMemo<Tyre[]>(() => {
    if (!hasQuery) return [];
    return state.tyres.filter((t) => {
      const bag = [t.brand, t.model, t.pattern, t.size, t.rackNumber, t.vehicleCompatibility]
        .filter(Boolean)
        .join(" | ")
        .toLowerCase();
      return bag.includes(term);
    });
  }, [state.tyres, term, hasQuery]);

  const vehicleSizeMatches = useMemo<Tyre[]>(() => {
    if (!vehicleMatch) return [];
    const sizes = [vehicleMatch.frontSize, vehicleMatch.rearSize]
      .map((s) => s.toLowerCase())
      .filter(Boolean);
    return state.tyres.filter((t) =>
      sizes.some(
        (s) =>
          t.size.toLowerCase() === s ||
          splitCompat(t.vehicleCompatibility).some((c) => c.toLowerCase() === vehicleMatch.name.toLowerCase()),
      ),
    );
  }, [vehicleMatch, state.tyres]);

  const supplierMatches = useMemo(
    () => (hasQuery ? state.suppliers.filter((s) => s.name.toLowerCase().includes(term)) : []),
    [state.suppliers, term, hasQuery],
  );
  const customerMatches = useMemo(
    () =>
      hasQuery
        ? state.customers.filter(
            (c) => c.name.toLowerCase().includes(term) || c.mobileNumber.includes(term),
          )
        : [],
    [state.customers, term, hasQuery],
  );
  const invoiceMatches = useMemo(
    () => (hasQuery ? state.invoices.filter((i) => i.invoiceNumber.toLowerCase().includes(term)) : []),
    [state.invoices, term, hasQuery],
  );

  const totalHits =
    tyreMatches.length + supplierMatches.length + customerMatches.length + invoiceMatches.length;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={styles.searchWrap}>
          <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Brand, model, size, vehicle, invoice…"
            placeholderTextColor={colors.muted}
            autoFocus
            style={styles.search}
            testID="global-search-input"
          />
          {q ? (
            <TouchableOpacity onPress={() => setQ("")} testID="clear-search">
              <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {!hasQuery ? (
          <View style={styles.tipBox}>
            <Text style={styles.tipTitle}>Try searching</Text>
            <Text style={styles.tipText}>
              • Vehicle name — e.g. Honda Activa 6G → auto-suggests front + rear size{"\n"}
              • Brand or model — MRF, Apollo, ZLX{"\n"}
              • Size — 205/55 R16{"\n"}
              • Supplier, customer name, mobile, or invoice #
            </Text>
          </View>
        ) : null}

        {vehicleMatch ? (
          <View style={styles.vehicleCard} testID="vehicle-match">
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <MaterialCommunityIcons name="car-info" size={22} color="#FFFFFF" />
              <Text style={styles.vehicleTitle}>{vehicleMatch.name}</Text>
            </View>
            <Text style={styles.vehicleSub}>{CATEGORY_MAP[vehicleMatch.category]?.name}</Text>
            <View style={styles.vehicleRow}>
              <View style={styles.vehicleChip}>
                <Text style={styles.chipLabel}>Front</Text>
                <Text style={styles.chipValue}>{vehicleMatch.frontSize || "—"}</Text>
              </View>
              <View style={styles.vehicleChip}>
                <Text style={styles.chipLabel}>Rear</Text>
                <Text style={styles.chipValue}>{vehicleMatch.rearSize || "—"}</Text>
              </View>
            </View>
            {vehicleSizeMatches.length > 0 ? (
              <Text style={styles.vehicleHint}>
                {vehicleSizeMatches.length} matching SKU{vehicleSizeMatches.length === 1 ? "" : "s"} in your stock
              </Text>
            ) : (
              <Text style={styles.vehicleHint}>No matching tyres in stock for these sizes.</Text>
            )}
          </View>
        ) : null}

        {hasQuery ? (
          <Text style={styles.sectionCount}>
            {totalHits} result{totalHits === 1 ? "" : "s"}
          </Text>
        ) : null}

        {tyreMatches.length ? <Text style={styles.section}>Tyres ({tyreMatches.length})</Text> : null}
        {tyreMatches.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={styles.row}
            onPress={() => router.push({ pathname: "/inventory/tyre-form", params: { id: t.id } })}
            testID={`search-tyre-${t.id}`}
          >
            <View style={styles.rowIcon}>
              <MaterialCommunityIcons name="tire" size={22} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{t.brand} {t.model} · {t.size}</Text>
              <Text style={styles.rowSub}>
                {t.pattern && t.pattern !== "-" ? t.pattern + " · " : ""}
                Rack {t.rackNumber} · Stock {t.currentStock}
              </Text>
            </View>
            <Text style={styles.stock}>{t.currentStock}</Text>
          </TouchableOpacity>
        ))}

        {supplierMatches.length ? <Text style={styles.section}>Suppliers ({supplierMatches.length})</Text> : null}
        {supplierMatches.map((s) => (
          <View key={s.id} style={styles.row} testID={`search-sup-${s.id}`}>
            <View style={styles.rowIcon}><MaterialCommunityIcons name="truck-outline" size={22} color={colors.brandPrimary} /></View>
            <Text style={styles.rowTitle}>{s.name}</Text>
          </View>
        ))}

        {customerMatches.length ? <Text style={styles.section}>Customers ({customerMatches.length})</Text> : null}
        {customerMatches.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={styles.row}
            onPress={() => router.push({ pathname: "/khata/[id]", params: { id: c.id, name: c.name } })}
            testID={`search-cust-${c.id}`}
          >
            <View style={styles.rowIcon}><MaterialCommunityIcons name="account-outline" size={22} color={colors.brandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{c.name}</Text>
              <Text style={styles.rowSub}>{c.mobileNumber}</Text>
            </View>
          </TouchableOpacity>
        ))}

        {invoiceMatches.length ? <Text style={styles.section}>Invoices ({invoiceMatches.length})</Text> : null}
        {invoiceMatches.map((i, idx) => (
          <View key={idx} style={styles.row} testID={`search-inv-${idx}`}>
            <View style={styles.rowIcon}><MaterialCommunityIcons name="receipt-text-outline" size={22} color={colors.brandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>#{i.invoiceNumber}</Text>
              <Text style={styles.rowSub}>{i.supplierName}</Text>
            </View>
            <Text style={styles.stock}>₹{i.total?.toLocaleString("en-IN")}</Text>
          </View>
        ))}

        {hasQuery && totalHits === 0 && !vehicleMatch ? (
          <View style={styles.tipBox}>
            <Text style={styles.tipTitle}>No matches</Text>
            <Text style={styles.tipText}>Try a shorter query or add the tyre / vehicle to master data.</Text>
          </View>
        ) : null}

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
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
    gap: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    height: 44,
  },
  search: { flex: 1, color: colors.onSurface, fontSize: fontSize.base, paddingVertical: 0 },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  tipBox: {
    padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  tipTitle: { fontSize: fontSize.base, fontWeight: "800", color: colors.onSurface, marginBottom: 4 },
  tipText: { fontSize: fontSize.sm, color: colors.onSurfaceSecondary, lineHeight: 20 },
  vehicleCard: {
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  vehicleTitle: { fontSize: fontSize.lg, fontWeight: "800", color: "#FFFFFF" },
  vehicleSub: { fontSize: fontSize.xs, color: "rgba(255,255,255,0.7)", marginBottom: spacing.md },
  vehicleRow: { flexDirection: "row", gap: spacing.sm },
  vehicleChip: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  chipLabel: { color: "rgba(255,255,255,0.7)", fontSize: fontSize.xs, letterSpacing: 0.5 },
  chipValue: { color: "#FFFFFF", fontSize: fontSize.lg, fontWeight: "800", marginTop: 2 },
  vehicleHint: { color: "rgba(255,255,255,0.75)", fontSize: fontSize.xs, marginTop: spacing.md },
  sectionCount: { color: colors.muted, fontSize: fontSize.sm, marginTop: spacing.md },
  section: {
    fontSize: fontSize.sm,
    fontWeight: "800",
    color: colors.onSurfaceSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
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
  stock: { fontSize: fontSize.base, fontWeight: "800", color: colors.brandPrimary, marginLeft: spacing.sm },
});
