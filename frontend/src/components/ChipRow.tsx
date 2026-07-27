import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

interface Option<T extends string | number> {
  value: T;
  label: string;
}

interface Props<T extends string | number> {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  testIDPrefix?: string;
}

export function ChipRow<T extends string | number>({
  options,
  value,
  onChange,
  testIDPrefix,
}: Props<T>) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <TouchableOpacity
              key={String(opt.value)}
              onPress={() => onChange(opt.value)}
              activeOpacity={0.8}
              testID={testIDPrefix ? `${testIDPrefix}-${opt.value}` : undefined}
              style={[
                styles.chip,
                active && { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  active && { color: colors.onBrandTertiary, fontWeight: "700" },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 56, justifyContent: "center" },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: "center",
  },
  chip: {
    height: 36,
    flexShrink: 0,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  chipText: {
    color: colors.onSurfaceSecondary,
    fontSize: fontSize.sm,
    fontWeight: "500",
  },
});
