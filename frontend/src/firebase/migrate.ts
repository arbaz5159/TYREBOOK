// One-time legacy data migration.
//
// Prior to the multi-tenant refactor, TyreBook stored data at top-level
// Firestore collections (`tyres`, `sales`, `customers`, `purchases`,
// `khata`, `stock_movements`, `vehicles`, `settings/shop`, plus the
// `brands` / `tyreModels` / `tyreSizes` / `vehicleCategories` / `suppliers`
// master collections and legacy `users/{uid}` docs with role="owner").
//
// The multi-tenant refactor moves ALL that data under
// `shops/shop_default/*` so a single, existing, single-shop deployment
// keeps working without any manual copy.
//
// This module is idempotent — it can be called any number of times. It
// only migrates a collection when the destination path is empty, so
// re-running never duplicates rows.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "./fsSdk";

import { getDb } from "./config";
import { stripUndefined } from "./util";
import { TRIAL_DURATION_DAYS } from "./shops";

export const LEGACY_SHOP_ID = "shop_default";

const LEGACY_COLLECTIONS = [
  "tyres",
  "sales",
  "customers",
  "purchases",
  "khata",
  "stock_movements",
  "vehicles",
  "brands",
  "tyreModels",
  "tyreSizes",
  "vehicleCategories",
  "suppliers",
] as const;

interface MigrateReport {
  ranAt: number;
  shopId: string;
  createdShop: boolean;
  copied: Record<string, number>;
  legacyUsersLinked: number;
  settingsMigrated: boolean;
  skipped: string[];
}

/**
 * Ensure `shops/shop_default` exists with a permanent 'active' status.
 * Returns true if the doc was just created, false if it already existed.
 */
async function ensureDefaultShop(actorUid: string, actorEmail: string): Promise<boolean> {
  const db = getDb();
  if (!db) throw new Error("Firestore not configured.");
  const ref = doc(db, "shops", LEGACY_SHOP_ID);
  const snap = await getDoc(ref);
  if (snap.exists()) return false;
  const now = Date.now();
  await setDoc(
    ref,
    stripUndefined({
      id: LEGACY_SHOP_ID,
      name: "Default Shop (Legacy)",
      ownerUid: actorUid,
      ownerEmail: (actorEmail || "").toLowerCase() || undefined,
      status: "active",
      // Give the legacy shop a long runway so its users are never locked
      // out. Super Admin can shorten/extend later.
      planExpiresAt: now + 365 * 24 * 60 * 60 * 1000,
      trialEndsAt: now + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isLegacyMigrationTarget: true,
    }),
  );
  return true;
}

/** Copy every doc in a top-level collection into shops/{shopId}/collection.
 *  Skips the copy when the destination is already non-empty. */
async function copyCollection(
  shopId: string,
  name: string,
): Promise<{ copied: number; skipped: boolean }> {
  const db = getDb();
  if (!db) return { copied: 0, skipped: true };

  const destCol = collection(db, "shops", shopId, name);
  const destSnap = await getDocs(destCol);
  if (!destSnap.empty) return { copied: 0, skipped: true };

  const srcSnap = await getDocs(collection(db, name));
  if (srcSnap.empty) return { copied: 0, skipped: true };

  // Chunk into batches of 400 (Firestore max 500 writes/batch).
  let copied = 0;
  let batch = writeBatch(db);
  let ops = 0;
  for (const d of srcSnap.docs) {
    batch.set(doc(destCol, d.id), stripUndefined(d.data() as Record<string, any>));
    ops++;
    copied++;
    if (ops >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return { copied, skipped: false };
}

/** Migrate the legacy `settings/shop` doc → `shops/{shopId}/settings/shop`. */
async function copySettings(shopId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const dest = doc(db, "shops", shopId, "settings", "shop");
  const destSnap = await getDoc(dest);
  if (destSnap.exists()) return false;
  const src = await getDoc(doc(db, "settings", "shop"));
  if (!src.exists()) return false;
  await setDoc(dest, stripUndefined(src.data() as Record<string, any>));
  return true;
}

/**
 * Legacy user accounts had `role: "owner" | "staff"` and no `shopId`.
 * Upgrade them: owner → shop_admin of shop_default, staff → staff of
 * shop_default. Also mirror into `shops/{shopId}/members/{uid}`.
 */
async function linkLegacyUsers(shopId: string): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const snap = await getDocs(collection(db, "users"));
  let touched = 0;
  for (const d of snap.docs) {
    const data = d.data() as any;
    // Only touch legacy shape — do not clobber already-migrated users.
    const hasShopId = typeof data.shopId === "string" && data.shopId.length > 0;
    const legacyRole = data.role === "owner" || data.role === "staff";
    if (hasShopId || !legacyRole) continue;

    const newRole = data.role === "owner" ? "shop_admin" : "staff";
    await setDoc(
      doc(db, "users", d.id),
      stripUndefined({
        shopId,
        role: newRole,
        migratedAt: serverTimestamp(),
      }),
      { merge: true },
    );
    await setDoc(
      doc(db, "shops", shopId, "members", d.id),
      stripUndefined({
        uid: d.id,
        email: data.email ?? null,
        name: data.name ?? data.displayName ?? null,
        role: newRole,
        active: data.active !== false,
        createdAt: data.createdAt ?? serverTimestamp(),
        migratedAt: serverTimestamp(),
      }),
      { merge: true },
    );
    touched++;
  }
  return touched;
}

/**
 * Main entry point. Safe to call on every login; performs no work when
 * nothing needs migrating.
 */
export async function runLegacyMigration(actor: {
  uid: string;
  email: string | null;
}): Promise<MigrateReport> {
  const report: MigrateReport = {
    ranAt: Date.now(),
    shopId: LEGACY_SHOP_ID,
    createdShop: false,
    copied: {},
    legacyUsersLinked: 0,
    settingsMigrated: false,
    skipped: [],
  };
  const db = getDb();
  if (!db) {
    report.skipped.push("firestore-not-configured");
    return report;
  }

  // 1. Ensure shops/shop_default exists.
  report.createdShop = await ensureDefaultShop(actor.uid, actor.email ?? "");

  // 2. Move top-level collections under it.
  for (const name of LEGACY_COLLECTIONS) {
    try {
      const { copied, skipped } = await copyCollection(LEGACY_SHOP_ID, name);
      report.copied[name] = copied;
      if (skipped) report.skipped.push(`${name}:skipped`);
    } catch (e) {
      report.skipped.push(`${name}:error:${(e as Error).message ?? "unknown"}`);
    }
  }

  // 3. Move settings/shop.
  try {
    report.settingsMigrated = await copySettings(LEGACY_SHOP_ID);
  } catch (e) {
    report.skipped.push(`settings:error:${(e as Error).message ?? "unknown"}`);
  }

  // 4. Upgrade legacy user docs to multi-tenant shape.
  try {
    report.legacyUsersLinked = await linkLegacyUsers(LEGACY_SHOP_ID);
  } catch (e) {
    report.skipped.push(`users:error:${(e as Error).message ?? "unknown"}`);
  }

  return report;
}
