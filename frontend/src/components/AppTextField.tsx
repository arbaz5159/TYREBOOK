import React from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

interface Props extends TextInputProps {
  label: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightSlot?: React.ReactNode;
}

export function AppTextField({ label, error, leftIcon, rightSlot, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          !!error && { borderColor: colors.error },
        ]}
      >
        {leftIcon ? <View style={styles.left}>{leftIcon}</View> : null}
        <TextInput
          placeholderTextColor={colors.muted}
          style={[styles.input, style]}
          {...rest}
        />
        {rightSlot ? <View style={styles.right}>{rightSlot}</View> : null}
      </View>
      {error ? <Text style={styles.err}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: {
    fontSize: fontSize.sm,
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.xs,
    fontWeight: "600",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  left: { marginRight: spacing.sm },
  right: { marginLeft: spacing.sm },
  input: {
    flex: 1,
    color: colors.onSurface,
    fontSize: fontSize.base,
    paddingVertical: spacing.md,
  },
  err: {
    fontSize: fontSize.xs,
    color: colors.error,
    marginTop: spacing.xs,
  },
});
