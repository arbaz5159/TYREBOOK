/**
 * Tyre-size normalisation for cross-format matching.
 *
 * The rule MUST stay in lock-step with the Python helper
 * `normalize_size` in /app/backend/oem_utils.py — anything computed on
 * the mobile client is compared against sizes indexed by the same
 * function on the backend, and any drift will silently produce false
 * negatives in the OEM ↔ inventory match.
 *
 *   Input                          →  Output
 *   "90/100-10"                    →  "9010010"
 *   "90/100/10"                    →  "9010010"
 *   "90-100-10"                    →  "9010010"
 *   "90/100 10"                    →  "9010010"
 *   "205/55 R16", "205/55R16"      →  "20555r16"
 *   "215/60 R17", "215/60-R17"     →  "21560r17"
 *   "7.00-15", "7.00 15"           →  "70015"
 *
 * Design guarantees:
 *   - It NEVER modifies the source string that gets displayed.
 *   - It always returns a lowercase, non-space, non-punctuation key.
 *   - Same-size vs different-size decisions on the OEM Result screen
 *     and inventory-match logic on the Available Tyres screen both
 *     consult this helper — so the two answers can never diverge.
 */
export function normalizeSize(raw?: string | null): string {
  if (!raw) return "";
  return String(raw).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Convenience: strict-equal after normalisation. */
export function tyreSizeEquals(a?: string | null, b?: string | null): boolean {
  const na = normalizeSize(a);
  const nb = normalizeSize(b);
  return !!na && na === nb;
}
