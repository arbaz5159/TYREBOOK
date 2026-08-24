// Stock movement log — every Maal Aaya (in) / Maal Gaya (out) writes a row here.
// Records are append-only; the actual `currentStock` on the Tyre doc is the
// source of truth (updated in the same call for correctness).

import {
  addDoc,

  getDocs,
  query,
  serverTimestamp,
  where,
} from "./fsSdk";

import { storage } from "@/src/utils/storage";

import { getDb } from "./config";
import { getTyre, updateTyre } from "./inventory";
import { stripUndefined } from "./util";
import { tenantCol } from "./tenant";
import { localId } from "@/src/utils/localId";

export type MovementDirection = "in" | "out";

export interface StockMovement {
  id: string;
  tyreId: string;
  direction: MovementDirection;
  quantity: number;
  reason: string;
  reference: string; // supplier / customer / invoice #
  note: string;
  balanceAfter: number;
  createdAt: number;
}

const COLLECTION = "stock_movements";
const LOCAL_KEY = "tyrebook.stockMovements";

async function readLocal(): Promise<StockMovement[]> {
  const raw = await storage.getItem<string | null>(LOCAL_KEY, null);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as StockMovement[];
  } catch {
    return [];
  }
}
async function writeLocal(list: StockMovement[]): Promise<void> {
  await storage.setItem(LOCAL_KEY, JSON.stringify(list));
}

export async function listMovements(tyreId?: string): Promise<StockMovement[]> {
  const db = getDb();
  if (!db) {
    const list = await readLocal();
    const filtered = tyreId ? list.filter((m) => m.tyreId === tyreId) : list;
    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }
  const q = tyreId
    ? query(tenantCol(db, COLLECTION), where("tyreId", "==", tyreId))
    : query(tenantCol(db, COLLECTION));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<StockMovement, "id">) }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function recordMovement(input: {
  tyreId: string;
  direction: MovementDirection;
  quantity: number;
  reason?: string;
  reference?: string;
  note?: string;
}): Promise<{ id: string; balanceAfter: number }> {
  const tyre = await getTyre(input.tyreId);
  if (!tyre) throw new Error("Tyre not found");

  const delta = input.direction === "in" ? input.quantity : -input.quantity;
  const newStock = Math.max(0, (tyre.currentStock ?? 0) + delta);
  await updateTyre(input.tyreId, { currentStock: newStock });

  const now = Date.now();
  const payload: Omit<StockMovement, "id"> = {
    tyreId: input.tyreId,
    direction: input.direction,
    quantity: input.quantity,
    reason: input.reason ?? (input.direction === "in" ? "Maal Aaya" : "Maal Gaya"),
    reference: input.reference ?? "",
    note: input.note ?? "",
    balanceAfter: newStock,
    createdAt: now,
  };

  const db = getDb();
  if (!db) {
    const list = await readLocal();
    const id = localId();
    list.push({ ...payload, id });
    await writeLocal(list);
    return { id, balanceAfter: newStock };
  }
  const ref = await addDoc(tenantCol(db, COLLECTION), stripUndefined({
    ...payload,
    createdAt: serverTimestamp(),
  }));
  return { id: ref.id, balanceAfter: newStock };
}
