// Billing history + bill actions for TyreBook.
// Each saved sale can be re-shared as PDF (matches the saved snapshot),
// printed via the native print dialog, and (owner) deleted.
//
// Two bill kinds are supported:
//   • GST Invoice  (invoiceKind === "Tax Invoice")
//   • Kacha Bill   (invoiceKind === "Kacha Bill")
// Sales created before this migration are treated as GST invoices by default.

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChipRow } from "@/src/components/ChipRow";
import { EmptyState } from "@/src/components/EmptyState";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";
import { deleteSale, listSales } from "@/src/firebase/sales";
import { getShopSettings } from "@/src/firebase/master";
import { generateAndShareInvoice, printInvoice } from "@/src/utils/invoicePdf";
import { usePermissions } from "@/src/hooks/usePermissions";
import type { Sale } from "@/src/constants/inventory";

type Filter = "all" | "today" | "gst" | "kacha" | "credit";

function inr(n: number) {
  return "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function isToday(ts: number) {
  const d = new Date(ts);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}
function billKindOf(s: Sale): "Tax Invoice" | "Kacha Bill" {
  return s.invoiceKind === "Kacha Bill" ? "Kacha Bill" : "Tax Invoice";
}

async function invoiceNumberFor(sale: Sale): Promise<{ number: string; shop: any }> {
  const shop = await getShopSettings();
  if (sale.invoiceNumber) return { number: sale.invoiceNumber, shop };
  const prefix = billKindOf(sale) === "Kacha Bill"
    ? (shop.kachaPrefix || "CM")
    : (shop.invoicePrefix || "TB");
  return { number: `${prefix}-${(sale.id || "0000").slice(-4).toUpperCase()}`, shop };
}

export default function Billing() {
  const router = useRouter();
  const perms = usePermissions();
  const [sales, setSales] = useState<Sale[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setSales(await listSales());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = sales.filter((s) => {
    if (filter === "today") return isToday(s.date);
    if (filter === "credit") return s.paymentMode === "Credit";
    if (filter === "gst") return billKindOf(s) === "Tax Invoice";
    if (filter === "kacha") return billKindOf(s) === "Kacha Bill";
    return true;
  });

  const handleShare = async (sale: Sale) => {
    setBusyId(sale.id);
    try {
      const { number, shop } = await invoiceNumberFor(sale);
      await generateAndShareInvoice({
        invoiceType: billKindOf(sale),
        invoiceNumber: number,
        sale,
        shop,
      });
    } finally {
      setBusyId(null);
    }
  };

  const handlePrint = async (sale: Sale) => {
    setBusyId(sale.id);
    try {
      const { number, shop } = await invoiceNumberFor(sale);
      await printInvoice({
        invoiceType: billKindOf(sale),
        invoiceNumber: number,
        sale,
        shop,
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (sale: Sale) => {
    await deleteSale(sale.id);
    load();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Billing</Text>
          <Text style={styles.sub}>{sales.length} bills · GST & Kacha</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/sales/new")}
          style={styles.headerBtn}
          testID="billing-new-sale"
        >
          <MaterialCommunityIcons name="plus" size={20} color={colors.onBrandPrimary} />
          <Text style={styles.headerBtnText}>New Bill</Text>
        </TouchableOpacity>
      </View>

      <ChipRow
        options={[
          { value: "all", label: "All" },
          { value: "today", label: "Today" },
          { value: "gst", label: "GST Invoice" },
          { value: "kacha", label: "Sale Receipt" },
          { value: "credit", label: "Credit / Khata" },
        ]}
        value={filter}
        onChange={setFilter}
        testIDPrefix="bill-filter"
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No bills yet"
          message="Create your first sale to see it here."
          icon={
            <MaterialCommunityIcons
              name="receipt-text-outline"
              size={40}
              color={colors.brandPrimary}
            />
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => {
            const kind = billKindOf(item);
            const isKacha = kind === "Kacha Bill";
            return (
              <View style={styles.row} testID={`sale-${item.id}`}>
                <View style={[styles.rowIcon, isKacha && { backgroundColor: "#FFEAD1" }]}>
                  <MaterialCommunityIcons
                    name={isKacha ? "receipt-outline" : "receipt-text-outline"}
                    size={22}
                    color={isKacha ? "#B25E00" : colors.brandPrimary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.titleRow}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {item.customerName || "Walk-in customer"}
                    </Text>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: isKacha ? "#FFEAD1" : colors.brandTertiary },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          { color: isKacha ? "#B25E00" : colors.onBrandTertiary },
                        ]}
                      >
                        {isKacha ? "KACHA" : "GST"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {item.brand} {item.model} · {item.size} · Qty {item.quantity}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {item.invoiceNumber ? `${item.invoiceNumber} · ` : ""}
                    {fmtDate(item.date)} · {item.paymentMode}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.amt}>{inr(item.totalValue)}</Text>
                  <View style={styles.actions}>
                    <TouchableOpacity
                      onPress={() => handleShare(item)}
                      style={styles.actionBtn}
                      disabled={busyId === item.id}
                      testID={`share-sale-${item.id}`}
                    >
                      <MaterialCommunityIcons
                        name="share-variant"
                        size={14}
                        color={colors.brandPrimary}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handlePrint(item)}
                      style={styles.actionBtn}
                      disabled={busyId === item.id}
                      testID={`print-sale-${item.id}`}
                    >
                      <MaterialCommunityIcons
                        name="printer"
                        size={14}
                        color={colors.brandPrimary}
                      />
                    </TouchableOpacity>
                    {perms.canDeleteBills ? (
                      <TouchableOpacity
                        onPress={() => handleDelete(item)}
                        style={styles.actionBtn}
                        testID={`delete-sale-${item.id}`}
                      >
                        <MaterialCommunityIcons
                          name="trash-can-outline"
                          size={14}
                          color={colors.error}
                        />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    gap: spacing.xs,
  },
  headerBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: fontSize.sm },
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
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  rowTitle: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.onSurface,
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  rowSub: { fontSize: fontSize.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  rowMeta: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  amt: {
    fontSize: fontSize.base,
    fontWeight: "800",
    color: colors.brandPrimary,
    marginLeft: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    gap: 4,
    marginTop: 6,
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
