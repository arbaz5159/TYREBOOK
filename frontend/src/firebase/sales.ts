// Firestore CRUD for Sales — collection: sales
// On create: automatically decrements matching tyre stock and upserts a
// Customer record (keyed by mobile number) so we keep purchase history.

import {
  addDoc,

  deleteDoc,
  doc,

  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from "./fsSdk";

import { storage } from "@/src/utils/storage";

import { getDb } from "./config";
import { listTyres, updateTyre } from "./inventory";
import { stripUndefined } from "./util";
import { tenantCol, tenantDoc } from "./tenant";
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
  const snap = await getDocs(tenantCol(db, SALES));
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
    query(tenantCol(db, SALES), where("mobileNumber", "==", mobileNumber)),
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
  const snap = await getDocs(tenantCol(db, CUSTOMERS));
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

  const ref = tenantDoc(db, CUSTOMERS, id);
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

  // Locate the matching tyre BEFORE the transaction so we know which
  // tyre doc to include in the read set. Firestore client SDK
  // transactions do not support queries — only single-doc reads — so
  // this look-up-by-attributes step happens outside. The authoritative
  // stock number is re-read inside the transaction against tyreRef and
  // that is what drives the decrement.
  const tyres = await listTyres(data.categoryId);
  const tyre = tyres.find(
    (t) =>
      t.brand.toLowerCase() === data.brand.toLowerCase() &&
      t.model.toLowerCase() === data.model.toLowerCase() &&
      t.size.toLowerCase() === data.size.toLowerCase(),
  );

  const linkedTyreId: string | undefined = tyre?.id;

  const payload: Omit<Sale, "id"> = {
    ...data,
    totalValue,
    linkedTyreId,
    createdAt: Date.now(),
  };

  // Customer upsert stays outside the transaction — customer state is
  // an aggregate cache; it is safe to eventually-consistent-update and
  // is not part of the stock-safety invariant the user asked us to
  // protect.
  await upsertCustomer(payload);

  const db = getDb();
  if (!db) {
    // Local (Firebase-not-configured) fallback keeps the original
    // sequential behaviour. Single JS runtime → no concurrency issue.
    let warning: string | undefined;
    if (tyre) {
      const newStock = (tyre.currentStock ?? 0) - data.quantity;
      if (newStock < 0) warning = `Selling ${data.quantity} but only ${tyre.currentStock} in stock.`;
      await updateTyre(tyre.id, { currentStock: Math.max(0, newStock) });
    } else {
      warning = "Matching tyre not found in inventory. Stock was NOT reduced.";
    }
    const list = await readLocalSales();
    const id = localId();
    list.push({ ...payload, id });
    await writeLocalSales(list);
    return { id, warning };
  }

  // TRANSACTIONAL SAFETY (production-critical):
  //   Two sales tapping "Save" for the same tyre at the same moment MUST
  //   NOT be able to both decrement from the same pre-race stock reading.
  //   We wrap the tyre-stock read/decrement AND the sale-doc write in a
  //   single Firestore runTransaction. If two clients race, exactly one
  //   commits first; the loser's transaction body is automatically re-run
  //   against the newer stock value and decrements from THAT.
  //
  //   Overshoot policy is preserved: if the resulting stock would go
  //   negative, we clamp to 0 and return a `warning` — same behaviour as
  //   the previous non-transactional implementation, so business logic
  //   is unchanged.
  const saleRef = doc(tenantCol(db, SALES));
  const tyreRef = tyre ? tenantDoc(db, "tyres", tyre.id) : null;

  const warning = await runTransaction(db, async (tx) => {
    let localWarning: string | undefined;
    if (tyreRef && tyre) {
      const snap = await tx.get(tyreRef);
      // Defensive: if the tyre doc was deleted between the pre-transaction
      // listTyres() scan and this transaction body, treat it as "not found"
      // — same warning path as the never-found case. Sale still commits.
      if (!snap.exists()) {
        localWarning = "Matching tyre not found in inventory. Stock was NOT reduced.";
      } else {
        const authoritativeStock: number = Number(
          (snap.data() as any)?.currentStock ?? 0,
        );
        const newStock = authoritativeStock - data.quantity;
        if (newStock < 0) {
          localWarning = `Selling ${data.quantity} but only ${authoritativeStock} in stock.`;
        }
        tx.update(tyreRef, stripUndefined({
          currentStock: Math.max(0, newStock),
          updatedAt: serverTimestamp(),
        }));
      }
    } else {
      localWarning = "Matching tyre not found in inventory. Stock was NOT reduced.";
    }

    tx.set(
      saleRef,
      stripUndefined({
        ...payload,
        createdAt: serverTimestamp(),
      }),
    );
    return localWarning;
  });

  return { id: saleRef.id, warning };
}

