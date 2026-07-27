// Thin wrappers around Firebase Auth with graceful local fallback so the UI
// remains testable before real credentials are pasted into .env.

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from "firebase/auth";

import { storage } from "@/src/utils/storage";

import { getFirebaseAuth, isFirebaseConfigured } from "./config";

export type UserRole = "owner" | "staff";

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
}

const LOCAL_USER_KEY = "tyrebook.localUser";

async function readLocalUser(): Promise<AppUser | null> {
  const raw = await storage.getItem<string | null>(LOCAL_USER_KEY, null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppUser;
  } catch {
    return null;
  }
}

async function writeLocalUser(user: AppUser | null): Promise<void> {
  if (user) {
    await storage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
  } else {
    await storage.removeItem(LOCAL_USER_KEY);
  }
}

function mapUser(user: User, role: UserRole): AppUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    role,
  };
}

export async function signIn(
  email: string,
  password: string,
  role: UserRole,
): Promise<AppUser> {
  const auth = getFirebaseAuth();
  if (!auth) {
    // Local fallback so UI works without Firebase credentials.
    const local: AppUser = {
      uid: `local-${role}-${Date.now()}`,
      email,
      displayName: email.split("@")[0] ?? "User",
      role,
    };
    await writeLocalUser(local);
    return local;
  }
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const appUser = mapUser(cred.user, role);
  await storage.setItem("tyrebook.role", role);
  return appUser;
}

export async function signUp(
  name: string,
  email: string,
  password: string,
  role: UserRole,
): Promise<AppUser> {
  const auth = getFirebaseAuth();
  if (!auth) {
    const local: AppUser = {
      uid: `local-${role}-${Date.now()}`,
      email,
      displayName: name,
      role,
    };
    await writeLocalUser(local);
    return local;
  }
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (name) {
    await updateProfile(cred.user, { displayName: name });
  }
  await storage.setItem("tyrebook.role", role);
  return mapUser(cred.user, role);
}

export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  if (auth) await fbSignOut(auth);
  await writeLocalUser(null);
  await storage.removeItem("tyrebook.role");
}

export function subscribeAuth(cb: (user: AppUser | null) => void): () => void {
  const auth = getFirebaseAuth();
  if (!auth) {
    // Local one-shot for the mock path.
    (async () => {
      const u = await readLocalUser();
      cb(u);
    })();
    return () => {};
  }
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      cb(null);
      return;
    }
    const role = (await storage.getItem<UserRole>("tyrebook.role", "owner")) ?? "owner";
    cb(mapUser(user, role));
  });
}

export { isFirebaseConfigured };
