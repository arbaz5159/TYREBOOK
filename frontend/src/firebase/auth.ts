// Multi-tenant Firebase Auth wrappers.
//
// Three user roles are supported:
//   - super_admin  → platform owner. Whitelisted via SUPER_ADMIN_EMAILS env
//                    (comma-separated). No shopId. Can inspect any shop.
//   - shop_admin   → tenant owner. Auto-created for any fresh signup that
//                    is neither a Super Admin email nor an invited staff.
//   - staff        → non-owner member of a shop. Created when the signup
//                    email matches a pending doc at shopInvites/{key}.
//
// On every sign-in we also (idempotently):
//   - upsert users/{uid} with the resolved role + shopId
//   - mirror `shops/{shopId}/members/{uid}` for the Shop Admin roster
//   - set the tenant module's activeShopId
//   - trigger the one-shot legacy migration if the caller is a Super Admin
//     (so pre-existing single-shop data ends up under shops/shop_default)

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithEmailAndPassword,
  signInWithPhoneNumber as fbSignInWithPhoneNumber,
  signOut as fbSignOut,
  updateProfile,
  type ConfirmationResult,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { storage } from "@/src/utils/storage";

import { getDb, getFirebaseAuth, isFirebaseConfigured } from "./config";
import { consumeInvite, findInviteByEmail } from "./invites";
import { runLegacyMigration } from "./migrate";
import { createShop, effectiveStatus, getShop, type Shop } from "./shops";
import { setActiveShopId } from "./tenant";
import { stripUndefined } from "./util";

export type AppRole = "super_admin" | "shop_admin" | "staff";

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: AppRole;
  shopId: string | null;
  shopName?: string;
  shopStatus?: Shop["status"] | null;
}

const LOCAL_USER_KEY = "tyrebook.localUser";
const ROLE_KEY = "tyrebook.role";
const SHOP_KEY = "tyrebook.shopId";

// -----------------------------------------------------------------------------
// Super Admin allow-list
// -----------------------------------------------------------------------------

