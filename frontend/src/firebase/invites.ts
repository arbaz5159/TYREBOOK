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
} from "./fsSdk";

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

/** Deterministic doc id derived from an email. The current format is
 *  simply `email.trim().toLowerCase()` — Firestore doc ids DO allow "@"
 *  and "." (the earlier slug format was overly conservative), and this
 *  matches exactly what the Firestore Security Rules can compute from
 *  `request.auth.token.email.trim().lower()`. That equivalence is the
 *  linchpin of the rules-verifiable invite check: a rogue client can no
 *  longer self-create a Staff `users/{uid}` doc unless a matching invite
 *  doc actually exists at this exact path.
 *
 *  Fallback: any pre-existing invite documents stored under the legacy
 *  regex-slug format continue to be readable via `legacyInviteKey()`
 *  below, so no in-flight invites are stranded. Legacy invites are NOT
 *  rules-verifiable — a Super Admin should re-issue them (or run the
 *  optional migration helper) so new signups can pass the strict CREATE
 *  rule on `users/{uid}`.
 */
export function inviteKey(email: string): string {
  return (email || "").trim().toLowerCase();
}

/** Legacy key format used by TyreBook prior to the security-rules
 *  hardening. Retained only so `findInviteByEmail` can gracefully fall
 *  back to old invite docs during the transition window. Do NOT write
 *  new invites to this key. */
export function legacyInviteKey(email: string): string {
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
  const primary = inviteKey(email);
  if (!primary) return null;
  // Try the new rules-verifiable key first. If it's missing, fall back to
  // any doc still stored under the pre-hardening slug format so in-flight
  // invitees aren't stranded during the migration window.
  const candidates = [primary, legacyInviteKey(email)].filter(
    (v, i, arr) => v && arr.indexOf(v) === i,
  );
  for (const id of candidates) {
    try {
      const snap = await getDoc(doc(db, COLLECTION, id));
      if (snap.exists()) {
        return { id: snap.id, ...(snap.data() as Omit<ShopInvite, "id">) };
      }
    } catch {
      // continue to next candidate
    }
  }
  return null;
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