export async function deleteSale(id: string): Promise<void> {
  const db = getDb();
  if (!db) {
    const list = await readLocalSales();
    await writeLocalSales(list.filter((s) => s.id !== id));
    return;
  }
  await deleteDoc(tenantDoc(db, SALES, id));
}

// ---------------------------------------------------------------------------
// MULTI-TYRE SALE (v2)
// ---------------------------------------------------------------------------
// Creates ONE Sale document that contains multiple `items[]` and safely
// decrements the stock of EVERY linked tyre in a single Firestore
// transaction. Race-safe: two concurrent multi-sales touching the same
// tyre re-read authoritative stock inside the transaction.

export interface MultiSaleInput {
  // Customer + bill metadata (mirrors createSale's shape minus per-item fields)
  customerName: string;
  mobileNumber: string;
  vehicleNumber: string;
  customerType: import("@/src/constants/inventory").CustomerType;
  date: number;
  paymentMode: import("@/src/constants/inventory").PaymentMode;
  invoiceKind?: "Tax Invoice" | "Kacha Bill";
  invoiceNumber?: string;
  hsnCode?: string;
  customerGstin?: string;
  customerAddress?: string;
  customerStateCode?: string;
  shopStateCode?: string;
  isInterstate?: boolean;
  // Items list — each with pre-computed taxable/totalGst/lineTotal.
  items: import("@/src/constants/inventory").SaleItem[];
}

