/**
 * "Find Tyre by Vehicle" — Phase 2 selection wizard.
 *
 * Selection order (per user directive #2):
 *   Category → Make → Model → Variant → Year → Result
 *
 * Only the OEM database (Phase 1 backend) is used — no hard-coded
 * vehicle lists. Every dropdown's options are fetched on demand and
 * scoped by the choices above it. Changing a higher-level choice
 * resets all dependent choices (directive #5).
 *
 * A quick-search box at the top can jump straight to a Make/Model
 * that matches the user's typed query (directive #4).
 */

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/src/components/EmptyState";
import {
  oemCategories,
  oemMakes,
  oemModels,
  oemVariants,
  oemYears,
  oemFitments,
  OEM_UNCATEGORISED_LABEL,
  OEM_BLANK_SENTINEL,
  oemDisplayLabel,
} from "@/src/api/oem";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

type Step = "category" | "make" | "model" | "variant" | "year";

interface Selection {
  category: string | null;
  make: string | null;
  model: string | null;
  variant: string | null;
  year_generation: string | null;
}

const EMPTY: Selection = {
  category: null,
  make: null,
  model: null,
  variant: null,
  year_generation: null,
};

const STEP_LABELS: Record<Step, string> = {
  category: "Vehicle Category",
  make: "Make",
  model: "Model",
  variant: "Variant / Fitment",
  year: "Year / Generation",
};

