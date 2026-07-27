// Firestore CRUD for Tyres — collection: tyres
// Falls back to AsyncStorage-backed local store when Firebase config is missing.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { storage } from "@/src/utils/storage";

import { getDb } from "./config";
import type { Tyre, VehicleCategoryId } from "@/src/constants/inventory";

const COLLECTION = "tyres";
const LOCAL_KEY = "tyrebook.tyres";

async function readLocal(): Promise<Tyre[]> {
  const raw = await storage.getItem<string | null>(LOCAL_KEY, null);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Tyre[];
  } catch {
    return [];
  }
}

async function writeLocal(list: Tyre[]): Promise<void> {
  await storage.setItem(LOCAL_KEY, JSON.stringify(list));
}

export async function listTyres(
  categoryId?: VehicleCategoryId,
): Promise<Tyre[]> {
  const db = getDb();
  if (!db) {
    const list = await readLocal();
    return categoryId ? list.filter((t) => t.categoryId === categoryId) : list;
  }
  const col = collection(db, COLLECTION);
  const q = categoryId
    ? query(col, where("categoryId", "==", categoryId), orderBy("brand"))
    : query(col, orderBy("brand"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Tyre, "id">) }));
}

export async function getTyre(id: string): Promise<Tyre | null> {
  const db = getDb();
  if (!db) {
    const list = await readLocal();
    return list.find((t) => t.id === id) ?? null;
  }
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Tyre, "id">) };
}

export async function createTyre(data: Omit<Tyre, "id">): Promise<string> {
  const now = Date.now();
  const db = getDb();
  if (!db) {
    const list = await readLocal();
    const id = `local-${now}`;
    list.push({ ...data, id, createdAt: now, updatedAt: now });
    await writeLocal(list);
    return id;
  }
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTyre(
  id: string,
  data: Partial<Omit<Tyre, "id">>,
): Promise<void> {
  const db = getDb();
  if (!db) {
    const list = await readLocal();
    const idx = list.findIndex((t) => t.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...data, updatedAt: Date.now() };
      await writeLocal(list);
    }
    return;
  }
  await updateDoc(doc(db, COLLECTION, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTyre(id: string): Promise<void> {
  const db = getDb();
  if (!db) {
    const list = await readLocal();
    await writeLocal(list.filter((t) => t.id !== id));
    return;
  }
  await deleteDoc(doc(db, COLLECTION, id));
}

// Increment stock by qty; called by Purchase module. If matching tyre by
// (categoryId, brand, model, size) doesn't exist yet we create a minimal one.
export async function incrementTyreStock(params: {
  categoryId: VehicleCategoryId;
  brand: string;
  model: string;
  size: string;
  qty: number;
  purchasePrice: number;
}): Promise<string> {
  const existing = (await listTyres(params.categoryId)).find(
    (t) =>
      t.brand.toLowerCase() === params.brand.toLowerCase() &&
      t.model.toLowerCase() === params.model.toLowerCase() &&
      t.size.toLowerCase() === params.size.toLowerCase(),
  );
  if (existing) {
    await updateTyre(existing.id, {
      currentStock: (existing.currentStock ?? 0) + params.qty,
      purchasePrice: params.purchasePrice || existing.purchasePrice,
    });
    return existing.id;
  }
  const id = await createTyre({
    categoryId: params.categoryId,
    brand: params.brand,
    model: params.model,
    size: params.size,
    tubeType: "Tubeless",
    construction: "Radial",
    plyRating: "-",
    purchasePrice: params.purchasePrice,
    sellingPrice: 0,
    currentStock: params.qty,
    rackNumber: "-",
  });
  return id;
}
