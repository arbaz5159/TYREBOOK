// Local-only id generator. Used by the AsyncStorage-backed Firebase mocks
// when the real Firestore isn't configured. Guarantees monotonic uniqueness
// across same-millisecond calls in a single JS runtime by appending a short
// random suffix and a per-runtime counter.

let counter = 0;

export function localId(prefix = "local"): string {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.floor(Math.random() * 0xffff).toString(36);
  return `${prefix}-${Date.now()}-${counter.toString(36)}${rand}`;
}
