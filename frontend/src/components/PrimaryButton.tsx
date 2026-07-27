import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";

import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

interface Props {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  leftIcon?: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
  fullWidth?: boolean;
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  variant = "primary",
  leftIcon,
  style,
  testID,
  fullWidth = true,
}: Props) {
  const bg =
    variant === "primary"
      ? colors.brandPrimary
      : variant === "secondary"
      ? colors.brandTertiary
      : variant === "danger"
      ? colors.error
      : "transparent";
  const fg =
    variant === "secondary"
      ? colors.onBrandTertiary
      : variant === "ghost"
      ? colors.brandPrimary
      : "#FFFFFF";

  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      style={[
        styles.btn,
        { backgroundColor: bg, opacity: isDisabled ? 0.6 : 1 },
        fullWidth && { width: "100%" },
        variant === "ghost" && { borderWidth: 1, borderColor: colors.brandPrimary },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {leftIcon}
          <Text style={[styles.label, { color: fg, marginLeft: leftIcon ? spacing.sm : 0 }]}>
            {label}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  row: { flexDirection: "row", alignItems: "center" },
  label: { fontSize: fontSize.base, fontWeight: "700" },
});
