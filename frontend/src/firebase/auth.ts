// Thin wrappers around Firebase Auth with graceful local fallback so the UI
// remains testable before real credentials are pasted into .env.
//
// On successful sign-in / sign-up we also upsert a document into the
// `users/{uid}` collection so RBAC (owner/staff) works and the Owner Admin
// panel can list all users. Role is read back from that same doc — the local
// AsyncStorage copy is only a cache used before the Firestore fetch resolves.

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { storage } from "@/src/utils/storage";

import { getDb, getFirebaseAuth, isFirebaseConfigured } from "./config";
import { stripUndefined } from "./util";

export type UserRole = "owner" | "staff";

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
}

const LOCAL_USER_KEY = "tyrebook.localUser";
const ROLE_KEY = "tyrebook.role";

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

// Upsert users/{uid} — merge so we never wipe an existing role/name.
async function upsertUserDoc(
  user: User,
  data: { name?: string; role: UserRole },
): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      // Only refresh mutable, non-role fields on subsequent sign-ins.
      await setDoc(
        ref,
        stripUndefined({
          email: user.email ?? undefined,
          name: data.name || (snap.data() as any).name || user.displayName || undefined,
          lastLoginAt: serverTimestamp(),
        }),
        { merge: true },
      );
    } else {
      await setDoc(
        ref,
        stripUndefined({
          uid: user.uid,
          email: user.email ?? undefined,
          name: data.name || user.displayName || (user.email ?? "").split("@")[0],
          role: data.role,
          active: true,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
        }),
        { merge: true },
      );
    }
  } catch {
    // Non-fatal: allow login to proceed even if Firestore write fails so the
    // user isn't locked out of the app because of a rules mis-configuration.
  }
}

async function readUserDoc(uid: string): Promise<{ role: UserRole; name?: string } | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;
    const data = snap.data() as any;
    const role: UserRole = data.role === "staff" ? "staff" : "owner";
    return { role, name: typeof data.name === "string" ? data.name : undefined };
  } catch {
    return null;
  }
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
  // Prefer whatever Firestore says the role is; fall back to what the user
  // selected on the segmented control at login.
  const existing = await readUserDoc(cred.user.uid);
  const effectiveRole: UserRole = existing?.role ?? role;
  await upsertUserDoc(cred.user, { name: existing?.name, role: effectiveRole });
  await storage.setItem(ROLE_KEY, effectiveRole);
  return mapUser(cred.user, effectiveRole);
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
    try {
      await updateProfile(cred.user, { displayName: name });
    } catch {
      // Ignore — displayName is a nice-to-have; the users/{uid} doc is truth.
    }
  }
  await upsertUserDoc(cred.user, { name, role });
  await storage.setItem(ROLE_KEY, role);
  return mapUser(cred.user, role);
}

export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  if (auth) await fbSignOut(auth);
  await writeLocalUser(null);
  await storage.removeItem(ROLE_KEY);
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
    // Hydrate role from Firestore first (source of truth), fall back to the
    // AsyncStorage-cached role, then default to "owner".
    const remote = await readUserDoc(user.uid);
    const cached = (await storage.getItem<UserRole>(ROLE_KEY, "owner")) ?? "owner";
    const role: UserRole = remote?.role ?? cached;
    // Make sure the doc exists (idempotent — handles legacy accounts that
    // predate this upsert flow).
    if (!remote) await upsertUserDoc(user, { role });
    cb(mapUser(user, role));
  });
}

export { isFirebaseConfigured };