export async function createMultiSale(
  input: MultiSaleInput,
): Promise<{ id: string; warnings: string[] }> {
  const warnings: string[] = [];
  if (!input.items || input.items.length === 0) {
    throw new Error("At least one tyre item is required.");
  }

  // Aggregate totals for the top-level Sale (legacy consumers).
  const aggTaxable = +input.items.reduce((s, i) => s + i.taxable, 0).toFixed(2);
  const aggGst = +input.items.reduce((s, i) => s + i.totalGst, 0).toFixed(2);
  const grandTotal = +(aggTaxable + aggGst).toFixed(2);
  const totalQty = input.items.reduce((s, i) => s + i.quantity, 0);
  const interstate = Boolean(input.isInterstate);
  const cgstAmount = interstate ? 0 : +(aggGst / 2).toFixed(2);
  const sgstAmount = interstate ? 0 : +(aggGst - cgstAmount).toFixed(2);
  const igstAmount = interstate ? aggGst : 0;

  // Snapshot first item into top-level fields so existing billing list,
  // reports and single-item PDF paths keep rendering. The `items` array
  // is the source of truth for multi-tyre bills.
  const first = input.items[0];

  // Customer upsert (outside transaction — same rationale as createSale).
  const legacyForCustomer: Omit<Sale, "id"> = {
    customerName: input.customerName,
    mobileNumber: input.mobileNumber,
    vehicleNumber: input.vehicleNumber,
    customerType: input.customerType,
    date: input.date,
    categoryId: first.categoryId,
    tyreClass: first.tyreClass,
    brand: first.brand,
    model: first.model,
    size: first.size,
    quantity: totalQty,
    priceList: first.priceList,
    discountPercent: first.discountPercent,
    discountAmount: first.discountAmount,
    sellingPrice: first.sellingPrice,
    gstPercent: first.gstPercent,
    paymentMode: input.paymentMode,
    linkedTyreId: first.linkedTyreId,
    totalValue: grandTotal,
    createdAt: Date.now(),
  };
  await upsertCustomer(legacyForCustomer);

  const salePayload: Omit<Sale, "id"> = {
    ...legacyForCustomer,
    items: input.items,
    invoiceKind: input.invoiceKind,
    invoiceNumber: input.invoiceNumber,
    hsnCode: input.hsnCode,
    customerGstin: input.customerGstin,
    customerAddress: input.customerAddress,
    customerStateCode: input.customerStateCode,
    shopStateCode: input.shopStateCode,
    isInterstate: interstate,
    cgstAmount,
    sgstAmount,
    igstAmount,
  };

  const db = getDb();
  if (!db) {
    // Local fallback: decrement each linked tyre sequentially.
    for (const item of input.items) {
      if (!item.linkedTyreId) {
        warnings.push(
          `${item.brand} ${item.model} ${item.size}: not in inventory, stock NOT reduced.`,
        );
        continue;
      }
      const tyres = await listTyres(item.categoryId);
      const t = tyres.find((x) => x.id === item.linkedTyreId);
      if (!t) {
        warnings.push(
          `${item.brand} ${item.model} ${item.size}: not in inventory, stock NOT reduced.`,
        );
        continue;
      }
      const newStock = (t.currentStock ?? 0) - item.quantity;
      if (newStock < 0) {
        warnings.push(
          `${item.brand} ${item.model} ${item.size}: selling ${item.quantity} but only ${t.currentStock} in stock.`,
        );
      }
      await updateTyre(t.id, { currentStock: Math.max(0, newStock) });
    }
    const list = await readLocalSales();
    const id = localId();
    list.push({ ...salePayload, id });
    await writeLocalSales(list);
    return { id, warnings };
  }

  const saleRef = doc(tenantCol(db, SALES));

  // Build tyre refs BEFORE the transaction (transactions can't run queries).
  const tyreRefs = input.items.map((item) =>
    item.linkedTyreId ? tenantDoc(db, "tyres", item.linkedTyreId) : null,
  );

  const txWarnings = await runTransaction(db, async (tx) => {
    const localWarnings: string[] = [];
    // Read ALL tyre docs FIRST — Firestore transactions require all reads
    // to precede all writes.
    const snaps = [];
    for (let i = 0; i < input.items.length; i++) {
      const ref = tyreRefs[i];
      snaps.push(ref ? await tx.get(ref) : null);
    }
    // Then apply writes (stock decrement per item).
    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];
      const ref = tyreRefs[i];
      const snap = snaps[i];
      if (!ref || !snap) {
        localWarnings.push(
          `${item.brand} ${item.model} ${item.size}: not in inventory, stock NOT reduced.`,
        );
        continue;
      }
      if (!snap.exists()) {
        localWarnings.push(
          `${item.brand} ${item.model} ${item.size}: tyre doc missing, stock NOT reduced.`,
        );
        continue;
      }
      const authoritativeStock = Number(
        (snap.data() as { currentStock?: number })?.currentStock ?? 0,
      );
      const newStock = authoritativeStock - item.quantity;
      if (newStock < 0) {
        localWarnings.push(
          `${item.brand} ${item.model} ${item.size}: selling ${item.quantity} but only ${authoritativeStock} in stock.`,
        );
      }
      tx.update(
        ref,
        stripUndefined({
          currentStock: Math.max(0, newStock),
          updatedAt: serverTimestamp(),
        }),
      );
    }
    tx.set(
      saleRef,
      stripUndefined({
        ...salePayload,
        createdAt: serverTimestamp(),
      }),
    );
    return localWarnings;
  });

  warnings.push(...txWarnings);
  return { id: saleRef.id, warnings };
}
