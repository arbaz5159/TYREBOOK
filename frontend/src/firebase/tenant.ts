// Active-shop context for the multi-tenant data layer.
//
// The Firestore layout is:
//   shops/{shopId}/tyres/{id}
//   shops/{shopId}/sales/{id}
//   shops/{shopId}/customers/{id}
//   shops/{shopId}/purchases/{id}
//   shops/{shopId}/khata/{id}
//   shops/{shopId}/stock_movements/{id}
//   shops/{shopId}/vehicles/{id}
//   shops/{shopId}/brands/{id}         (master data)
//   shops/{shopId}/tyreModels/{id}
//   shops/{shopId}/tyreSizes/{id}
//   shops/{shopId}/vehicleCategories/{id}
//   shops/{shopId}/suppliers/{id}
//   shops/{shopId}/settings/shop
//   shops/{shopId}/members/{uid}       (staff roster mirror)
//   users/{uid}                        (global user profile — auth mirror)
//   shopInvites/{emailKey}             (global pending staff invites)
//   shops/{shopId}                     (shop root doc — subscription status, name, ...)
//
// The active shopId is set by AuthContext once the user is loaded:
//   - shop_admin / staff  → their `users/{uid}.shopId`
//   - super_admin         → null by default; can pick any shop via the
//                           Super Admin panel (setActiveShopId).
//
// All firebase/*.ts helpers pull the current shopId from this module via
// tenantCol()/tenantDoc(). Every write / read is therefore isolated to a
// single tenant by construction — no `where("shopId","==",...)` filters
// needed, and Firestore security rules can enforce the boundary as well.

import {
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";

const WEB_STORAGE_KEY = "tyrebook.tenant.activeShopId";

/**
 * Synchronous hydration from web `localStorage` — this lets tenant-scoped
 * reads succeed on the first render after a hard-reload, before
 * AuthContext has re-run `onAuthStateChanged`. On native this is a no-op
 * (native uses AsyncStorage via the auth flow instead).
 */
function readWebInitial(): string | null {
  try {
    if (typeof globalThis !== "undefined" && (globalThis as any).localStorage) {
      const v = (globalThis as any).localStorage.getItem(WEB_STORAGE_KEY);
      return typeof v === "string" && v.length > 0 ? v : null;
    }
  } catch {
    /* SSR / private mode / access denied */
  }
  return null;
}

function writeWebPersist(id: string | null): void {
  try {
    if (typeof globalThis !== "undefined" && (globalThis as any).localStorage) {
      if (id) (globalThis as any).localStorage.setItem(WEB_STORAGE_KEY, id);
      else (globalThis as any).localStorage.removeItem(WEB_STORAGE_KEY);
    }
  } catch {
    /* no-op */
  }
}

let activeShopId: string | null = readWebInitial();
const listeners = new Set<(id: string | null) => void>();

export function setActiveShopId(id: string | null): void {
  if (activeShopId === id) return;
  activeShopId = id;
  writeWebPersist(id);
  listeners.forEach((l) => {
    try {
      l(id);
    } catch {
      // isolated listener error must not break the setter
    }
  });
}

export function getActiveShopId(): string | null {
  return activeShopId;
}

export function subscribeActiveShopId(cb: (id: string | null) => void): () => void {
  listeners.add(cb);
  cb(activeShopId);
  return () => {
    listeners.delete(cb);
  };
}

// React hook: re-renders whenever the active shop id changes. Used by the
// tabs layout + Dashboard banner so a Super Admin who taps "Enter this
// shop" is admitted into the tabs the moment activeShopId is set (their
// `users/{uid}.shopId` remains null by design — the env allow-list is the
// only source of super_admin truth).
export function useActiveShopId(): string | null {
  // Imported lazily inside the function so this module keeps working
  // when consumed from a non-React context (unit tests, node scripts).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useEffect, useState } = require("react") as typeof import("react");
  const [id, setId] = useState<string | null>(activeShopId);
  useEffect(() => subscribeActiveShopId(setId), []);
  return id;
}

/** Throws if no active shop is set — call sites should only invoke tenant
 *  helpers after the auth flow has resolved (or a super_admin picked a shop). */
function requireShopId(): string {
  if (!activeShopId) {
    throw new Error(
      "No active shop selected. Sign in as a Shop Admin or Staff, or pick a shop from the Super Admin panel.",
    );
  }
  return activeShopId;
}

export function tenantCol(db: Firestore, ...path: string[]): CollectionReference {
  const shopId = requireShopId();
  return collection(db, "shops", shopId, ...path);
}

export function tenantDoc(db: Firestore, ...path: string[]): DocumentReference {
  const shopId = requireShopId();
  return doc(db, "shops", shopId, ...path);
}

/** Return a raw path segment for the current shop — useful for building
 *  cross-shop queries only inside super-admin flows. */
export function tenantPath(...suffix: string[]): string[] {
  return ["shops", requireShopId(), ...suffix];
}
