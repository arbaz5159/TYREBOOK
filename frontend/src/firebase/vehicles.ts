// Vehicle Master — maps a vehicle name (e.g. "Honda Activa 6G") to its
// front/rear tyre sizes so the Global Search can auto-suggest.

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
import type { VehicleModel } from "@/src/constants/inventory";

const COLLECTION = "vehicles";
const LOCAL_KEY = "tyrebook.vehicles";

async function readLocal(): Promise<VehicleModel[]> {
  const raw = await storage.getItem<string | null>(LOCAL_KEY, null);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as VehicleModel[];
  } catch {
    return [];
  }
}
async function writeLocal(list: VehicleModel[]): Promise<void> {
  await storage.setItem(LOCAL_KEY, JSON.stringify(list));
}

export async function listVehicles(): Promise<VehicleModel[]> {
  const db = getDb();
  if (!db) return (await readLocal()).sort((a, b) => a.name.localeCompare(b.name));
  const snap = await getDocs(query(collection(db, COLLECTION), orderBy("name")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VehicleModel, "id">) }));
}

export async function createVehicle(data: Omit<VehicleModel, "id">): Promise<string> {
  const db = getDb();
  if (!db) {
    const list = await readLocal();
    const id = `local-${Date.now()}`;
    list.push({ ...data, id, createdAt: Date.now() });
    await writeLocal(list);
    return id;
  }
  const ref = await addDoc(collection(db, COLLECTION), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateVehicle(id: string, data: Partial<Omit<VehicleModel, "id">>): Promise<void> {
  const db = getDb();
  if (!db) {
    const list = await readLocal();
    const idx = list.findIndex((x) => x.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...data };
      await writeLocal(list);
    }
    return;
  }
  await updateDoc(doc(db, COLLECTION, id), data);
}

export async function deleteVehicle(id: string): Promise<void> {
  const db = getDb();
  if (!db) {
    const list = await readLocal();
    await writeLocal(list.filter((x) => x.id !== id));
    return;
  }
  await deleteDoc(doc(db, COLLECTION, id));
}

// Utility: split "Honda Activa 6G, Suzuki Access 125" into normalized tokens.
export function splitCompat(raw: string): string[] {
  return (raw ?? "")
    .split(/[,;|/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Seed a small starter set the first time (useful for a new install).
export async function seedStarterVehicles(): Promise<void> {
  const existing = await listVehicles();
  if (existing.length) return;
  const seed: Omit<VehicleModel, "id">[] = [
    { name: "Honda Activa 6G", make: "Honda", category: "bike", frontSize: "90/90-12", rearSize: "90/100-10" },
    { name: "Suzuki Access 125", make: "Suzuki", category: "bike", frontSize: "90/90-12", rearSize: "90/100-10" },
    { name: "TVS Jupiter", make: "TVS", category: "bike", frontSize: "90/90-12", rearSize: "90/90-12" },
    { name: "Bajaj Pulsar 150", make: "Bajaj", category: "bike", frontSize: "80/100-17", rearSize: "100/90-17" },
    { name: "Hero Splendor Plus", make: "Hero", category: "bike", frontSize: "2.75-17", rearSize: "3.00-17" },
    { name: "Maruti Swift", make: "Maruti", category: "car", frontSize: "185/65 R15", rearSize: "185/65 R15" },
    { name: "Hyundai Creta", make: "Hyundai", category: "car", frontSize: "215/60 R17", rearSize: "215/60 R17" },
    { name: "Tata Nexon", make: "Tata", category: "car", frontSize: "215/60 R16", rearSize: "215/60 R16" },
    { name: "Mahindra XUV700", make: "Mahindra", category: "car", frontSize: "235/60 R18", rearSize: "235/60 R18" },
    { name: "Bajaj RE Auto", make: "Bajaj", category: "auto", frontSize: "4.00-8", rearSize: "4.00-8" },
    { name: "Mahindra Bolero Pickup", make: "Mahindra", category: "truck", frontSize: "7.00 R15", rearSize: "7.00 R15" },
    { name: "Tata Ace Gold", make: "Tata", category: "truck", frontSize: "155 R13", rearSize: "155 R13" },
  ];
  for (const v of seed) {
    await createVehicle(v);
  }
}
