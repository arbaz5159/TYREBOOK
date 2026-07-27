// Simple staff/user roster managed by the Owner.
// Docs shape: { id, name, email, role: "owner" | "staff", active }

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

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: "owner" | "staff";
  active: boolean;
  createdAt?: number;
}

const COLLECTION = "users";
const LOCAL_KEY = "tyrebook.users";

async function readLocal(): Promise<StaffUser[]> {
  const raw = await storage.getItem<string | null>(LOCAL_KEY, null);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as StaffUser[];
  } catch {
    return [];
  }
}
async function writeLocal(list: StaffUser[]): Promise<void> {
  await storage.setItem(LOCAL_KEY, JSON.stringify(list));
}

export async function listUsers(): Promise<StaffUser[]> {
  const db = getDb();
  if (!db) return (await readLocal()).sort((a, b) => a.name.localeCompare(b.name));
  const snap = await getDocs(query(collection(db, COLLECTION), orderBy("name")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StaffUser, "id">) }));
}

export async function createUser(data: Omit<StaffUser, "id">): Promise<string> {
  const db = getDb();
  if (!db) {
    const list = await readLocal();
    const id = `local-${Date.now()}`;
    list.push({ ...data, id, createdAt: Date.now() });
    await writeLocal(list);
    return id;
  }
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateUser(
  id: string,
  data: Partial<Omit<StaffUser, "id">>,
): Promise<void> {
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

export async function deleteUser(id: string): Promise<void> {
  const db = getDb();
  if (!db) {
    const list = await readLocal();
    await writeLocal(list.filter((x) => x.id !== id));
    return;
  }
  await deleteDoc(doc(db, COLLECTION, id));
}