export default function VehicleSearch() {
  const router = useRouter();

  // --------------- state ---------------
  const [selection, setSelection] = useState<Selection>(EMPTY);

  // Cached options per level so tapping "Back" doesn't refetch.
  const [categories, setCategories] = useState<string[] | null>(null);
  const [makes, setMakes] = useState<string[] | null>(null);
  const [models, setModels] = useState<string[] | null>(null);
  const [variants, setVariants] = useState<string[] | null>(null);
  const [years, setYears] = useState<string[] | null>(null);

  const [loading, setLoading] = useState<Step | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search box that can jump to a Make or Model directly.
  const [quickQuery, setQuickQuery] = useState("");
  const [quickResults, setQuickResults] = useState<
    | null
    | {
        makes: { make: string; category: string | null }[];
        models: { make: string; model: string; category: string | null }[];
      }
  >(null);
  const [quickLoading, setQuickLoading] = useState(false);

  // Picker modal
  const [pickerOpen, setPickerOpen] = useState<Step | null>(null);

  // --------------- data loaders ---------------
  const loadCategories = useCallback(async () => {
    setLoading("category");
    setErrorMsg(null);
    try {
      setCategories(await oemCategories());
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to load categories");
    } finally {
      setLoading(null);
    }
  }, []);

  const loadMakes = useCallback(async (category: string | null) => {
    setLoading("make");
    setErrorMsg(null);
    try {
      setMakes(await oemMakes(category));
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to load makes");
    } finally {
      setLoading(null);
    }
  }, []);

  const loadModels = useCallback(
    async (category: string | null, make: string | null) => {
      setLoading("model");
      setErrorMsg(null);
      try {
        setModels(await oemModels(category, make));
      } catch (e: any) {
        setErrorMsg(e?.message || "Failed to load models");
      } finally {
        setLoading(null);
      }
    },
    [],
  );

  const loadVariants = useCallback(
    async (category: string | null, make: string | null, model: string | null) => {
      setLoading("variant");
      setErrorMsg(null);
      try {
        setVariants(await oemVariants(category, make, model));
      } catch (e: any) {
        setErrorMsg(e?.message || "Failed to load variants");
      } finally {
        setLoading(null);
      }
    },
    [],
  );

  const loadYears = useCallback(
    async (
      category: string | null,
      make: string | null,
      model: string | null,
      variant: string | null,
    ) => {
      setLoading("year");
      setErrorMsg(null);
      try {
        setYears(await oemYears(category, make, model, variant));
      } catch (e: any) {
        setErrorMsg(e?.message || "Failed to load years");
      } finally {
        setLoading(null);
      }
    },
    [],
  );

  // Bootstrap on mount.
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // --------------- selection handlers ---------------
  const onPickCategory = useCallback(
    (val: string) => {
      setSelection({ ...EMPTY, category: val });
      setMakes(null);
      setModels(null);
      setVariants(null);
      setYears(null);
      setPickerOpen(null);
      void loadMakes(val);
    },
    [loadMakes],
  );

  const onPickMake = useCallback(
    (val: string) => {
      setSelection((s) => ({ ...s, make: val, model: null, variant: null, year_generation: null }));
      setModels(null);
      setVariants(null);
      setYears(null);
      setPickerOpen(null);
      void loadModels(selection.category, val);
    },
    [loadModels, selection.category],
  );

  const onPickModel = useCallback(
    (val: string) => {
      setSelection((s) => ({ ...s, model: val, variant: null, year_generation: null }));
      setVariants(null);
      setYears(null);
      setPickerOpen(null);
      void loadVariants(selection.category, selection.make, val);
    },
    [loadVariants, selection.category, selection.make],
  );

  const onPickVariant = useCallback(
    (val: string) => {
      setSelection((s) => ({ ...s, variant: val, year_generation: null }));
      setYears(null);
      setPickerOpen(null);
      void loadYears(selection.category, selection.make, selection.model, val);
    },
    [loadYears, selection.category, selection.make, selection.model],
  );

  const onPickYear = useCallback(
    async (val: string) => {
      setSelection((s) => ({ ...s, year_generation: val }));
      setPickerOpen(null);
      // Once every level is picked, resolve fitment and go to Result.
      try {
        const res = await oemFitments({ ...selection, year_generation: val });
        if (res.count === 0) {
          setErrorMsg("No OEM fitment found for this exact selection.");
          return;
        }
        const first = res.fitments[0];
        router.push({
          pathname: "/vehicle-search/result",
          params: {
            id: first.id,
            isAmbiguous: res.count > 1 ? "1" : "0",
            count: String(res.count),
          },
        });
      } catch (e: any) {
        setErrorMsg(e?.message || "Failed to fetch fitment");
      }
    },
    [router, selection],
  );

  // --------------- quick search ---------------
  const runQuickSearch = useCallback(async (q: string) => {
    const query = q.trim().toLowerCase();
    if (query.length < 2) {
      setQuickResults(null);
      return;
    }
    setQuickLoading(true);
    try {
      // Fetch a broad set of makes+models across all categories and filter locally.
      // At 450 rows the payload is small; even at 50k rows this stays fast because
      // the distinct endpoints only return unique values.
      const [allMakes, allCategories] = await Promise.all([oemMakes(null), oemCategories()]);
      // Match makes
      const makeHits = allMakes
        .filter((m) => m.toLowerCase().includes(query))
        .slice(0, 10)
        .map((m) => ({ make: m, category: null as string | null }));

      // Match models — need to gather (make, model) tuples. Use fitments endpoint
      // with a broad match by iterating makes that contain query OR loading models
      // for each category-less make search. Simpler: hit /fitments with just a
      // make filter for the top few make matches, plus a wildcard model scan via
      // /models (no filter).
      const allModels = await oemModels(null, null);
      const modelHits = allModels
        .filter((m) => m.toLowerCase().includes(query))
        .slice(0, 15);
      // Resolve which make each matched model belongs to via /fitments.
      // For UX speed we resolve up to 8 unique models in PARALLEL.
      const resolved = await Promise.all(
        modelHits.slice(0, 8).map(async (modelName) => {
          try {
            const r = await oemFitments({ model: modelName });
            if (r.fitments[0]) {
              return {
                make: r.fitments[0].make,
                model: modelName,
                category: r.fitments[0].category ?? null,
              };
            }
          } catch {
            /* ignore per-item errors — the panel remains usable */
          }
          return null;
        }),
      );
      const modelWithMake = resolved.filter(
        (x): x is { make: string; model: string; category: string | null } => !!x,
      );

      void allCategories; // reserved for future category-badging
      setQuickResults({ makes: makeHits, models: modelWithMake });
    } catch {
      setQuickResults({ makes: [], models: [] });
    } finally {
      setQuickLoading(false);
    }
  }, []);

  // Debounce quick search
  useEffect(() => {
    const t = setTimeout(() => {
      runQuickSearch(quickQuery);
    }, 250);
    return () => clearTimeout(t);
  }, [quickQuery, runQuickSearch]);

  const jumpToMake = useCallback(
    async (make: string, category: string | null) => {
      // Clear any category filter — Uncategorised handling: if the make only
      // appears in uncategorised rows, category stays null (no filter).
      setSelection({ ...EMPTY, category: category, make });
      setQuickQuery("");
      setQuickResults(null);
      setMakes(null);
      setModels(null);
      setVariants(null);
      setYears(null);
      if (category) {
        await loadMakes(category);
      }
      await loadModels(category, make);
    },
    [loadMakes, loadModels],
  );

  const jumpToModel = useCallback(
    async (make: string, model: string, category: string | null) => {
      setSelection({ ...EMPTY, category, make, model });
      setQuickQuery("");
      setQuickResults(null);
      setMakes(null);
      setModels(null);
      setVariants(null);
      setYears(null);
      await loadVariants(category, make, model);
    },
    [loadVariants],
  );

  // --------------- render helpers ---------------
  const currentOptions = useMemo(() => {
    if (pickerOpen === "category") return categories ?? [];
    if (pickerOpen === "make") return makes ?? [];
    if (pickerOpen === "model") return models ?? [];
    if (pickerOpen === "variant") return variants ?? [];
    if (pickerOpen === "year") return years ?? [];
    return [];
  }, [pickerOpen, categories, makes, models, variants, years]);

  const stepEnabled = useCallback(
    (s: Step): boolean => {
      switch (s) {
        case "category":
          return true;
        case "make":
          return !!selection.category;
        case "model":
          return !!selection.category && !!selection.make;
        case "variant":
          return !!selection.category && !!selection.make && !!selection.model;
        case "year":
          return (
            !!selection.category && !!selection.make && !!selection.model && !!selection.variant
          );
      }
    },
    [selection],
  );

  const stepValue = useCallback(
    (s: Step): string | null => {
      const raw = (() => {
        switch (s) {
          case "category":
            return selection.category;
          case "make":
            return selection.make;
          case "model":
            return selection.model;
          case "variant":
            return selection.variant;
          case "year":
            return selection.year_generation;
        }
      })();
      // The raw selection stores the API sentinel (`__blank__`) for
      // fields whose source cell is blank; the UI must render a
      // friendly label instead.
      return raw ? oemDisplayLabel(raw) : null;
    },
    [selection],
  );

  const openPicker = useCallback(
    (s: Step) => {
      if (!stepEnabled(s)) return;
      setPickerOpen(s);
    },
    [stepEnabled],
  );

  const clearAll = useCallback(() => {
    setSelection(EMPTY);
    setMakes(null);
    setModels(null);
    setVariants(null);
    setYears(null);
    setErrorMsg(null);
  }, []);

  // --------------- UI ---------------
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.iconBtn}
          testID="vehicle-search-back"
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Find Tyre by Vehicle</Text>
        <TouchableOpacity
          onPress={clearAll}
          style={styles.iconBtn}
          testID="vehicle-search-clear"
        >
          <MaterialCommunityIcons name="restart" size={20} color={colors.onSurface} />
        </TouchableOpacity>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>
          Select your vehicle to find the correct OEM tyre size
        </Text>

        {/* Quick search */}
        <View style={styles.searchWrap} testID="vehicle-search-quickbox">
          <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
          <TextInput
            value={quickQuery}
            onChangeText={setQuickQuery}
            placeholder="Search make or model  (e.g. Swift, Creta, Activa, Burgman)"
            placeholderTextColor={colors.muted}
            style={styles.search}
            autoCorrect={false}
            autoCapitalize="words"
          />
          {quickQuery.length > 0 ? (
            <TouchableOpacity
              onPress={() => setQuickQuery("")}
              hitSlop={10}
              testID="vehicle-search-quickbox-clear"
            >
              <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {quickResults && quickQuery.trim().length >= 2 ? (
          <View style={styles.quickCard} testID="vehicle-search-quickresults">
            {quickLoading ? (
              <View style={styles.quickLoading}>
                <ActivityIndicator size="small" color={colors.brand} />
                <Text style={styles.quickLoadingText}>Searching OEM database…</Text>
              </View>
            ) : quickResults.makes.length + quickResults.models.length === 0 ? (
              <Text style={styles.quickHint}>
                No matching vehicles found in the OEM database.
              </Text>
            ) : (
              <>
                {quickResults.makes.length > 0 ? (
                  <>
                    <Text style={styles.quickHeader}>MAKES</Text>
                    {quickResults.makes.map((m) => (
                      <TouchableOpacity
                        key={`mk-${m.make}`}
                        style={styles.quickRow}
                        onPress={() => jumpToMake(m.make, m.category)}
                        testID={`quick-make-${m.make}`}
                      >
                        <MaterialCommunityIcons
                          name="factory"
                          size={18}
                          color={colors.brandSecondary}
                        />
                        <Text style={styles.quickRowText}>{m.make}</Text>
                        <MaterialCommunityIcons
                          name="chevron-right"
                          size={18}
                          color={colors.muted}
                        />
                      </TouchableOpacity>
                    ))}
                  </>
                ) : null}
                {quickResults.models.length > 0 ? (
                  <>
                    <Text style={styles.quickHeader}>MODELS</Text>
                    {quickResults.models.map((m) => (
                      <TouchableOpacity
                        key={`md-${m.make}-${m.model}`}
                        style={styles.quickRow}
                        onPress={() => jumpToModel(m.make, m.model, m.category)}
                        testID={`quick-model-${m.model}`}
                      >
                        <MaterialCommunityIcons
                          name="car-hatchback"
                          size={18}
                          color={colors.brandSecondary}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.quickRowText}>{m.model}</Text>
                          <Text style={styles.quickRowSub}>
                            {m.make}
                            {m.category ? `  ·  ${m.category}` : ""}
                          </Text>
                        </View>
                        <MaterialCommunityIcons
                          name="chevron-right"
                          size={18}
                          color={colors.muted}
                        />
                      </TouchableOpacity>
                    ))}
                  </>
                ) : null}
              </>
            )}
          </View>
        ) : null}

        {/* Selection stepper */}
        <Text style={styles.sectionTitle}>Step by step</Text>

        {(["category", "make", "model", "variant", "year"] as Step[]).map((s, idx) => (
          <StepRow
            key={s}
            index={idx + 1}
            label={STEP_LABELS[s]}
            value={stepValue(s)}
            enabled={stepEnabled(s)}
            loading={loading === s}
            onPress={() => openPicker(s)}
          />
        ))}

        {errorMsg ? (
          <View style={styles.errorBox}>
            <MaterialCommunityIcons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity
              onPress={() => {
                setErrorMsg(null);
                loadCategories();
              }}
              style={styles.retryBtn}
              testID="vehicle-search-retry"
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Safety note */}
        <View style={styles.safetyNote}>
          <MaterialCommunityIcons name="information-outline" size={16} color={colors.muted} />
          <Text style={styles.safetyText}>
            OEM tyre fitment can vary by model year, variant and wheel option. Please confirm your
            selected vehicle details before purchase.
          </Text>
        </View>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>

      {/* Picker modal */}
      <Modal
        visible={!!pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalWrap}
        >
          <Pressable style={styles.backdrop} onPress={() => setPickerOpen(null)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                Select {pickerOpen ? STEP_LABELS[pickerOpen] : ""}
              </Text>
              <TouchableOpacity onPress={() => setPickerOpen(null)} hitSlop={12}>
                <MaterialCommunityIcons name="close" size={22} color={colors.onSurface} />
              </TouchableOpacity>
            </View>
            <PickerList
              options={currentOptions}
              onPick={(v) => {
                if (pickerOpen === "category") onPickCategory(v);
                else if (pickerOpen === "make") onPickMake(v);
                else if (pickerOpen === "model") onPickModel(v);
                else if (pickerOpen === "variant") onPickVariant(v);
                else if (pickerOpen === "year") onPickYear(v);
              }}
              highlightUncategorised={pickerOpen === "category"}
              testIDPrefix={`picker-${pickerOpen ?? "none"}`}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------- Step row ----------------
function StepRow(props: {
  index: number;
  label: string;
  value: string | null;
  enabled: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  const { index, label, value, enabled, loading, onPress } = props;
  return (
    <TouchableOpacity
      disabled={!enabled}
      onPress={onPress}
      style={[styles.stepRow, !enabled && styles.stepRowDisabled]}
      activeOpacity={0.85}
      testID={`step-row-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
    >
      <View
        style={[
          styles.stepBadge,
          value ? styles.stepBadgeDone : enabled ? styles.stepBadgeActive : styles.stepBadgeMuted,
        ]}
      >
        {value ? (
          <MaterialCommunityIcons name="check" size={16} color={colors.onBrandPrimary} />
        ) : (
          <Text
            style={[
              styles.stepBadgeText,
              enabled ? styles.stepBadgeTextActive : styles.stepBadgeTextMuted,
            ]}
          >
            {index}
          </Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.stepLabel}>{label}</Text>
        <Text
          style={[
            styles.stepValue,
            !value && { color: colors.muted, fontStyle: "italic" },
          ]}
          numberOfLines={1}
        >
          {value ?? (enabled ? "Tap to select" : "Complete previous step")}
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={colors.brand} />
      ) : (
        <MaterialCommunityIcons
          name="chevron-right"
          size={22}
          color={enabled ? colors.onSurface : colors.muted}
        />
      )}
    </TouchableOpacity>
  );
}

// ---------------- Picker list (with in-modal search) ----------------
function PickerList(props: {
  options: string[];
  onPick: (v: string) => void;
  highlightUncategorised?: boolean;
  testIDPrefix: string;
}) {
  const { options, onPick, highlightUncategorised, testIDPrefix } = props;
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.toLowerCase().includes(q) ||
        oemDisplayLabel(o).toLowerCase().includes(q),
    );
  }, [options, filter]);

  if (options.length === 0) {
    return (
      <View style={{ padding: spacing.xl }}>
        <EmptyState title="No options" message="No values available for this step." />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.searchWrap, { marginHorizontal: spacing.lg, marginBottom: spacing.sm }]}>
        <MaterialCommunityIcons name="magnify" size={18} color={colors.muted} />
        <TextInput
          value={filter}
          onChangeText={setFilter}
          placeholder="Filter…"
          placeholderTextColor={colors.muted}
          style={styles.search}
          autoCorrect={false}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item}
        renderItem={({ item }) => {
          const uncategorised =
            highlightUncategorised && item === OEM_UNCATEGORISED_LABEL;
          const isBlank = item === OEM_BLANK_SENTINEL;
          return (
            <TouchableOpacity
              style={styles.pickerRow}
              onPress={() => onPick(item)}
              activeOpacity={0.7}
              testID={`${testIDPrefix}-option-${item}`}
            >
              <Text
                style={[
                  styles.pickerText,
                  isBlank && { fontStyle: "italic", color: colors.muted },
                ]}
              >
                {oemDisplayLabel(item)}
              </Text>
              {uncategorised ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>172 rows</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.surface,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  title: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.onSurface,
    textAlign: "center",
  },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  subtitle: { color: colors.muted, marginBottom: spacing.lg, fontSize: fontSize.base },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "ios" ? spacing.md : spacing.sm,
    gap: spacing.sm,
  },
  search: {
    flex: 1,
    color: colors.onSurface,
    fontSize: fontSize.base,
    padding: 0,
  },

  quickCard: {
    marginTop: spacing.md,
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  quickHeader: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: colors.brandSecondary,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    letterSpacing: 0.5,
  },
  quickRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    gap: spacing.md,
    minHeight: 48,
  },
  quickRowText: { flex: 1, fontSize: fontSize.base, color: colors.onSurface, fontWeight: "500" },
  quickRowSub: { fontSize: fontSize.xs, color: colors.muted },
  quickLoading: { flexDirection: "row", alignItems: "center", padding: spacing.md, gap: spacing.sm },
  quickLoadingText: { color: colors.muted, fontSize: fontSize.sm },
  quickHint: { padding: spacing.md, color: colors.muted, fontSize: fontSize.sm },

  sectionTitle: {
    fontSize: fontSize.sm,
    color: colors.muted,
    fontWeight: "700",
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 64,
  },
  stepRowDisabled: { opacity: 0.55 },
  stepBadge: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeMuted: { backgroundColor: colors.surfaceSecondary },
  stepBadgeActive: { backgroundColor: colors.brandTertiary },
  stepBadgeDone: { backgroundColor: colors.brandPrimary },
  stepBadgeText: { fontSize: fontSize.sm, fontWeight: "700" },
  stepBadgeTextMuted: { color: colors.muted },
  stepBadgeTextActive: { color: colors.onBrandTertiary },
  stepLabel: { fontSize: fontSize.xs, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  stepValue: { fontSize: fontSize.base, color: colors.onSurface, fontWeight: "600", marginTop: 2 },

  errorBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: "#FFEDEA",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#F5C0B9",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  errorText: { flex: 1, color: colors.error, fontSize: fontSize.sm },
  retryBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.error,
    borderRadius: radius.pill,
  },
  retryText: { color: colors.onError, fontSize: fontSize.sm, fontWeight: "600" },

  safetyNote: {
    marginTop: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
  },
  safetyText: { flex: 1, color: colors.muted, fontSize: fontSize.xs, lineHeight: 16 },

  modalWrap: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "80%",
    paddingBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  sheetTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.onSurface },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  pickerText: { fontSize: fontSize.base, color: colors.onSurface, flex: 1 },
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.lg },
  badge: {
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeText: { color: colors.onBrandTertiary, fontSize: fontSize.xs, fontWeight: "700" },
});
