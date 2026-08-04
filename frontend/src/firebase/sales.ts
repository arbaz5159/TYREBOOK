// Firestore CRUD for Sales — collection: sales
// On create: automatically decrements matching tyre stock and upserts a
// Customer record (keyed by mobile number) so we keep purchase history.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import { storage } from "@/src/utils/storage";

import { getDb } from "./config";
import { listTyres, updateTyre } from "./inventory";
import { stripUndefined } from "./util";
import type { Customer, Sale } from "@/src/constants/inventory";
import { localId } from "@/src/utils/localId";

const SALES = "sales";
const CUSTOMERS = "customers";
const SALES_KEY = "tyrebook.sales";
const CUSTOMERS_KEY = "tyrebook.customers";

async function readLocalSales(): Promise<Sale[]> {
  const raw = await storage.getItem<string | null>(SALES_KEY, null);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Sale[];
  } catch {
    return [];
  }
}
async function writeLocalSales(list: Sale[]): Promise<void> {
  await storage.setItem(SALES_KEY, JSON.stringify(list));
}

async function readLocalCustomers(): Promise<Customer[]> {
  const raw = await storage.getItem<string | null>(CUSTOMERS_KEY, null);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Customer[];
  } catch {
    return [];
  }
}
async function writeLocalCustomers(list: Customer[]): Promise<void> {
  await storage.setItem(CUSTOMERS_KEY, JSON.stringify(list));
}

export async function listSales(): Promise<Sale[]> {
  const db = getDb();
  if (!db) {
    const list = await readLocalSales();
    return list.sort((a, b) => b.date - a.date);
  }
  // Fetch un-ordered and sort in JS to avoid any composite-index requirement
  // and to survive documents missing the `date` field.
  const snap = await getDocs(collection(db, SALES));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Sale, "id">) }))
    .sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
}

export async function listSalesForCustomer(mobileNumber: string): Promise<Sale[]> {
  const db = getDb();
  if (!db) {
    const list = await readLocalSales();
    return list
      .filter((s) => s.mobileNumber === mobileNumber)
      .sort((a, b) => b.date - a.date);
  }
  const snap = await getDocs(
    query(collection(db, SALES), where("mobileNumber", "==", mobileNumber)),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Sale, "id">) }))
    .sort((a, b) => b.date - a.date);
}

export async function listCustomers(): Promise<Customer[]> {
  const db = getDb();
  if (!db) {
    const list = await readLocalCustomers();
    return list.sort((a, b) => b.lastPurchaseAt - a.lastPurchaseAt);
  }
  // Same rationale as listSales — fetch all, sort locally.
  const snap = await getDocs(collection(db, CUSTOMERS));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Customer, "id">) }))
    .sort((a, b) => (b.lastPurchaseAt ?? 0) - (a.lastPurchaseAt ?? 0));
}

