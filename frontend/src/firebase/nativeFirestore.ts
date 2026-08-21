// Native Firestore adapter — used ONLY when Platform.OS !== "web" AND the
// caller is authenticated through @react-native-firebase/auth (i.e. the
// phone-OTP path on a real Android/iOS build). Web keeps its existing JS
// Firestore path completely untouched.
//
// SCOPE (intentionally narrow): only the reads/writes performed during
// hydrateAppUser + upsertUserDoc + shop provisioning that immediately
// follow a phone-auth sign-in. All other Firestore code (dashboard,
// sales, tyres, purchases, khata, admin OEM etc.) continues to use the
// JS SDK. If a native phone user later needs those downstream flows,
// they'll be handled in a follow-up migration.
//
// This file is safe to import from Web too — every export short-circuits
// to a no-op when `Platform.OS === "web"` so bundlers that fail to
// tree-shake the RNFirebase native modules won't blow up in the browser.

import { Platform } from "react-native";

import type {
  DocumentData,
  DocumentReference,
  FieldValue,
  Firestore,
} from "@react-native-firebase/firestore";

// Merge flag mirrors the `{ merge: true }` argument on JS SDK's setDoc.
export type NativeFirestoreMerge = boolean;

// Modular v26 RNFB firestore exports we consume. Kept as a narrow local
// interface so we get real types WITHOUT triggering a static import that
// would break the Web bundle.
interface NativeFirestoreExports {
  getFirestore: () => Firestore;
  doc: (parent: Firestore, path: string, ...pathSegments: string[]) =>
    DocumentReference<DocumentData, DocumentData>;
  getDoc: (ref: DocumentReference<DocumentData, DocumentData>) =>
    Promise<{ exists: boolean | (() => boolean); data: () => DocumentData | undefined }>;
  setDoc: (
    ref: DocumentReference<DocumentData, DocumentData>,
    data: DocumentData,
    options?: { merge?: boolean; mergeFields?: string[] },
  ) => Promise<void>;
  serverTimestamp: () => FieldValue;
}

function loadNativeFirestore(): NativeFirestoreExports {
  if (Platform.OS === "web") {
    throw new Error(
      "nativeFirestore called on Web — this is a programmer error; the caller must Platform-gate.",
    );
  }
  // Dynamic require so the Web bundle never even attempts to resolve the
  // native module (which would fail because it depends on the JSI bridge).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@react-native-firebase/firestore") as NativeFirestoreExports;
}

/**
 * Split a `[coll, id, coll, id, ...]` path into `(head, ...tail)` and
 * hand it to modular `doc(fs, head, ...tail)`. The path must have an
 * EVEN length — this helper is only used for document read/write.
 */
function docRef(
  fs: NativeFirestoreExports,
  path: readonly string[],
): DocumentReference<DocumentData, DocumentData> {
  if (path.length === 0 || path.length % 2 !== 0) {
    throw new Error(
      `nativeFirestore.docRef: expected even-length doc path, got ${JSON.stringify(path)}`,
    );
  }
  const [head, ...tail] = path;
  return fs.doc(fs.getFirestore(), head, ...tail);
}

function snapshotExists(snap: { exists: boolean | (() => boolean) }): boolean {
  // RNFB has historically shipped `exists` as a getter-style boolean on
  // native snapshots, but the modular typings now match the JS SDK's
  // `exists(): boolean` function-form. Support both so we don't break if
  // the underlying representation flips between minor versions.
  const e = (snap as unknown as { exists: unknown }).exists;
  return typeof e === "function" ? Boolean((e as () => boolean).call(snap)) : Boolean(e);
}

/**
 * Read a document by (collection, id, ...) path using the native SDK and
 * return its `.data()` shape (or `null` when the doc doesn't exist).
 */
export async function nativeGetDocData<T = Record<string, unknown>>(
  path: readonly string[],
): Promise<T | null> {
  if (Platform.OS === "web") return null;
  const fs = loadNativeFirestore();
  const ref = docRef(fs, path);
  const snap = await fs.getDoc(ref);
  if (!snapshotExists(snap)) return null;
  return (snap.data() as T) ?? null;
}

/**
 * Return `true` if a document exists at the given path, `false` otherwise.
 * Throws if the read is rejected by rules (callers should catch and treat
 * as "unknown" — mirroring the JS SDK behaviour used in `createShop`).
 */
export async function nativeDocExists(path: readonly string[]): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const fs = loadNativeFirestore();
  const ref = docRef(fs, path);
  const snap = await fs.getDoc(ref);
  return snapshotExists(snap);
}

/**
 * Write a document. `merge` matches JS SDK semantics (partial update vs
 * full overwrite). Values may include the native serverTimestamp sentinel
 * (`nativeServerTimestamp()`) — do not intermix with JS SDK sentinels.
 */
export async function nativeSetDoc(
  path: readonly string[],
  data: Record<string, unknown>,
  merge: NativeFirestoreMerge = false,
): Promise<void> {
  if (Platform.OS === "web") return;
  const fs = loadNativeFirestore();
  const ref = docRef(fs, path);
  await fs.setDoc(ref, data as DocumentData, merge ? { merge: true } : undefined);
}

/**
 * Native serverTimestamp() sentinel. Wrapped so callers don't need to
 * import from @react-native-firebase/firestore directly.
 */
export function nativeServerTimestamp(): FieldValue {
  if (Platform.OS === "web") {
    // Truly unreachable — kept only to satisfy the type checker on Web.
    return null as unknown as FieldValue;
  }
  return loadNativeFirestore().serverTimestamp();
}
