/**
 * "Search by Tyre Size" — Phase 3.
 *
 * A single-input screen where the user types any common tyre-size
 * format and we return:
 *   1. Matching products from THIS shop's inventory (via listTyres +
 *      client-side normalisation, exactly like /vehicle-search/stock).
 *   2. Vehicles from the 450-row OEM master that use the size — split
 *      into "Used as Front" and "Used as Rear" (user directive #8).
 *
 * Per user directive #9: if the size doesn't exist in the OEM database
 * AND has no inventory match, we display "No matching tyre found." We
 * do NOT recommend an alternative size.
 */

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { listTyres } from "@/src/firebase/inventory";
import type { Tyre } from "@/src/constants/inventory";
import { oemSearchBySize, type OemFitment } from "@/src/api/oem";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";
import { normalizeSize } from "@/src/utils/tyreSize";

interface OemSplit {
  front: OemFitment[];
  rear: OemFitment[];
}

const SUGGESTED_SIZES = ["90/100-10", "195/55 R16", "215/60 R17", "7.00-15", "100/80-17"];

export default function TyreSizeSearchScreen() {
  const router = useRouter();
  const inputRef = useRef<TextInput | null>(null);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [inventory, setInventory] = useState<Tyre[] | null>(null);
  const [oemFitments, setOemFitments] = useState<OemFitment[] | null>(null);
  const [loadingInv, setLoadingInv] = useState(false);
  const [loadingOem, setLoadingOem] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // Preload the shop's inventory so the FIRST search is instant.
    (async () => {
      setLoadingInv(true);
      try {
        const list = await listTyres();
        setInventory(list);
      } catch (e: any) {
        setErrorMsg(e?.message || "Failed to load inventory");
      } finally {
        setLoadingInv(false);
      }
    })();
  }, []);

  const doSearch = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      setErrorMsg(null);
      setSubmitted(trimmed);
      setLoadingOem(true);
      setOemFitments(null);
      try {
        const res = await oemSearchBySize(trimmed);
        setOemFitments(res.vehicles);
      } catch (e: any) {
        setErrorMsg(e?.message || "OEM lookup failed");
        setOemFitments([]);
      } finally {
        setLoadingOem(false);
      }
    },
    [],
  );

  const invMatches = useMemo<Tyre[]>(() => {
    if (!submitted || !inventory) return [];
    const norm = normalizeSize(submitted);
    if (!norm) return [];
    return inventory.filter((t) => normalizeSize(t.size) === norm);
  }, [inventory, submitted]);

  const oemSplit = useMemo<OemSplit>(() => {
    if (!submitted || !oemFitments) return { front: [], rear: [] };
    const norm = normalizeSize(submitted);
    const front = oemFitments.filter((f) => f.front_size_normalized === norm);
    const rear = oemFitments.filter((f) => f.rear_size_normalized === norm);
    return { front, rear };
  }, [oemFitments, submitted]);

  const isCompleteMiss =
    !!submitted &&
    !loadingOem &&
    invMatches.length === 0 &&
    oemSplit.front.length === 0 &&
    oemSplit.rear.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.iconBtn}
          testID="size-search-back"
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Search by Tyre Size</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.searchWrap}>
            <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder="e.g. 90/100-10, 195/55 R16, 215/60 R17"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={() => doSearch(query)}
              testID="size-search-input"
            />
            {query.length > 0 ? (
              <Pressable
                onPress={() => {
                  setQuery("");
                  setSubmitted(null);
                  setOemFitments(null);
                }}
                hitSlop={12}
                testID="size-search-clear"
              >
                <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.searchBtn}
            onPress={() => doSearch(query)}
            activeOpacity={0.9}
            testID="size-search-submit"
          >
            <MaterialCommunityIcons name="magnify" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.searchBtnText}>Search</Text>
          </TouchableOpacity>

          {!submitted ? (
            <View style={styles.suggestions}>
              <Text style={styles.suggestionsLabel}>Popular sizes</Text>
              <View style={styles.suggestionsRow}>
                {SUGGESTED_SIZES.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={styles.suggestChip}
                    onPress={() => {
                      setQuery(s);
                      doSearch(s);
                    }}
                    testID={`size-search-suggest-${s}`}
                  >
                    <Text style={styles.suggestChipText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.hintBox}>
                <MaterialCommunityIcons name="information-outline" size={16} color={colors.muted} />
                <Text style={styles.hintText}>
                  The search matches equivalent formats — <Text style={{ fontWeight: "700" }}>90/100-10</Text>,{" "}
                  <Text style={{ fontWeight: "700" }}>90-100-10</Text>, and{" "}
                  <Text style={{ fontWeight: "700" }}>90/100/10</Text> all find the same tyres.
                </Text>
              </View>
            </View>
          ) : null}

          {errorMsg ? (
            <View style={styles.errorBox}>
              <MaterialCommunityIcons name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {submitted ? (
            <>
              {/* Inventory results */}
              <SectionCard
                title="Your shop inventory"
                subtitle={submitted}
                testID="size-search-inventory-section"
              >
                {loadingInv ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : invMatches.length === 0 ? (
                  <Text style={styles.oosText} testID="size-search-inventory-empty">
                    {oemSplit.front.length + oemSplit.rear.length > 0
                      ? "OEM size recognised — currently out of stock in your shop."
                      : "No matching tyre found in your shop inventory for this size."}
                  </Text>
                ) : (
                  <View>
                    {invMatches
                      .slice()
                      .sort((a, b) => (a.sellingPrice ?? 0) - (b.sellingPrice ?? 0))
                      .map((t) => (
                        <InventoryRow key={t.id} tyre={t} onPress={() => router.push({ pathname: "/inventory/tyre-form", params: { id: t.id } })} />
                      ))}
                  </View>
                )}
              </SectionCard>

              {/* OEM vehicles */}
              <SectionCard
                title="Vehicles using this tyre size"
                subtitle="From the OEM database"
                testID="size-search-vehicles-section"
              >
                {loadingOem ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : oemSplit.front.length + oemSplit.rear.length === 0 ? (
                  <Text style={styles.oosText} testID="size-search-vehicles-empty">
                    No OEM vehicle recorded with this exact tyre size. Verify the format and try
                    again.
                  </Text>
                ) : (
                  <>
                    <FitmentGroup
                      label="Used as FRONT"
                      icon="arrow-up-bold"
                      items={oemSplit.front}
                    />
                    <FitmentGroup
                      label="Used as REAR"
                      icon="arrow-down-bold"
                      items={oemSplit.rear}
                    />
                    <View style={styles.noteInline}>
                      <MaterialCommunityIcons name="information-outline" size={14} color={colors.muted} />
                      <Text style={styles.noteInlineText}>
                        Vehicle fitment may vary by variant, year and wheel option.
                      </Text>
                    </View>
                  </>
                )}
              </SectionCard>

              {isCompleteMiss ? (
                <View style={styles.emptyMiss}>
                  <EmptyState
                    title="No matching tyre found"
                    message={`No matching tyre or OEM vehicle for size “${submitted}”. Do not fit a different size — verify the size format or add it to inventory.`}
                  />
                </View>
              ) : null}

              <View style={{ height: spacing.xxxl }} />
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// -----------------------------------------------------------------
function SectionCard(props: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.sectionCard} testID={props.testID}>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{props.title}</Text>
          {props.subtitle ? <Text style={styles.sectionSubtitle}>{props.subtitle}</Text> : null}
        </View>
      </View>
      <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>{props.children}</View>
    </View>
  );
}

function InventoryRow({ tyre, onPress }: { tyre: Tyre; onPress: () => void }) {
  const lowStock =
    typeof tyre.currentStock === "number" &&
    typeof tyre.minStockAlert === "number" &&
    tyre.currentStock <= tyre.minStockAlert;
  return (
    <TouchableOpacity
      style={styles.invRow}
      onPress={onPress}
      testID={`size-search-inv-item-${tyre.id}`}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.invBrand}>{tyre.brand}</Text>
        <Text style={styles.invPattern} numberOfLines={1}>
          {tyre.pattern && tyre.pattern !== "-" ? tyre.pattern : tyre.model || ""}
        </Text>
        <View style={styles.invMetaRow}>
          <Text style={styles.invSize}>{tyre.size}</Text>
          {tyre.tubeType ? (
            <Text style={styles.invTL}>{tyre.tubeType === "Tubeless" ? "TL" : "TT"}</Text>
          ) : null}
        </View>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={styles.invPrice}>₹{(tyre.sellingPrice ?? 0).toLocaleString("en-IN")}</Text>
        <Text style={[styles.invStock, lowStock && { color: colors.warning, fontWeight: "700" }]}>
          {tyre.currentStock ?? 0} in stock
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function FitmentGroup(props: {
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  items: OemFitment[];
}) {
  if (props.items.length === 0) {
    return (
      <View style={styles.fitmentGroup}>
        <View style={styles.fitmentGroupHeader}>
          <MaterialCommunityIcons name={props.icon} size={14} color={colors.brandSecondary} />
          <Text style={styles.fitmentGroupLabel}>{props.label}</Text>
          <Text style={styles.fitmentGroupEmpty}>—</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.fitmentGroup}>
      <View style={styles.fitmentGroupHeader}>
        <MaterialCommunityIcons name={props.icon} size={14} color={colors.brandSecondary} />
        <Text style={styles.fitmentGroupLabel}>{props.label}</Text>
        <Text style={styles.fitmentGroupCount}>{props.items.length}</Text>
      </View>
      {props.items.slice(0, 25).map((f) => (
        <View key={f.id} style={styles.fitmentRow} testID={`size-search-fitment-${f.id}`}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fitmentName} numberOfLines={1}>
              {f.make} {f.model}
              {f.variant ? ` · ${f.variant}` : ""}
            </Text>
            {f.year_generation ? (
              <Text style={styles.fitmentMeta} numberOfLines={1}>{f.year_generation}</Text>
            ) : null}
          </View>
          {f.category ? (
            <Text style={styles.fitmentCat}>{f.category}</Text>
          ) : (
            <Text style={[styles.fitmentCat, { color: "#7A4E00" }]}>Uncategorised</Text>
          )}
        </View>
      ))}
      {props.items.length > 25 ? (
        <Text style={styles.fitmentMore}>+ {props.items.length - 25} more not shown</Text>
      ) : null}
    </View>
  );
}

// -----------------------------------------------------------------
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
    fontWeight: "700",
    color: colors.onSurface,
    textAlign: "center",
  },
  scroll: { padding: spacing.lg },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "ios" ? spacing.md : spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: fontSize.lg,
    fontWeight: "600",
    padding: 0,
  },
  searchBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.brandPrimary,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 48,
  },
  searchBtnText: { color: colors.onBrandPrimary, fontSize: fontSize.base, fontWeight: "700" },

  suggestions: { marginTop: spacing.xl },
  suggestionsLabel: {
    fontSize: fontSize.xs,
    color: colors.muted,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  suggestionsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  suggestChip: {
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    minHeight: 40,
    justifyContent: "center",
  },
  suggestChipText: { color: colors.onBrandTertiary, fontWeight: "700", fontSize: fontSize.sm },
  hintBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
  },
  hintText: { flex: 1, color: colors.muted, fontSize: fontSize.xs, lineHeight: 18 },

  errorBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: "#FFEDEA",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#F5C0B9",
    flexDirection: "row",
    gap: spacing.sm,
  },
  errorText: { flex: 1, color: colors.error, fontSize: fontSize.sm },

  sectionCard: {
    marginTop: spacing.lg,
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    flexDirection: "row",
    alignItems: "center",
  },
  sectionTitle: { fontSize: fontSize.base, fontWeight: "800", color: colors.onSurface },
  sectionSubtitle: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },

  invRow: {
    flexDirection: "row",
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.md,
    alignItems: "center",
  },
  invBrand: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  invPattern: { fontSize: fontSize.xs, color: colors.muted, marginTop: 1 },
  invMetaRow: { flexDirection: "row", gap: spacing.sm, marginTop: 4 },
  invSize: { fontSize: fontSize.xs, color: colors.onSurface, fontWeight: "600" },
  invTL: {
    fontSize: fontSize.xs,
    color: colors.brand,
    fontWeight: "700",
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
  },
  invPrice: { fontSize: fontSize.base, fontWeight: "800", color: colors.brand },
  invStock: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },

  fitmentGroup: { marginTop: spacing.sm },
  fitmentGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  fitmentGroupLabel: {
    fontSize: fontSize.xs,
    color: colors.brandSecondary,
    fontWeight: "800",
    letterSpacing: 0.5,
    flex: 1,
  },
  fitmentGroupCount: {
    fontSize: fontSize.xs,
    color: colors.brandSecondary,
    fontWeight: "800",
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
  },
  fitmentGroupEmpty: { color: colors.muted, fontSize: fontSize.xs },
  fitmentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  fitmentName: { fontSize: fontSize.sm, color: colors.onSurface, fontWeight: "600" },
  fitmentMeta: { fontSize: fontSize.xs, color: colors.muted },
  fitmentCat: {
    fontSize: 10,
    color: colors.brand,
    fontWeight: "700",
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  fitmentMore: {
    fontSize: fontSize.xs,
    color: colors.muted,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  noteInline: {
    marginTop: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: 4,
  },
  noteInlineText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 16 },

  oosText: { fontSize: fontSize.sm, color: colors.muted, paddingVertical: spacing.md },
  emptyMiss: { marginTop: spacing.lg },
});
