// Shop / tenant CRUD and subscription-status helpers.
//
// A "shop" doc lives at `shops/{shopId}` at the ROOT of Firestore. Its
// subcollections (tyres, sales, customers, ...) are all tenant-scoped
// automatically (see /src/firebase/tenant.ts).

import {

  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { getDb } from "./config";
import { stripUndefined } from "./util";

export type ShopStatus = "trial" | "active" | "expired" | "suspended";

export interface Shop {
  id: string;
  name: string;
  ownerUid: string; // uid of the shop_admin who created it
  ownerEmail: string;
  status: ShopStatus;
  /** unix ms — when the free trial ends (only meaningful when status === "trial") */
  trialEndsAt?: number;
  /** unix ms — when the paid plan ends (only meaningful when status === "active") */
  planExpiresAt?: number;
  createdAt: number;
  updatedAt?: number;
  notes?: string;
}

export const TRIAL_DURATION_DAYS = 14;

const SHOPS_COLLECTION = "shops";

function slugify(input: string): string {
  return (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Effective status — takes into account trial/plan expiry timestamps.
 * A "trial" whose `trialEndsAt` has passed is treated as "expired".
 * An "active" plan whose `planExpiresAt` has passed is treated as "expired".
 */
export function effectiveStatus(shop: Shop | null | undefined): ShopStatus {
  if (!shop) return "expired";
  const now = Date.now();
  if (shop.status === "trial" && shop.trialEndsAt && shop.trialEndsAt < now) return "expired";
  if (shop.status === "active" && shop.planExpiresAt && shop.planExpiresAt < now) return "expired";
  return shop.status;
}

/** True when the shop's subscription lets the team use the app normally. */
export function isShopUsable(shop: Shop | null | undefined): boolean {
  const s = effectiveStatus(shop);
  return s === "trial" || s === "active";
}

/**
 * Create a new shop. Called from the signup flow when a fresh user is not
 * an invited staff / super_admin — they become the shop_admin of a new
 * tenant with a 14-day trial.
 */
export async function createShop(input: {
  name: string;
  ownerUid: string;
  ownerEmail: string;
}): Promise<Shop> {
  const db = getDb();
  if (!db) throw new Error("Firestore not configured.");

  // Prefer a human-readable slug derived from the shop name; fall back to
  // an auto-generated id if the slug clashes.
  const base = slugify(input.name) || slugify(input.ownerEmail.split("@")[0]) || "shop";
  const attempt = async (id: string): Promise<Shop | null> => {
    const ref = doc(db, SHOPS_COLLECTION, id);
    const snap = await getDoc(ref);
    if (snap.exists()) return null;
    const now = Date.now();
    const trialEndsAt = now + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;
    const payload: Shop = {
      id,
      name: input.name.trim(),
      ownerUid: input.ownerUid,
      ownerEmail: input.ownerEmail.toLowerCase(),
      status: "trial",
      trialEndsAt,
      createdAt: now,
    };
    await setDoc(
      ref,
      stripUndefined({ ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    );
    return payload;
  };
  const first = await attempt(base);
  if (first) return first;
  for (let i = 2; i < 20; i++) {
    const alt = await attempt(`${base}-${i}`);
    if (alt) return alt;
  }
  // Fallback: random-suffix (unlikely to clash).
  const rand = `${base}-${Math.random().toString(36).slice(2, 8)}`;
  const created = await attempt(rand);
  if (!created) throw new Error("Could not allocate a unique shop id.");
  return created;
}

export async function getShop(shopId: string): Promise<Shop | null> {
  const db = getDb();
  if (!db) return null;
  const snap = await getDoc(doc(db, SHOPS_COLLECTION, shopId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Shop, "id">) };
}

export async function listAllShops(): Promise<Shop[]> {
  const db = getDb();
  if (!db) return [];
  const snap = await getDocs(collection(db, SHOPS_COLLECTION));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Shop, "id">) }))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export async function updateShop(
  shopId: string,
  data: Partial<Omit<Shop, "id">>,
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Firestore not configured.");
  await updateDoc(
    doc(db, SHOPS_COLLECTION, shopId),
    stripUndefined({ ...data, updatedAt: serverTimestamp() }),
  );
}

export async function setShopStatus(
  shopId: string,
  status: ShopStatus,
  extras: { planExpiresAt?: number; trialEndsAt?: number } = {},
): Promise<void> {
  return updateShop(shopId, { status, ...extras });
}

export async function deleteShop(shopId: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Firestore not configured.");
  // Note: this only removes the shop root doc; subcollection cleanup is a
  // heavier operation and would need a Cloud Function. Kept intentional so
  // Super Admin doesn't nuke months of history by accident.
  await deleteDoc(doc(db, SHOPS_COLLECTION, shopId));
}

/**
 * Extend/renew subscription. Convenience helper for Super Admin panel.
 * Sets status='active' with a plan expiry N days from now.
 */
export async function extendPlanDays(shopId: string, days: number): Promise<void> {
  const now = Date.now();
  const planExpiresAt = now + days * 24 * 60 * 60 * 1000;
  await setShopStatus(shopId, "active", { planExpiresAt });
}

/**
 * Add an ad-hoc trial extension (used when a merchant asks for a few extra
 * days before committing to a paid plan).
 */
export async function extendTrialDays(shopId: string, extraDays: number): Promise<void> {
  const shop = await getShop(shopId);
  if (!shop) throw new Error("Shop not found.");
  const base = shop.trialEndsAt && shop.trialEndsAt > Date.now() ? shop.trialEndsAt : Date.now();
  const trialEndsAt = base + extraDays * 24 * 60 * 60 * 1000;
  await setShopStatus(shopId, "trial", { trialEndsAt });
}
