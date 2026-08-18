// Firebase JS SDK initialization for Expo (works in Expo Go + dev builds).
// Fill EXPO_PUBLIC_FIREBASE_* variables in frontend/.env to enable real
// Auth + Firestore. Until then, `isFirebaseConfigured()` returns false and
// the app falls back to a local (AsyncStorage) mock so the UI stays usable.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  inMemoryPersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { Platform } from "react-native";

// `getReactNativePersistence` is only exported from the RN build of
// `firebase/auth`. Requiring it via the barrel import causes it to be
// `undefined` on Web, which then throws once we try to call it. We resolve
// it lazily and ONLY when Platform.OS !== "web".
function nativePersistenceFactory(): ((s: unknown) => unknown) | null {
  if (Platform.OS === "web") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const auth = require("firebase/auth") as { getReactNativePersistence?: (s: unknown) => unknown };
    return typeof auth.getReactNativePersistence === "function"
      ? auth.getReactNativePersistence
      : null;
  } catch {
    return null;
  }
}

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey
      && firebaseConfig.projectId
      && firebaseConfig.appId,
  );
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

function ensureApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (app) return app;
  app = getApps()[0] ?? initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseAuth(): Auth | null {
  if (auth) return auth;
  const a = ensureApp();
  if (!a) return null;
  try {
    if (Platform.OS === "web") {
      // On Web we let Firebase pick between indexedDB (preferred) and
      // localStorage automatically — falling back to in-memory if neither
      // is available (e.g. some private-mode browsers). Session tokens are
      // therefore persisted across reloads, matching production behaviour.
      auth = initializeAuth(a, {
        persistence: [
          indexedDBLocalPersistence,
          browserLocalPersistence,
          browserSessionPersistence,
          inMemoryPersistence,
        ],
      });
    } else {
      const rnFactory = nativePersistenceFactory();
      if (rnFactory) {
        auth = initializeAuth(a, {
          persistence: rnFactory(AsyncStorage) as any,
        });
      } else {
        // Extremely rare — RN bundle didn't export the helper. Fall through
        // to a bare initializeAuth so the app can at least run in-memory.
        auth = initializeAuth(a);
      }
    }
  } catch {
    // If auth was ALREADY initialized elsewhere in this JS context (hot-
    // reload, multiple root render, etc.) `initializeAuth` throws; in that
    // case `getAuth` returns the existing instance.
    auth = getAuth(a);
  }
  return auth;
}

export function getDb(): Firestore | null {
  if (db) return db;
  const a = ensureApp();
  if (!a) return null;
  db = getFirestore(a);
  return db;
}
