// Material Design 3 tokens for TyreBook (Expressive Light, teal palette).
// Referenced by every screen — do NOT hard-code colors elsewhere.

export const colors = {
  surface: "#F8FAF9",
  onSurface: "#191C1B",
  surfaceSecondary: "#E9EFEE",
  onSurfaceSecondary: "#3F4947",
  surfaceTertiary: "#DDE5E4",
  onSurfaceTertiary: "#191C1B",
  surfaceInverse: "#2E3130",
  onSurfaceInverse: "#EFF1F0",

  brand: "#006B5F",
  brandPrimary: "#006B5F",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#4A635E",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#CCE8E3",
  onBrandTertiary: "#05201C",

  success: "#146C2E",
  onSuccess: "#FFFFFF",
  warning: "#8D4F00",
  onWarning: "#FFFFFF",
  error: "#BA1A1A",
  onError: "#FFFFFF",

  border: "#BEC9C7",
  borderStrong: "#6F7978",
  divider: "#DDE5E4",

  muted: "#6F7978",
  overlay: "rgba(0,0,0,0.4)",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  display: 32,
} as const;

export const fontWeight = {
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
};
