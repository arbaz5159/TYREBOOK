import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

interface Props {
  title: string;
  message?: string;
  icon?: React.ReactNode;
}

export function EmptyState({ title, message, icon }: Props) {
  return (
    <View style={styles.wrap}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.msg}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
  },
  icon: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.onSurface,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  msg: {
    fontSize: fontSize.base,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
});
