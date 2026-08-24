// Platform-branched Firestore SDK facade.
//
// PROBLEM
// -------
// Native phone-OTP login authenticates the user in the RNFB (@react-native-
// firebase/auth) session. The Firebase JS SDK auth session, however, stays
// empty on native — nothing signs into it. Any Firestore request issued
// through `firebase/firestore` therefore leaves for the wire with
// `request.auth == null`, so security rules that check `request.auth.uid`
// (all of ours do) reject the request with `permission-denied`.
//
// FIX
// ---
// On Native we re-export the SAME MODULAR firestore functions
// (collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
// query, where, orderBy, limit, serverTimestamp, Timestamp, writeBatch,
// runTransaction, onSnapshot) from @react-native-firebase/firestore.
// The RNFB v26 modular API mirrors the JS SDK's signatures 1:1 for these
// functions, so existing call-sites keep compiling untouched.
//
// On Web we re-export the exact same names from `firebase/firestore`,
// preserving today's Web behaviour byte-for-byte.
//
// `getDb()` in `config.ts` is likewise Platform-branched so that the
// `Firestore` instance passed as the first argument matches the module
// the modular functions live in.
//
// IMPORTANT (Message 552 regression fix)
// --------------------------------------
// The JS SDK is brought in via a STATIC `import * as` — NOT `require()`.
// Metro's Web bundler resolves `import` and `require` through different
// package.json fields (`browser`/`module` vs `main`). Using both would
// materialise TWO copies of `firebase/firestore` in the bundle, each with
// its own `Firestore` class prototype, so `doc()` from copy A rejects a
// Firestore instance produced by `getFirestore()` from copy B with the
// exact "Expected first argument to doc() to be a CollectionReference,
// a DocumentReference or FirebaseFirestore" error.
//
// Metro DOES ignore the `import` in the Web bundle when Platform.OS is
// stripped by tree-shaking? No — Metro can't statically fold Platform.OS.
// So `import * as jsSdk from "firebase/firestore"` stays in every
// platform's bundle, which is exactly what we want on Web (and harmless
// on Native, where we override with the RNFB module below).

import { Platform } from "react-native";
import * as jsSdk from "firebase/firestore";

type FirestoreSdk = typeof jsSdk;

// Resolve the active SDK ONCE at module init.
//   * Web  → JS SDK (statically imported above — same module instance
//            as every other file that imports from "firebase/firestore").
//   * Native → RNFB via runtime require so the Web bundle never even
//            attempts to resolve the native-only module.
let sdk: FirestoreSdk = jsSdk;
let nativeSdk: FirestoreSdk | null = null;

if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeSdk = require("@react-native-firebase/firestore") as unknown as FirestoreSdk;
    sdk = nativeSdk;
  } catch {
    // RNFB native module unavailable (e.g. Expo Go). Fall back to the JS
    // SDK so the app doesn't crash — auth-guarded reads will still fail
    // with permission-denied in that environment, which is the same
    // behaviour as before this fix.
    nativeSdk = null;
    sdk = jsSdk;
  }
}

// Re-export the modular Firestore API surface used across the codebase.
// Web and Native resolve to different underlying modules at runtime, but
// share the same JS SDK type signatures for the compiler.
export const collection = sdk.collection;
export const doc = sdk.doc;
export const getDoc = sdk.getDoc;
export const getDocs = sdk.getDocs;
export const setDoc = sdk.setDoc;
export const addDoc = sdk.addDoc;
export const updateDoc = sdk.updateDoc;
export const deleteDoc = sdk.deleteDoc;
export const query = sdk.query;
export const where = sdk.where;
export const orderBy = sdk.orderBy;
export const limit = sdk.limit;
export const serverTimestamp = sdk.serverTimestamp;
export const Timestamp = sdk.Timestamp;
export const writeBatch = sdk.writeBatch;
export const runTransaction = sdk.runTransaction;
export const onSnapshot = sdk.onSnapshot;

// Also expose the RNFB `getFirestore` binding lazily so `config.ts` can
// build the correct `Firestore` instance without needing its own
// platform-branched require.
export function _getNativeFirestoreModule(): FirestoreSdk | null {
  return nativeSdk;
}
