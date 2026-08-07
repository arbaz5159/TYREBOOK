// Firestore CRUD for Purchases — collection: purchases
// On create, automatically increments the matching tyre stock.

import {
  addDoc,

  deleteDoc,

  getDocs,
  serverTimestamp,
} from "firebase/firestore";

import { storage } from "@/src/utils/storage";

import { getDb } from "./config";
import { incrementTyreStock } from "./inventory";
import { stripUndefined } from "./util";
import { tenantCol, tenantDoc } from "./tenant";
import type { Purchase } from "@/src/constants/inventory";
import { localId } from "@/src/utils/localId";

const COLLECTION = "purchases";
const LOCAL_KEY = "tyrebook.purchases";

async function readLocal(): Promise<Purchase[]> {
  const raw = await storage.getItem<string | null>(LOCAL_KEY, null);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Purchase[];
  } catch {
    return [];
  }
}

async function writeLocal(list: Purchase[]): Promise<void> {
  await storage.setItem(LOCAL_KEY, JSON.stringify(list));
}

export async function listPurchases(): Promise<Purchase[]> {
  const db = getDb();
  if (!db) {
    const list = await readLocal();
    return list.sort((a, b) => b.date - a.date);
  }
  const snap = await getDocs(tenantCol(db, COLLECTION));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Purchase, "id">) }))
    .sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
}

export async function createPurchase(
  data: Omit<Purchase, "id" | "totalValue" | "linkedTyreId">,
): Promise<string> {
  const subtotal = data.quantity * data.purchasePrice;
  const totalValue = +(subtotal + (subtotal * data.gstPercent) / 100).toFixed(2);

  // 1. Update stock first so failure surfaces to user.
  const linkedTyreId = await incrementTyreStock({
    categoryId: data.categoryId,
    brand: data.brand,
    model: data.model,
    size: data.size,
    qty: data.quantity,
    purchasePrice: data.purchasePrice,
  });

  const payload: Omit<Purchase, "id"> = {
    ...data,
    totalValue,
    linkedTyreId,
    createdAt: Date.now(),
  };

  const db = getDb();
  if (!db) {
    const list = await readLocal();
    const id = localId();
    list.push({ ...payload, id });
    await writeLocal(list);
    return id;
  }
  const ref = await addDoc(tenantCol(db, COLLECTION), stripUndefined({
    ...payload,
    createdAt: serverTimestamp(),
  }));
  return ref.id;
}

export async function deletePurchase(id: string): Promise<void> {
  const db = getDb();
  if (!db) {
    const list = await readLocal();
    await writeLocal(list.filter((p) => p.id !== id));
    return;
  }
  await deleteDoc(tenantDoc(db, COLLECTION, id));
}
