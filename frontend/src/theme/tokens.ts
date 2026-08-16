// Material Design 3 tokens for TyreBook.
// Referenced by every screen — do NOT hard-code colors elsewhere.
//
// Palette derived from the TYREBOOK splash reference (Aug 2026 refresh):
//   deep navy blue  (#0B2A63) — logo shell, top nav, on-brand text on light bg
//   bright blue     (#1E88E5) — primary accent, CTAs, "BOOK" wordmark
//   pure white      (#FFFFFF) — canvas / cards
//   soft blue-grey  (#F1F5FB, #E3ECF6) — surfaceSecondary, dividers
// Success / warning / error remain semantic (green / amber / red) but re-tuned
// for contrast against the new blue-tinted neutrals.

export const colors = {
  // ---- neutrals ----
  surface: "#FFFFFF",
  onSurface: "#0F1B3D",
  surfaceSecondary: "#F1F5FB",
  onSurfaceSecondary: "#3E5075",
  surfaceTertiary: "#E3ECF6",
  onSurfaceTertiary: "#0F1B3D",
  surfaceInverse: "#001D57", // deep navy — sampled from splash reference
  onSurfaceInverse: "#FFFFFF",

  // ---- brand ----
  brand: "#1E88E5", // bright blue (the "BOOK" wordmark)
  brandPrimary: "#1E88E5",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#001D57", // deep navy — headings, secondary accents
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#DCEBFB", // very light blue chip
  onBrandTertiary: "#001D57",

  // ---- semantic ----
  success: "#0F7B4C",
  onSuccess: "#FFFFFF",
  warning: "#8D4F00",
  onWarning: "#FFFFFF",
  error: "#BA1A1A",
  onError: "#FFFFFF",

  // ---- lines ----
  border: "#C8D6EA",
  borderStrong: "#6F82A6",
  divider: "#E3ECF6",

  // ---- text ----
  muted: "#6F82A6",
  overlay: "rgba(11,42,99,0.55)", // navy overlay for modals
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
