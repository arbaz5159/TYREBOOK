// Generic master-data CRUD for owner-managed lists:
//   brands, tyreModels, tyreSizes, vehicleCategories, suppliers
//
// Every collection stores documents shaped as { id, name, meta? }.
// Staff role can read; only Owner can mutate — enforced in the UI screens.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { storage } from "@/src/utils/storage";

import { getDb } from "./config";

export type MasterCollection =
  | "brands"
  | "tyreModels"
  | "tyreSizes"
  | "vehicleCategories"
  | "suppliers";

export interface MasterItem {
  id: string;
  name: string;
  meta?: Record<string, string>;
  createdAt?: number;
  updatedAt?: number;
}

const LOCAL_KEY = (c: MasterCollection) => `tyrebook.master.${c}`;

async function readLocal(c: MasterCollection): Promise<MasterItem[]> {
  const raw = await storage.getItem<string | null>(LOCAL_KEY(c), null);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as MasterItem[];
  } catch {
    return [];
  }
}
async function writeLocal(c: MasterCollection, list: MasterItem[]): Promise<void> {
  await storage.setItem(LOCAL_KEY(c), JSON.stringify(list));
}

export async function listMaster(c: MasterCollection): Promise<MasterItem[]> {
  const db = getDb();
  if (!db) {
    const list = await readLocal(c);
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }
  const snap = await getDocs(query(collection(db, c), orderBy("name")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MasterItem, "id">) }));
}

export async function createMaster(
  c: MasterCollection,
  data: Omit<MasterItem, "id">,
): Promise<string> {
  const now = Date.now();
  const db = getDb();
  if (!db) {
    const list = await readLocal(c);
    const id = `local-${now}`;
    list.push({ ...data, id, createdAt: now, updatedAt: now });
    await writeLocal(c, list);
    return id;
  }
  const ref = await addDoc(collection(db, c), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateMaster(
  c: MasterCollection,
  id: string,
  data: Partial<Omit<MasterItem, "id">>,
): Promise<void> {
  const db = getDb();
  if (!db) {
    const list = await readLocal(c);
    const idx = list.findIndex((x) => x.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...data, updatedAt: Date.now() };
      await writeLocal(c, list);
    }
    return;
  }
  await updateDoc(doc(db, c, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteMaster(c: MasterCollection, id: string): Promise<void> {
  const db = getDb();
  if (!db) {
    const list = await readLocal(c);
    await writeLocal(c, list.filter((x) => x.id !== id));
    return;
  }
  await deleteDoc(doc(db, c, id));
}

// -------- Shop / GST / Invoice settings (single doc: settings/shop) --------

export interface ShopSettings {
  shopName: string;
  ownerName: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  panNumber: string;
  invoicePrefix: string;
  nextInvoiceNumber: string;
  invoiceFooter: string;
  updatedAt?: number;
}

const SHOP_KEY = "tyrebook.shopSettings";
const DEFAULT_SHOP: ShopSettings = {
  shopName: "",
  ownerName: "",
  address: "",
  phone: "",
  email: "",
  gstin: "",
  panNumber: "",
  invoicePrefix: "TB",
  nextInvoiceNumber: "0001",
  invoiceFooter: "Thank you for your business!",
};

export async function getShopSettings(): Promise<ShopSettings> {
  const db = getDb();
  if (!db) {
    const raw = await storage.getItem<string | null>(SHOP_KEY, null);
    if (!raw) return DEFAULT_SHOP;
    try {
      return { ...DEFAULT_SHOP, ...(JSON.parse(raw) as ShopSettings) };
    } catch {
      return DEFAULT_SHOP;
    }
  }
  const snap = await getDocs(collection(db, "settings"));
  const shop = snap.docs.find((d) => d.id === "shop");
  if (!shop) return DEFAULT_SHOP;
  return { ...DEFAULT_SHOP, ...(shop.data() as ShopSettings) };
}

export async function saveShopSettings(data: ShopSettings): Promise<void> {
  const db = getDb();
  if (!db) {
    await storage.setItem(SHOP_KEY, JSON.stringify({ ...data, updatedAt: Date.now() }));
    return;
  }
  const { setDoc } = await import("firebase/firestore");
  await setDoc(
    doc(db, "settings", "shop"),
    { ...data, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

// -------- Backup / Restore (JSON dump of all local + Firestore data) --------

export async function exportBackup(): Promise<string> {
  const [brands, tyreModels, tyreSizes, vehicleCategories, suppliers] = await Promise.all([
    listMaster("brands"),
    listMaster("tyreModels"),
    listMaster("tyreSizes"),
    listMaster("vehicleCategories"),
    listMaster("suppliers"),
  ]);
  const shop = await getShopSettings();
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    shop,
    master: { brands, tyreModels, tyreSizes, vehicleCategories, suppliers },
  };
  return JSON.stringify(backup, null, 2);
}

export async function importBackup(json: string): Promise<void> {
  const data = JSON.parse(json);
  if (data.shop) await saveShopSettings(data.shop);
  if (data.master) {
    for (const key of Object.keys(data.master) as MasterCollection[]) {
      const list: MasterItem[] = data.master[key] ?? [];
      // Overwrite local dump. For Firestore we append (safer).
      const db = getDb();
      if (!db) {
        await writeLocal(key, list);
      } else {
        for (const item of list) {
          const { id: _drop, ...rest } = item;
          void _drop;
          await createMaster(key, rest);
        }
      }
    }
  }
}
