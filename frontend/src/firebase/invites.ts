// Staff invitation system.
//
// Flow:
//   1. Shop Admin enters staff email → we write a doc at
//      shopInvites/{sanitized_email} containing { shopId, role: "staff",
//      invitedByUid, createdAt }.
//   2. Recipient signs up via the normal Signup screen.
//   3. During signup, /src/firebase/auth.ts looks up the invite by their
//      email. If found → the new user is created as `staff` linked to the
//      inviter's shopId, and the invite doc is deleted (consumed).
//   4. If no invite exists AND the email isn't a SUPER_ADMIN, the user is
//      treated as a fresh shop_admin and a new shop is auto-provisioned.

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import { getDb } from "./config";
import { stripUndefined } from "./util";

export interface ShopInvite {
  id: string; // sanitized email
  email: string;
  shopId: string;
  invitedByUid: string;
  role: "staff";
  createdAt: number;
}

const COLLECTION = "shopInvites";

/** Firestore doc ids cannot contain "/", "." or start with "__". Use a
 *  deterministic slug so lookup by email is a single getDoc. */
export function inviteKey(email: string): string {
  return (email || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

export async function inviteStaff(input: {
  email: string;
  shopId: string;
  invitedByUid: string;
}): Promise<ShopInvite> {
  const db = getDb();
  if (!db) throw new Error("Firestore not configured.");
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Invalid email address.");
  const id = inviteKey(email);
  const payload: ShopInvite = {
    id,
    email,
    shopId: input.shopId,
    invitedByUid: input.invitedByUid,
    role: "staff",
    createdAt: Date.now(),
  };
  await setDoc(
    doc(db, COLLECTION, id),
    stripUndefined({ ...payload, createdAt: serverTimestamp() }),
  );
  return payload;
}

export async function findInviteByEmail(email: string): Promise<ShopInvite | null> {
  const db = getDb();
  if (!db) return null;
  const id = inviteKey(email);
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, COLLECTION, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<ShopInvite, "id">) };
  } catch {
    return null;
  }
}

export async function listInvitesForShop(shopId: string): Promise<ShopInvite[]> {
  const db = getDb();
  if (!db) return [];
  const snap = await getDocs(query(collection(db, COLLECTION), where("shopId", "==", shopId)));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ShopInvite, "id">) }))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export async function consumeInvite(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await deleteDoc(doc(db, COLLECTION, id));
  } catch {
    // best-effort — a stale invite is harmless
  }
}

export async function revokeInvite(id: string): Promise<void> {
  return consumeInvite(id);
}
