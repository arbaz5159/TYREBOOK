// KhataBook ledger — one document per (customerMobile).
// Records credit given (owe) and payment received. Running balance is the sum.
// When a Sale with paymentMode="Credit" is created, we should also write an
// entry here for consistency. That link is added when the user opens the ledger.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { storage } from "@/src/utils/storage";

import { getDb } from "./config";
import { stripUndefined } from "./util";
import { localId } from "@/src/utils/localId";

export type KhataDirection = "credit" | "payment"; // credit = shop gave, payment = customer paid

export interface KhataEntry {
  id: string;
  customerId: string; // mobile number
  customerName: string;
  direction: KhataDirection;
  amount: number;
  note: string;
  reference: string; // invoice # if linked
  date: number;
  createdAt: number;
}

const COLLECTION = "khata";
const LOCAL_KEY = "tyrebook.khata";

async function readLocal(): Promise<KhataEntry[]> {
  const raw = await storage.getItem<string | null>(LOCAL_KEY, null);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as KhataEntry[];
  } catch {
    return [];
  }
}
async function writeLocal(list: KhataEntry[]): Promise<void> {
  await storage.setItem(LOCAL_KEY, JSON.stringify(list));
}

export async function listKhata(customerId?: string): Promise<KhataEntry[]> {
  const db = getDb();
  if (!db) {
    const list = await readLocal();
    return list
      .filter((e) => !customerId || e.customerId === customerId)
      .sort((a, b) => b.date - a.date);
  }
  const col = collection(db, COLLECTION);
  // Fetch un-ordered and sort locally so a fresh collection doesn't need any
  // composite index.
  const q = customerId
    ? query(col, where("customerId", "==", customerId))
    : query(col);
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<KhataEntry, "id">) }))
    .sort((a, b) => b.date - a.date);
}

export async function addKhataEntry(data: Omit<KhataEntry, "id" | "createdAt">): Promise<string> {
  const now = Date.now();
  const db = getDb();
  if (!db) {
    const list = await readLocal();
    const id = localId();
    list.push({ ...data, id, createdAt: now });
    await writeLocal(list);
    return id;
  }
  const ref = await addDoc(collection(db, COLLECTION), stripUndefined({
    ...data,
    createdAt: serverTimestamp(),
  }));
  return ref.id;
}

export async function deleteKhataEntry(id: string): Promise<void> {
  const db = getDb();
  if (!db) {
    const list = await readLocal();
    await writeLocal(list.filter((x) => x.id !== id));
    return;
  }
  await deleteDoc(doc(db, COLLECTION, id));
}

export function balanceOf(entries: KhataEntry[]): number {
  // Positive = customer owes the shop
  return entries.reduce(
    (s, e) => s + (e.direction === "credit" ? e.amount : -e.amount),
    0,
  );
}
