// Shop staff roster — one doc per member at `shops/{shopId}/members/{uid}`.
//
// The user's authentication record lives at the global `users/{uid}` doc
// (managed by /src/firebase/auth.ts). This module only manages the
// tenant-scoped MIRROR used to render the Shop Admin's team list and to
// enable/disable individual staff.
//
// Adding a new staff member from the Shop Admin panel is a two-step flow:
//   1. Shop Admin calls `inviteStaff({ email })` (see ./invites.ts).
//   2. Invitee signs up with that email → /src/firebase/auth.ts consumes
//      the invite and creates the member doc automatically.
//
// So this file exposes list / toggle-active / delete for the *members*
// collection, plus a re-export of `inviteStaff` so screens have a single
// import surface.

import {
  deleteDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "./fsSdk";

import { storage } from "@/src/utils/storage";

import { getDb } from "./config";
import { inviteStaff as inviteStaffCore, listInvitesForShop, revokeInvite } from "./invites";
import { tenantCol, tenantDoc } from "./tenant";
import { stripUndefined } from "./util";
import { localId } from "@/src/utils/localId";

export interface StaffUser {
  id: string; // uid for Firebase-backed members; localId() for offline mock
  name: string;
  email: string;
  role: "shop_admin" | "staff";
  active: boolean;
  createdAt?: number;
}

const COLLECTION = "members";
const LOCAL_KEY = "tyrebook.members";

async function readLocal(): Promise<StaffUser[]> {
  const raw = await storage.getItem<string | null>(LOCAL_KEY, null);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as StaffUser[];
  } catch {
    return [];
  }
}
async function writeLocal(list: StaffUser[]): Promise<void> {
  await storage.setItem(LOCAL_KEY, JSON.stringify(list));
}

export async function listUsers(): Promise<StaffUser[]> {
  const db = getDb();
  if (!db) return (await readLocal()).sort((a, b) => a.name.localeCompare(b.name));
  try {
    const snap = await getDocs(tenantCol(db, COLLECTION));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<StaffUser, "id">) }))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  } catch (e) {
    console.warn("[users] listUsers failed:", e);
    return [];
  }
}

/**
 * Legacy no-op: fresh staff should be added via the invite flow. This
 * helper is kept only for the local-mock code path so screens keep
 * working when Firebase isn't configured.
 */
export async function createUser(data: Omit<StaffUser, "id">): Promise<string> {
  const db = getDb();
  if (!db) {
    const list = await readLocal();
    const id = localId();
    list.push({ ...data, id, createdAt: Date.now() });
    await writeLocal(list);
    return id;
  }
  // For real Firebase: create the member doc as a placeholder. Real auth
  // hook-up happens when the invited email signs up.
  const id = localId();
  await setDoc(
    tenantDoc(db, COLLECTION, id),
    stripUndefined({ ...data, createdAt: serverTimestamp() }),
  );
  return id;
}

export async function updateUser(
  id: string,
  data: Partial<Omit<StaffUser, "id">>,
): Promise<void> {
  const db = getDb();
  if (!db) {
    const list = await readLocal();
    const idx = list.findIndex((x) => x.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...data };
      await writeLocal(list);
    }
    return;
  }
  await updateDoc(tenantDoc(db, COLLECTION, id), stripUndefined(data));
}

export async function deleteUser(id: string): Promise<void> {
  const db = getDb();
  if (!db) {
    const list = await readLocal();
    await writeLocal(list.filter((x) => x.id !== id));
    return;
  }
  await deleteDoc(tenantDoc(db, COLLECTION, id));
}

// --- Invite re-exports -----------------------------------------------------

export async function inviteStaff(input: {
  email: string;
  shopId: string;
  invitedByUid: string;
}) {
  return inviteStaffCore(input);
}

export { listInvitesForShop, revokeInvite };
