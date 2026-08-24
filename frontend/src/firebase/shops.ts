// Shop / tenant CRUD and subscription-status helpers.
//
// A "shop" doc lives at `shops/{shopId}` at the ROOT of Firestore. Its
// subcollections (tyres, sales, customers, ...) are all tenant-scoped
// automatically (see /src/firebase/tenant.ts).
//
// Platform note: on Native we branch `getShop` + `createShop` through the
// React Native Firebase Firestore SDK so a phone-OTP session (which lives
// entirely in the RNFB auth session, per Message 515) is honoured by
// Firestore rules. Other exports (list/update/delete) still use the JS
// SDK because they're only called from the Super Admin panel, which
// currently signs in with email/password on Web.

import {

  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "./fsSdk";
import { Platform } from "react-native";

import { getDb } from "./config";
import {
  nativeDocExists,
  nativeGetDocData,
  nativeServerTimestamp,
  nativeSetDoc,
} from "./nativeFirestore";
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
 *
 * Robustness notes:
 *   * On a fresh signup the caller is signed in but is NOT yet a member of
 *     ANY shop, so Firestore rules typically DENY reads of `shops/{slug}`
 *     (which require member/super-admin). The slug-collision `getDoc`
 *     below is therefore wrapped: if it throws "permission-denied" we
 *     skip the collision check and fall back to a random-suffix id
 *     (collision probability ~0 with 6 hex chars over ~10^9 shops).
 *     This keeps the fresh-signup flow working even under strict rules.
 *   * The create WRITE itself is always safe under the current rules —
 *     `shops/{id}` allows create when `ownerUid == request.auth.uid`.
 */
function isPermissionDenied(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code ?? "";
  return code === "permission-denied" || code === "firestore/permission-denied";
}

export async function createShop(input: {
  name: string;
  ownerUid: string;
  ownerEmail: string;
}): Promise<Shop> {
  const base = slugify(input.name) || slugify(input.ownerEmail.split("@")[0]) || "shop";

  const buildPayload = (id: string): Shop => {
    const now = Date.now();
    const trialEndsAt = now + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;
    return {
      id,
      name: input.name.trim(),
      ownerUid: input.ownerUid,
      ownerEmail: input.ownerEmail.toLowerCase(),
      status: "trial",
      trialEndsAt,
      createdAt: now,
    };
  };

  type AttemptResult =
    | { kind: "created"; shop: Shop }
    | { kind: "taken" }
    | { kind: "precheck_denied" };

  const randSuffix = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36);

  // -------------------------------------------------------------------
  // Native path (RNFB Firestore) — authenticated by the phone-auth session
  // -------------------------------------------------------------------
  if (Platform.OS !== "web") {
    const tryNativeWithPrecheck = async (id: string): Promise<AttemptResult> => {
      try {
        if (await nativeDocExists(["shops", id])) return { kind: "taken" };
      } catch (e) {
        if (isPermissionDenied(e)) return { kind: "precheck_denied" };
        throw e;
      }
      const payload = buildPayload(id);
      await nativeSetDoc(
        ["shops", id],
        stripUndefined({
          ...payload,
          createdAt: nativeServerTimestamp(),
          updatedAt: nativeServerTimestamp(),
        }),
      );
      return { kind: "created", shop: payload };
    };
    const writeNativeWithRandomId = async (): Promise<Shop> => {
      const id = `${base}-${randSuffix()}`;
      const payload = buildPayload(id);
      await nativeSetDoc(
        ["shops", id],
        stripUndefined({
          ...payload,
          createdAt: nativeServerTimestamp(),
          updatedAt: nativeServerTimestamp(),
        }),
      );
      return payload;
    };
    const firstN = await tryNativeWithPrecheck(base);
    if (firstN.kind === "created") return firstN.shop;
    if (firstN.kind === "precheck_denied") return writeNativeWithRandomId();
    for (let i = 2; i < 20; i++) {
      const altN = await tryNativeWithPrecheck(`${base}-${i}`);
      if (altN.kind === "created") return altN.shop;
      if (altN.kind === "precheck_denied") return writeNativeWithRandomId();
    }
    return writeNativeWithRandomId();
  }

  // -------------------------------------------------------------------
  // Web path (Firebase JS SDK) — unchanged
  // -------------------------------------------------------------------
  const db = getDb();
  if (!db) throw new Error("Firestore not configured.");

  // Attempt with slug pre-check. If we hit permission-denied on the
  // slug-existence probe, we can't verify the slug is free — signal
  // "PRECHECK_DENIED" to jump straight to a random-suffix id (which
  // effectively cannot collide).

  const tryWithPrecheck = async (id: string): Promise<AttemptResult> => {
    const ref = doc(db, SHOPS_COLLECTION, id);
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) return { kind: "taken" };
    } catch (e) {
      if (isPermissionDenied(e)) return { kind: "precheck_denied" };
      throw e;
    }
    const payload = buildPayload(id);
    await setDoc(
      ref,
      stripUndefined({ ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    );
    return { kind: "created", shop: payload };
  };

  // Blind-write path — used ONLY when pre-check is denied by rules. We
  // pick a UUID-strength suffix so collision odds are negligible and we
  // never overwrite an existing tenant.
  const writeWithRandomId = async (): Promise<Shop> => {
    const id = `${base}-${randSuffix()}`;
    const payload = buildPayload(id);
    await setDoc(
      doc(db, SHOPS_COLLECTION, id),
      stripUndefined({ ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    );
    return payload;
  };

  const first = await tryWithPrecheck(base);
  if (first.kind === "created") return first.shop;
  if (first.kind === "precheck_denied") return writeWithRandomId();
  // slug taken — try numeric suffixes.
  for (let i = 2; i < 20; i++) {
    const alt = await tryWithPrecheck(`${base}-${i}`);
    if (alt.kind === "created") return alt.shop;
    if (alt.kind === "precheck_denied") return writeWithRandomId();
    // taken — try next.
  }
  // All numeric-suffix slugs taken → last-resort random suffix.
  return writeWithRandomId();
}

export async function getShop(shopId: string): Promise<Shop | null> {
  if (Platform.OS !== "web") {
    try {
      const data = await nativeGetDocData<Omit<Shop, "id">>(["shops", shopId]);
      return data ? { id: shopId, ...data } : null;
    } catch {
      return null;
    }
  }
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