function parseAdminEmails(raw: string | undefined | null): Set<string> {
  return new Set(
    (raw ?? "")
      .split(/[,\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = parseAdminEmails(process.env.EXPO_PUBLIC_SUPER_ADMIN_EMAILS);
  return allow.has(email.trim().toLowerCase());
}

// -----------------------------------------------------------------------------
// Local (offline) fallback — same as before, only reached when Firebase isn't
// configured. Kept so the UI is browsable in dev without env vars.
// -----------------------------------------------------------------------------

async function readLocalUser(): Promise<AppUser | null> {
  const raw = await storage.getItem<string | null>(LOCAL_USER_KEY, null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppUser;
  } catch {
    return null;
  }
}
async function writeLocalUser(user: AppUser | null): Promise<void> {
  if (user) await storage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
  else await storage.removeItem(LOCAL_USER_KEY);
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Read the users/{uid} doc. Returns null on any error (including
 * permission-denied) so callers can gracefully fall back to the email-based
 * defaults.
 */
async function readUserDoc(
  uid: string,
): Promise<{ role: AppRole; shopId?: string; name?: string } | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;
    const data = snap.data() as any;
    const rawRole = data.role;
    const role: AppRole =
      rawRole === "super_admin" || rawRole === "shop_admin" || rawRole === "staff"
        ? rawRole
        : // Legacy shape: {role: "owner" | "staff"} — migrator will fix on next
          // super-admin login; treat "owner" as shop_admin in the meantime.
          rawRole === "owner"
          ? "shop_admin"
          : "staff";
    return {
      role,
      shopId: typeof data.shopId === "string" ? data.shopId : undefined,
      name: typeof data.name === "string" ? data.name : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Mirror the user's membership into `shops/{shopId}/members/{uid}` so
 * Shop Admins can list their team without querying the global users
 * collection (Firestore rules can then keep users/* strictly self-only).
 */
async function upsertMember(
  shopId: string,
  user: User,
  data: { role: AppRole; name?: string },
): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await setDoc(
      doc(db, "shops", shopId, "members", user.uid),
      stripUndefined({
        uid: user.uid,
        email: user.email ?? undefined,
        name: data.name || user.displayName || undefined,
        role: data.role,
        active: true,
        updatedAt: serverTimestamp(),
      }),
      { merge: true },
    );
  } catch {
    // rules-block or offline — main user record is already written elsewhere
  }
}

/**
 * Idempotent users/{uid} upsert. Called from signIn / signUp /
 * subscribeAuth so legacy accounts get backfilled with { role, shopId } on
 * their next login.
 */
async function upsertUserDoc(
  user: User,
  data: { name?: string; role: AppRole; shopId: string | null },
): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    const base = stripUndefined({
      uid: user.uid,
      email: user.email ?? undefined,
      phoneNumber: user.phoneNumber ?? undefined,
      name:
        data.name
        || user.displayName
        || (user.email ?? "").split("@")[0]
        || (user.phoneNumber ?? "").replace(/^\+91/, "")
        || undefined,
      role: data.role,
      shopId: data.shopId ?? undefined,
      lastLoginAt: serverTimestamp(),
    });
    if (snap.exists()) {
      await setDoc(ref, base, { merge: true });
    } else {
      await setDoc(
        ref,
        stripUndefined({ ...base, active: true, createdAt: serverTimestamp() }),
        { merge: true },
      );
    }
  } catch {
    // non-fatal: don't lock the user out because of a rules mis-config
  }
}

/**
 * Resolve a Firebase user into an AppUser (role + shopId + shopStatus).
 * Runs the one-shot legacy migration if the actor is a Super Admin.
 */
async function hydrateAppUser(
  user: User,
  opts: { fallbackName?: string } = {},
): Promise<AppUser> {
  const email = user.email ?? null;

  // 1. Super Admin — highest priority.
  if (isSuperAdminEmail(email)) {
    // Fire-and-forget migration so pre-existing single-shop data lands
    // under shops/shop_default. `runLegacyMigration` is idempotent.
    runLegacyMigration({ uid: user.uid, email }).catch((e) => {
      console.warn("[auth] Legacy migration failed (non-fatal):", e);
    });
    await upsertUserDoc(user, {
      name: opts.fallbackName,
      role: "super_admin",
      shopId: null,
    });
    // Super Admin doesn't have a default active shop; they must pick one
    // from the Super Admin panel. Clear any stale shopId locally.
    setActiveShopId(null);
    await storage.removeItem(SHOP_KEY);
    await storage.setItem(ROLE_KEY, "super_admin");
    return {
      uid: user.uid,
      email,
      displayName: user.displayName ?? opts.fallbackName ?? null,
      role: "super_admin",
      shopId: null,
    };
  }

  // 2. Load existing users/{uid} doc.
  const existing = await readUserDoc(user.uid);

  // SECURITY: `super_admin` MAY ONLY be granted via the env allow-list.
  // If Firestore claims a role of `super_admin` for a non-whitelisted
  // email (tampering, stale data, or a demoted account), coerce back to
  // `shop_admin` before we act on it. The whitelist check happens above
  // (step 1) so an actual super-admin has already been handled and
  // returned early — reaching here means the email is NOT whitelisted.
  const safeExistingRole: AppRole | undefined =
    existing?.role === "super_admin" ? "shop_admin" : existing?.role;

  if (existing && existing.shopId) {
    const roleToUse: AppRole = safeExistingRole ?? "shop_admin";
    const shop = await getShop(existing.shopId);
    await upsertUserDoc(user, {
      name: existing.name ?? opts.fallbackName,
      role: roleToUse,
      shopId: existing.shopId,
    });
    await upsertMember(existing.shopId, user, {
      role: roleToUse,
      name: existing.name ?? opts.fallbackName,
    });
    setActiveShopId(existing.shopId);
    await storage.setItem(SHOP_KEY, existing.shopId);
    await storage.setItem(ROLE_KEY, roleToUse);
    return {
      uid: user.uid,
      email,
      displayName: user.displayName ?? existing.name ?? null,
      role: roleToUse,
      shopId: existing.shopId,
      shopName: shop?.name,
      shopStatus: shop ? effectiveStatus(shop) : null,
    };
  }

  // 3. First-time login: consume any pending staff invite, otherwise
  //    create a fresh shop for this user (they become shop_admin).
  if (email) {
    const invite = await findInviteByEmail(email);
    if (invite) {
      await upsertUserDoc(user, {
        name: opts.fallbackName,
        role: "staff",
        shopId: invite.shopId,
      });
      await upsertMember(invite.shopId, user, {
        role: "staff",
        name: opts.fallbackName,
      });
      await consumeInvite(invite.id);
      const shop = await getShop(invite.shopId);
      setActiveShopId(invite.shopId);
      await storage.setItem(SHOP_KEY, invite.shopId);
      await storage.setItem(ROLE_KEY, "staff");
      return {
        uid: user.uid,
        email,
        displayName: user.displayName ?? opts.fallbackName ?? null,
        role: "staff",
        shopId: invite.shopId,
        shopName: shop?.name,
        shopStatus: shop ? effectiveStatus(shop) : null,
      };
    }
  }

  // 4. Fresh shop_admin — auto-provision a new tenant with a 14-day trial.
  const shopName =
    opts.fallbackName ||
    (email ? `${email.split("@")[0]}'s Tyre Shop` : "My Tyre Shop");
  const shop = await createShop({
    name: shopName,
    ownerUid: user.uid,
    ownerEmail: email ?? "",
  });
  await upsertUserDoc(user, {
    name: opts.fallbackName,
    role: "shop_admin",
    shopId: shop.id,
  });
  await upsertMember(shop.id, user, { role: "shop_admin", name: opts.fallbackName });
  setActiveShopId(shop.id);
  await storage.setItem(SHOP_KEY, shop.id);
  await storage.setItem(ROLE_KEY, "shop_admin");
  return {
    uid: user.uid,
    email,
    displayName: user.displayName ?? opts.fallbackName ?? null,
    role: "shop_admin",
    shopId: shop.id,
    shopName: shop.name,
    shopStatus: effectiveStatus(shop),
  };
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export async function signIn(email: string, password: string): Promise<AppUser> {
  const auth = getFirebaseAuth();
  if (!auth) {
    // Local dev fallback — pretend the user exists so screens render.
    const local: AppUser = {
      uid: `local-${Date.now()}`,
      email,
      displayName: email.split("@")[0] ?? "User",
      role: isSuperAdminEmail(email) ? "super_admin" : "shop_admin",
      shopId: isSuperAdminEmail(email) ? null : "local-shop",
      shopStatus: "active",
    };
    await writeLocalUser(local);
    return local;
  }
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return hydrateAppUser(cred.user);
}

export async function signUp(
  name: string,
  email: string,
  password: string,
  shopNameOverride?: string,
): Promise<AppUser> {
  const auth = getFirebaseAuth();
  if (!auth) {
    const isSuper = isSuperAdminEmail(email);
    const local: AppUser = {
      uid: `local-${Date.now()}`,
      email,
      displayName: name,
      role: isSuper ? "super_admin" : "shop_admin",
      shopId: isSuper ? null : "local-shop",
      shopStatus: "active",
    };
    await writeLocalUser(local);
    return local;
  }
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (name) {
    try {
      await updateProfile(cred.user, { displayName: name });
    } catch {
      /* nice-to-have */
    }
  }
  return hydrateAppUser(cred.user, {
    fallbackName: shopNameOverride?.trim() || name,
  });
}

export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  if (auth) await fbSignOut(auth);
  await writeLocalUser(null);
  await storage.removeItem(ROLE_KEY);
  await storage.removeItem(SHOP_KEY);
  setActiveShopId(null);
}

// -----------------------------------------------------------------------------
// Phone-number OTP login (Firebase Phone Auth)
// -----------------------------------------------------------------------------
// USAGE
//   const otp = await sendOtp("+919812345678", { recaptchaContainerId: "recaptcha" });
//   const user = await verifyOtp(otp, "123456");
//
// PLATFORM NOTES
//   * Web (Expo Web): needs a <View nativeID="recaptcha"> or a <div id="recaptcha">
//     mounted in the DOM. `RecaptchaVerifier` renders an invisible reCAPTCHA into
//     that element. Nothing else is required.
//   * Native iOS/Android via a real EAS build: Firebase JS SDK uses
//     `signInWithPhoneNumber` with silent verification (SafetyNet on Android,
//     silent APNs push on iOS). Works after the platform team has enabled the
//     phone provider in Firebase Console AND the app is signed with the
//     correct SHA-1 (Android) / bundle id + APNs key (iOS).
//   * Expo Go: DOES NOT work — Expo Go's JS-only Firebase SDK cannot perform
//     device attestation. Use Web preview or a dev/production build.
//
// This flow deliberately re-uses `hydrateAppUser`, so an OTP sign-in follows
// exactly the same shop-provisioning / role-resolution path as the existing
// email/password sign-up. Nothing about the multi-tenant model changes.

export interface OtpTicket {
  confirmation: ConfirmationResult;
  phoneNumber: string;
  sentAt: number;
}

const RECAPTCHA_STATE: { verifier: RecaptchaVerifier | null } = { verifier: null };

function ensureRecaptcha(auth: ReturnType<typeof getFirebaseAuth>, containerId?: string): RecaptchaVerifier {
  if (RECAPTCHA_STATE.verifier) return RECAPTCHA_STATE.verifier;
  if (!auth) throw new Error("Firebase Auth not configured.");
  // The RecaptchaVerifier constructor requires a DOM element on Web. On native
  // Expo Go this branch will throw — we surface a clear message so the UI can
  // explain the Expo Go limitation instead of crashing.
  if (typeof document === "undefined") {
    throw new Error(
      "OTP login isn't available in Expo Go — please use the web preview or a real Android/iOS build to test OTP.",
    );
  }
  const id = containerId ?? "tyrebook-recaptcha";
  RECAPTCHA_STATE.verifier = new RecaptchaVerifier(auth, id, { size: "invisible" });
  return RECAPTCHA_STATE.verifier;
}

/** Reset the reCAPTCHA verifier (call between resend attempts or on unmount). */
export function resetRecaptcha(): void {
  try {
    RECAPTCHA_STATE.verifier?.clear();
  } catch {
    /* verifier may already be cleared by Firebase */
  }
  RECAPTCHA_STATE.verifier = null;
}

/** Normalise a raw mobile number into E.164 format for India (+91). */
export function toE164India(raw: string): string {
  const digits = raw.replace(/\D+/g, "");
  // If the caller already prefixed 91, drop stray leading zero, keep as-is.
  if (digits.startsWith("91") && digits.length >= 12) return `+${digits.slice(0, 12)}`;
  // If it's a bare 10-digit Indian mobile, prefix +91.
  if (digits.length === 10) return `+91${digits}`;
  // Fallback: assume already E.164 minus the plus.
  return `+${digits}`;
}

export function isValidIndianMobile(raw: string): boolean {
  const digits = raw.replace(/\D+/g, "");
  const local = digits.startsWith("91") ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(local);
}

export async function sendOtp(
  rawPhone: string,
  opts: { recaptchaContainerId?: string } = {},
): Promise<OtpTicket> {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase Auth not configured.");
  const phoneNumber = toE164India(rawPhone);
  if (!isValidIndianMobile(rawPhone)) {
    throw new Error("Please enter a valid 10-digit Indian mobile number.");
  }
  // Fresh verifier per session to avoid stale reCAPTCHA tokens.
  resetRecaptcha();
  const verifier = ensureRecaptcha(auth, opts.recaptchaContainerId);
  const confirmation = await fbSignInWithPhoneNumber(auth, phoneNumber, verifier);
  return { confirmation, phoneNumber, sentAt: Date.now() };
}

export async function verifyOtp(ticket: OtpTicket, code: string): Promise<AppUser> {
  const trimmed = (code || "").replace(/\D+/g, "");
  if (trimmed.length !== 6) {
    throw new Error("Please enter the 6-digit code you received.");
  }
  const cred = await ticket.confirmation.confirm(trimmed);
  // Phone-auth users don't have an email yet — the existing hydrate flow
  // handles the null-email path (falls through to the fresh Shop Admin
  // branch and provisions a new tenant). Existing invited-staff / super-admin
  // logic stays intact because both key off email (which is null here).
  return hydrateAppUser(cred.user);
}


export function subscribeAuth(cb: (user: AppUser | null) => void): () => void {
  const auth = getFirebaseAuth();
  if (!auth) {
    (async () => {
      const u = await readLocalUser();
      if (u?.shopId) setActiveShopId(u.shopId);
      cb(u);
    })();
    return () => {};
  }
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      setActiveShopId(null);
      cb(null);
      return;
    }
    try {
      const hydrated = await hydrateAppUser(user);
      cb(hydrated);
    } catch (e) {
      console.warn("[auth] hydrateAppUser failed:", e);
      cb({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        role: "shop_admin",
        shopId: null,
      });
    }
  });
}

export { isFirebaseConfigured };