async function upsertCustomer(sale: Omit<Sale, "id">): Promise<void> {
  const db = getDb();
  const id = sale.mobileNumber.trim();
  if (!id) return;

  const discountThisSale = (Number(sale.discountAmount) || 0) * (Number(sale.quantity) || 0);

  if (!db) {
    const list = await readLocalCustomers();
    const existing = list.find((c) => c.id === id);
    if (existing) {
      existing.name = sale.customerName || existing.name;
      if (sale.vehicleNumber && !existing.vehicleNumbers.includes(sale.vehicleNumber)) {
        existing.vehicleNumbers.push(sale.vehicleNumber);
      }
      existing.customerType = sale.customerType ?? existing.customerType ?? "Retail";
      existing.totalSpent = +(existing.totalSpent + sale.totalValue).toFixed(2);
      existing.totalDiscountGiven = +(((existing.totalDiscountGiven ?? 0) + discountThisSale)).toFixed(2);
      existing.saleCount += 1;
      existing.lastPurchaseAt = sale.date;
    } else {
      list.push({
        id,
        name: sale.customerName,
        mobileNumber: id,
        vehicleNumbers: sale.vehicleNumber ? [sale.vehicleNumber] : [],
        customerType: sale.customerType ?? "Retail",
        defaultDiscount: 0,
        totalSpent: sale.totalValue,
        totalDiscountGiven: discountThisSale,
        saleCount: 1,
        lastPurchaseAt: sale.date,
        createdAt: Date.now(),
      });
    }
    await writeLocalCustomers(list);
    return;
  }

  const ref = doc(db, CUSTOMERS, id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const cur = snap.data() as Customer;
    const vehicles = new Set(cur.vehicleNumbers ?? []);
    if (sale.vehicleNumber) vehicles.add(sale.vehicleNumber);
    await setDoc(
      ref,
      stripUndefined({
        name: sale.customerName || cur.name,
        mobileNumber: id,
        vehicleNumbers: Array.from(vehicles),
        customerType: sale.customerType ?? cur.customerType ?? "Retail",
        defaultDiscount: cur.defaultDiscount ?? 0,
        totalSpent: +((cur.totalSpent ?? 0) + sale.totalValue).toFixed(2),
        totalDiscountGiven: +(((cur.totalDiscountGiven ?? 0) + discountThisSale)).toFixed(2),
        saleCount: (cur.saleCount ?? 0) + 1,
        lastPurchaseAt: sale.date,
      }),
      { merge: true },
    );
  } else {
    await setDoc(ref, stripUndefined({
      name: sale.customerName,
      mobileNumber: id,
      vehicleNumbers: sale.vehicleNumber ? [sale.vehicleNumber] : [],
      customerType: sale.customerType ?? "Retail",
      defaultDiscount: 0,
      totalSpent: sale.totalValue,
      totalDiscountGiven: discountThisSale,
      saleCount: 1,
      lastPurchaseAt: sale.date,
      createdAt: serverTimestamp(),
    }));
  }
}

export async function createSale(
  data: Omit<Sale, "id" | "totalValue" | "linkedTyreId">,
): Promise<{ id: string; warning?: string }> {
  const subtotal = data.quantity * data.sellingPrice;
  const totalValue = +(subtotal + (subtotal * data.gstPercent) / 100).toFixed(2);

  // Locate the matching tyre and decrement.
  const tyres = await listTyres(data.categoryId);
  const tyre = tyres.find(
    (t) =>
      t.brand.toLowerCase() === data.brand.toLowerCase() &&
      t.model.toLowerCase() === data.model.toLowerCase() &&
      t.size.toLowerCase() === data.size.toLowerCase(),
  );

  let linkedTyreId: string | undefined;
  let warning: string | undefined;
  if (tyre) {
    const newStock = (tyre.currentStock ?? 0) - data.quantity;
    if (newStock < 0) warning = `Selling ${data.quantity} but only ${tyre.currentStock} in stock.`;
    await updateTyre(tyre.id, { currentStock: Math.max(0, newStock) });
    linkedTyreId = tyre.id;
  } else {
    warning = "Matching tyre not found in inventory. Stock was NOT reduced.";
  }

  const payload: Omit<Sale, "id"> = {
    ...data,
    totalValue,
    linkedTyreId,
    createdAt: Date.now(),
  };

  await upsertCustomer(payload);

  const db = getDb();
  if (!db) {
    const list = await readLocalSales();
    const id = localId();
    list.push({ ...payload, id });
    await writeLocalSales(list);
    return { id, warning };
  }
  const ref = await addDoc(collection(db, SALES), stripUndefined({
    ...payload,
    createdAt: serverTimestamp(),
  }));
  return { id: ref.id, warning };
}

export async function deleteSale(id: string): Promise<void> {
  const db = getDb();
  if (!db) {
    const list = await readLocalSales();
    await writeLocalSales(list.filter((s) => s.id !== id));
    return;
  }
  await deleteDoc(doc(db, SALES, id));
}
