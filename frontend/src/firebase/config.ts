// Firebase JS SDK initialization for Expo (works in Expo Go + dev builds).
// Fill EXPO_PUBLIC_FIREBASE_* variables in frontend/.env to enable real
// Auth + Firestore. Until then, `isFirebaseConfigured()` returns false and
// the app falls back to a local (AsyncStorage) mock so the UI stays usable.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
// @ts-expect-error - getReactNativePersistence is exported from firebase/auth for RN
import { getReactNativePersistence, initializeAuth, getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

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
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.appId,
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
    auth = initializeAuth(a, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
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
