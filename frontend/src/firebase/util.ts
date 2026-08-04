// Shared Firestore helpers.
//
// stripUndefined() — Firestore's Web SDK rejects payloads containing
// `undefined` values (throws: "Unsupported field value: undefined"). Any form
// that spreads optional fields (e.g. `customerGstin: value || undefined`) must
// pass through this helper before addDoc/setDoc/updateDoc. It also plays well
// with server timestamps and nested plain objects.

export function stripUndefined<T extends Record<string, any>>(input: T): T {
  const out: Record<string, any> = {};
  for (const k of Object.keys(input)) {
    const v = input[k];
    if (v === undefined) continue;
    if (v && typeof v === "object" && !Array.isArray(v) && !isFirestoreSentinel(v)) {
      out[k] = stripUndefined(v as Record<string, any>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

// Server timestamps / delete field / increment are opaque objects with a
// `_methodName` — leave those untouched so Firestore can interpret them.
function isFirestoreSentinel(v: any): boolean {
  return Boolean(v && typeof v === "object" && "_methodName" in v);
}
