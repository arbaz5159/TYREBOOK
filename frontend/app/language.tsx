import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { INDIAN_LANGUAGES } from "@/src/constants/languages";
import { storage } from "@/src/utils/storage";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

const KEY = "tyrebook.language";

export default function LanguageSwitcher() {
  const router = useRouter();
  const [current, setCurrent] = useState<string>("en");

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string>(KEY, "en");
      if (saved) setCurrent(saved);
    })();
  }, []);

  const select = async (code: string) => {
    setCurrent(code);
    await storage.setItem(KEY, code);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.title}>Choose Language</Text>
          <Text style={styles.sub}>All Indian official languages</Text>
        </View>
      </View>

      <FlatList
        data={INDIAN_LANGUAGES}
        keyExtractor={(l) => l.code}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => {
          const active = item.code === current;
          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => select(item.code)}
              style={[styles.row, active && { borderColor: colors.brandPrimary, borderWidth: 2 }]}
              testID={`language-${item.code}`}
            >
              <View style={styles.rowIcon}>
                <Text style={styles.native}>{item.native.slice(0, 2)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.native}</Text>
                <Text style={styles.rowSub}>{item.english}</Text>
              </View>
              {active ? (
                <MaterialCommunityIcons name="check-circle" size={22} color={colors.brandPrimary} />
              ) : (
                <MaterialCommunityIcons name="circle-outline" size={22} color={colors.muted} />
              )}
            </TouchableOpacity>
          );
        }}
      />
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  native: { color: colors.onBrandTertiary, fontWeight: "800", fontSize: fontSize.base },
  rowTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
});
