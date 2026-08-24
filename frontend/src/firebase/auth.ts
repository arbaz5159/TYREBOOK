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

import { Platform } from "react-native";

import { getDb, getFirebaseAuth, isFirebaseConfigured } from "./config";
import { consumeInvite, findInviteByEmail } from "./invites";
import { runLegacyMigration } from "./migrate";
import {
  nativeGetDocData,
  nativeServerTimestamp,
  nativeSetDoc,
} from "./nativeFirestore";
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
 *
 * Platform-branched: on Native we ALWAYS go through RNFB Firestore so the
 * request is authenticated by the native phone-auth session. On Web we use
 * the JS SDK, matching the existing behaviour.
 */
interface UserDocRaw {
  role?: unknown;
  shopId?: unknown;
  name?: unknown;
}

async function readUserDoc(
  uid: string,
): Promise<{ role: AppRole; shopId?: string; name?: string } | null> {
  const coerce = (data: UserDocRaw | null): { role: AppRole; shopId?: string; name?: string } | null => {
    if (!data) return null;
    const rawRole = data.role;
    const role: AppRole =
      rawRole === "super_admin" || rawRole === "shop_admin" || rawRole === "staff"
        ? (rawRole as AppRole)
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
  };

  if (Platform.OS !== "web") {
    try {
      const data = await nativeGetDocData<UserDocRaw>(["users", uid]);
      return coerce(data);
    } catch {
      return null;
    }
  }

  const db = getDb();
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;
    return coerce(snap.data() as UserDocRaw);
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
  const payload = stripUndefined({
    uid: user.uid,
    email: user.email ?? undefined,
    name: data.name || user.displayName || undefined,
    role: data.role,
    active: true,
  });

  if (Platform.OS !== "web") {
    try {
      await nativeSetDoc(
        ["shops", shopId, "members", user.uid],
        { ...payload, updatedAt: nativeServerTimestamp() },
        true,
      );
    } catch {
      // rules-block or offline — main user record is already written elsewhere
    }
    return;
  }

  const db = getDb();
  if (!db) return;
  try {
    await setDoc(
      doc(db, "shops", shopId, "members", user.uid),
      { ...payload, updatedAt: serverTimestamp() },
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
  const baseName =
    data.name
    || user.displayName
    || (user.email ?? "").split("@")[0]
    || (user.phoneNumber ?? "").replace(/^\+91/, "")
    || undefined;

  if (Platform.OS !== "web") {
    try {
      const existing = await nativeGetDocData<Record<string, unknown>>(["users", user.uid]);
      const payload = stripUndefined({
        uid: user.uid,
        email: user.email ?? undefined,
        phoneNumber: user.phoneNumber ?? undefined,
        name: baseName,
        role: data.role,
        shopId: data.shopId ?? undefined,
        lastLoginAt: nativeServerTimestamp(),
      });
      if (existing) {
        await nativeSetDoc(["users", user.uid], payload, true);
      } else {
        await nativeSetDoc(
          ["users", user.uid],
          { ...payload, active: true, createdAt: nativeServerTimestamp() },
          true,
        );
      }
    } catch {
      // non-fatal: don't lock the user out because of a rules mis-config
    }
    return;
  }

  const db = getDb();
  if (!db) return;
  try {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    const base = stripUndefined({
      uid: user.uid,
      email: user.email ?? undefined,
      phoneNumber: user.phoneNumber ?? undefined,
      name: baseName,
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

// -----------------------------------------------------------------------------
// Native auth mirroring — so Firestore (which routes through RNFB on Native
// via ./fsSdk) has an authenticated session for BOTH sign-in paths:
//   * phone-OTP  → already lands in the RNFB auth session (see sendOtp/verifyOtp)
//   * email/password (Super Admin, Shop Admin fallback) → JS SDK signs in first,
//     then we mirror into RNFB here so RNFB Firestore reads/writes have
//     `request.auth.uid == user.uid`.
//
// HARD-FAIL contract (per Message 549 Point 2): on Native, if the RNFB mirror
// cannot establish an authenticated `currentUser` for the same email, we
// THROW. Callers (signIn / signUp) propagate the error to the UI so the
// user sees a clear failure instead of hitting permission-denied on every
// downstream Firestore read. Web path is a no-op — behaviour unchanged.
async function mirrorEmailSignInToRnfb(email: string, password: string): Promise<void> {
  if (Platform.OS === "web") return; // Web unchanged.
  let rnfb: typeof import("@react-native-firebase/auth");
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    rnfb = require("@react-native-firebase/auth") as typeof import("@react-native-firebase/auth");
  } catch (e) {
    // RNFB module truly unavailable at runtime (Expo Go, missing native
    // link). We cannot authenticate the RNFB Firestore path — hard-fail
    // instead of silently continuing into permission-denied reads.
    console.error("[auth] RNFB native auth module not available:", e);
    throw new Error(
      "This build cannot log in with email/password — the native Firebase Auth module is not linked. Please install the latest production APK.",
    );
  }
  const a = rnfb.getAuth();
  const alreadyRight =
    !!a.currentUser && a.currentUser.email?.toLowerCase() === email.toLowerCase();
  if (!alreadyRight) {
    try {
      await rnfb.signInWithEmailAndPassword(a, email, password);
    } catch (e) {
      console.error("[auth] RNFB email sign-in mirror failed:", e);
      // Best-effort: also sign out of JS SDK Auth so app doesn't land in a
      // half-authenticated state where JS-SDK has a user but RNFB (which
      // Firestore now authenticates against) does not.
      const jsAuth = getFirebaseAuth();
      if (jsAuth) {
        try {
          await fbSignOut(jsAuth);
        } catch {
          /* noop */
        }
      }
      const msg = e instanceof Error ? e.message : String(e ?? "");
      throw new Error(
        `Login failed on device: ${msg || "could not authenticate Firestore session"}. Please try again.`,
      );
    }
  }
  // Post-condition: RNFB Auth must now have an authenticated currentUser
  // for the same email. If not, refuse to continue.
  const post = rnfb.getAuth().currentUser;
  if (!post || post.email?.toLowerCase() !== email.toLowerCase()) {
    const jsAuth = getFirebaseAuth();
    if (jsAuth) {
      try {
        await fbSignOut(jsAuth);
      } catch {
        /* noop */
      }
    }
    throw new Error(
      "Login failed on device: authenticated Firestore session could not be established. Please try again.",
    );
  }
}

async function mirrorEmailSignUpToRnfb(
  email: string,
  password: string,
): Promise<void> {
  // Same contract as sign-in: hard-fail on Native. Sign-up on JS SDK just
  // created the Firebase Auth user, so RNFB `signInWithEmailAndPassword`
  // with the exact same credentials will land in that same account.
  await mirrorEmailSignInToRnfb(email, password);
}

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
  // Mirror into RNFB Auth on Native so RNFB-Firestore (used by all tenant
  // reads via ./fsSdk on Native) has an authenticated session too.
  await mirrorEmailSignInToRnfb(email, password);
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
  // Mirror into RNFB Auth on Native (see mirrorEmailSignInToRnfb above).
  await mirrorEmailSignUpToRnfb(email, password);
  return hydrateAppUser(cred.user, {
    fallbackName: shopNameOverride?.trim() || name,
  });
}

export async function signOut(): Promise<void> {
  // Native path: sign out of RNFB auth session, which is what the phone
  // OTP flow authenticates into. We also call the JS SDK signOut below
  // because email/password / super-admin login on native (if ever used)
  // would land in the JS SDK session — this makes signOut idempotent for
  // both branches without cross-SDK credential exchange.
  if (Platform.OS !== "web") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const rnfb = require("@react-native-firebase/auth") as NativeAuthModule;
      const nativeAuth = rnfb.getAuth();
      if (nativeAuth.currentUser) {
        await rnfb.signOut(nativeAuth);
      }
    } catch {
      // native module unavailable (e.g. running under Expo Go) — ignore.
    }
  }
  const auth = getFirebaseAuth();
  if (auth) {
    try {
      await fbSignOut(auth);
    } catch {
      /* already signed out */
    }
  }
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
//     that element. Nothing else is required. This is the ONLY path used on Web.
//   * Native Android (real APK/AAB with google-services.json + SHA-1 in Firebase):
//     we route through @react-native-firebase/auth's `signInWithPhoneNumber(...)`
//     which uses Play Integrity / silent verification and bypasses reCAPTCHA
//     entirely. We then redeem the returned `verificationId` via the JS SDK's
//     `signInWithCredential(auth, PhoneAuthProvider.credential(verificationId,
//     code))` — this is the API-level equivalent of `.confirm(code)` and puts
//     the resulting user into the JS-SDK auth session that the rest of the
//     app (Firestore reads/writes, hydrateAppUser, tenant provisioning) is
//     built on. Calling RNFB's `confirmation.confirm(code)` directly would
//     sign into a SEPARATE native session and break Firestore access.
//   * Expo Go: DOES NOT work — Expo Go can't load the RN-Firebase native
//     modules. Use Web preview or a real EAS build.
//
// This flow deliberately re-uses `hydrateAppUser`, so an OTP sign-in follows
// exactly the same shop-provisioning / role-resolution path as the existing
// email/password sign-up. Nothing about the multi-tenant model changes.

export interface OtpTicket {
  // Web JS SDK confirmation. Populated only when Platform.OS === "web".
  confirmation?: ConfirmationResult;
  // Native (RNFirebase v26) confirmation. Populated only when
  // Platform.OS !== "web". Stored as `unknown` here because the type is
  // resolved lazily inside `sendOtp` to keep Web bundles free of the
  // native module reference.
  nativeConfirmation?: unknown;
  phoneNumber: string;
  sentAt: number;
}

const RECAPTCHA_STATE: {
  verifier: RecaptchaVerifier | null;
  containerId: string | null;
} = { verifier: null, containerId: null };

function ensureRecaptcha(auth: ReturnType<typeof getFirebaseAuth>, containerId?: string): RecaptchaVerifier {
  if (RECAPTCHA_STATE.verifier) return RECAPTCHA_STATE.verifier;
  if (!auth) throw new Error("Firebase Auth not configured.");
  // `RecaptchaVerifier` requires a DOM. This helper is ONLY called from the
  // Web branch of `sendOtp` — the native branch never reaches here — so a
  // missing `document` genuinely means we're on Native without a browser
  // shim, i.e. Expo Go. In that (rare) case the OTP flow can't proceed.
  if (typeof document === "undefined") {
    throw new Error(
      "OTP login isn't available in Expo Go — please use the web preview or a real Android/iOS build.",
    );
  }
  const id = containerId ?? "tyrebook-recaptcha";
  // Belt-and-braces: even if we haven't touched this container yet, wipe any
  // stray reCAPTCHA iframe left over from a previous Firebase session so
  // `new RecaptchaVerifier(...)` never throws
  // "reCAPTCHA has already been rendered in this element".
  const el = document.getElementById(id);
  if (el && el.innerHTML) el.innerHTML = "";
  RECAPTCHA_STATE.containerId = id;
  RECAPTCHA_STATE.verifier = new RecaptchaVerifier(auth, id, { size: "invisible" });
  return RECAPTCHA_STATE.verifier;
}

/**
 * Fully dispose the current reCAPTCHA verifier so the very next
 * `ensureRecaptcha()` call gets a brand-new instance. Must be called:
 *   * between OTP attempts (success or failure — the verifier is
 *     single-use per Firebase's contract),
 *   * before a resend,
 *   * on screen unmount.
 *
 * We do TWO things (defence-in-depth):
 *   1. Call `verifier.clear()` — the officially documented API.
 *   2. Manually blank the container's `innerHTML`, because on Web the
 *      Google reCAPTCHA script sometimes leaves its <iframe> attached
 *      even after `clear()` returns. When that iframe survives, a
 *      subsequent `new RecaptchaVerifier(auth, sameId, …)` throws
 *      "reCAPTCHA has already been rendered in this element" and the
 *      user is unable to retry / resend.
 */
export function resetRecaptcha(): void {
  try {
    RECAPTCHA_STATE.verifier?.clear();
  } catch {
    /* verifier may already be cleared by Firebase */
  }
  const id = RECAPTCHA_STATE.containerId ?? "tyrebook-recaptcha";
  RECAPTCHA_STATE.verifier = null;
  RECAPTCHA_STATE.containerId = null;
  // Replace the container NODE (same id) so reCAPTCHA fully releases its
  // internal binding to the element. Simply blanking `innerHTML` is not
  // enough — grecaptcha keeps a WeakRef-like handle on the original
  // <div>, which is why users still hit
  // "reCAPTCHA has already been rendered in this element" on the very
  // next attempt. Cloning without children and swapping via replaceChild
  // gives us a brand-new DOM node under the same id that Firebase has
  // never seen, guaranteeing a clean render on the next call.
  if (typeof document !== "undefined") {
    const el = document.getElementById(id);
    if (el && el.parentNode) {
      const fresh = el.cloneNode(false) as HTMLElement; // shallow clone: attrs (including id) copied, children dropped
      el.parentNode.replaceChild(fresh, el);
    }
  }
}

/**
 * Normalise a raw mobile number into E.164 format for India (+91).
 *
 * Design contract:
 *   * A bare 10-digit mobile (e.g. `9172066276`, `9198765432`) is a
 *     LOCAL number — we always prepend `+91`. Do NOT try to be clever
 *     and treat the leading `91` as a country code — that mistake was
 *     the cause of the previous "please enter a valid 10-digit Indian
 *     mobile number" rejection on real numbers whose subscriber prefix
 *     literally starts with `91`.
 *   * A 12-digit input starting with `91` IS the country-code form
 *     (`91XXXXXXXXXX` = `+91XXXXXXXXXX`).
 *   * An input with an explicit leading `+` is trusted as-is (digits
 *     re-extracted and prefixed with `+`).
 */
export function toE164India(raw: string): string {
  const trimmed = (raw ?? "").trim();
  const explicitPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D+/g, "");
  if (explicitPlus) return `+${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("091")) return `+${digits.slice(1)}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

/**
 * Validate an Indian mobile number.
 * The subscriber prefix (first digit of the 10-digit local number) must
 * be 6, 7, 8 or 9 (TRAI numbering plan). We ONLY strip a leading `91`
 * when it's clearly the country code (12-digit total, or an explicit `+`
 * prefix) — otherwise numbers like `9172066276` would be truncated to
 * an 8-digit local and wrongly rejected.
 */
export function isValidIndianMobile(raw: string): boolean {
  const trimmed = (raw ?? "").trim();
  const explicitPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D+/g, "");
  let local = digits;
  if (explicitPlus && digits.startsWith("91")) local = digits.slice(2);
  else if (digits.length === 12 && digits.startsWith("91")) local = digits.slice(2);
  else if (digits.length === 13 && digits.startsWith("091")) local = digits.slice(3);
  return /^[6-9]\d{9}$/.test(local);
}

export async function sendOtp(
  rawPhone: string,
  opts: { recaptchaContainerId?: string } = {},
): Promise<OtpTicket> {
  const auth = getFirebaseAuth();
  if (!auth && Platform.OS === "web") throw new Error("Firebase Auth not configured.");
  if (!isValidIndianMobile(rawPhone)) {
    throw new Error("Please enter a valid 10-digit Indian mobile number.");
  }
  const phoneNumber = toE164India(rawPhone);

  // -------------------------------------------------------------------
  // Native path (Android APK/AAB) — v26 modular API, same SDK end-to-end
  // -------------------------------------------------------------------
  // We dynamically require @react-native-firebase/auth so the Web bundle
  // never resolves the native module. On a real device this uses Play
  // Integrity / silent verification and does NOT touch reCAPTCHA.
  if (Platform.OS !== "web") {
    let rnfbMod: NativeAuthModule;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      rnfbMod = require("@react-native-firebase/auth") as NativeAuthModule;
    } catch {
      throw new Error(
        "OTP login on mobile requires a real Android/iOS build (@react-native-firebase/auth native module is unavailable in Expo Go). Please use the web preview or generate an APK/AAB.",
      );
    }
    const nativeAuthInstance = rnfbMod.getAuth();
    try {
      const nativeConfirmation = await rnfbMod.signInWithPhoneNumber(
        nativeAuthInstance,
        phoneNumber,
      );
      return { nativeConfirmation, phoneNumber, sentAt: Date.now() };
    } catch (e) {
      throw mapNativeAuthError(e);
    }
  }

  // -------------------------------------------------------------------
  // Web path — JS SDK + reCAPTCHA (unchanged behaviour)
  // -------------------------------------------------------------------
  if (!auth) throw new Error("Firebase Auth not configured.");
  // Firebase's RecaptchaVerifier is single-use: once `signInWithPhoneNumber`
  // consumes the token, the verifier CANNOT be reused for a resend / retry.
  // We therefore dispose any existing verifier and create a fresh one for
  // every send attempt (successful or not).
  resetRecaptcha();
  const verifier = ensureRecaptcha(auth, opts.recaptchaContainerId);
  try {
    const confirmation = await fbSignInWithPhoneNumber(auth, phoneNumber, verifier);
    // Firebase's RecaptchaVerifier is single-use: the token that was
    // solved and shipped to `signInWithPhoneNumber` cannot be replayed.
    // If we DON'T dispose it here on the success path, the very next
    // send/resend attempt reuses the same DOM container while grecaptcha
    // still holds an internal binding to it — producing the
    // "reCAPTCHA has already been rendered in this element" crash the
    // user reported. Cleaning on both success AND error keeps every
    // retry path (mistyped number, resend after success, log-out then
    // log-in) starting from a known-clean state.
    resetRecaptcha();
    return {
      confirmation,
      phoneNumber,
      sentAt: Date.now(),
    };
  } catch (e) {
    // The verifier is now in an unknown state (challenge shown but not
    // solved, or challenge solved but the request failed). Nuke it so the
    // very next retry gets a clean slate — this is what prevents the
    // "reCAPTCHA has already been rendered in this element" error users
    // see when they fix a mistyped number and hit "Send OTP" again.
    resetRecaptcha();
    throw e;
  }
}

// Native RNFirebase-auth module shape we consume. Kept local so Web
// bundles never pull in the ambient types file.
interface NativeAuthUser {
  uid: string;
  email: string | null;
  phoneNumber: string | null;
  displayName: string | null;
}
interface NativeAuthConfirmation {
  confirm: (code: string) => Promise<{ user: NativeAuthUser }>;
}
interface NativeAuthInstance {
  currentUser: NativeAuthUser | null;
}
interface NativeAuthModule {
  getAuth: () => NativeAuthInstance;
  signInWithPhoneNumber: (
    auth: NativeAuthInstance,
    phone: string,
  ) => Promise<NativeAuthConfirmation>;
  signOut: (auth: NativeAuthInstance) => Promise<void>;
  onAuthStateChanged: (
    auth: NativeAuthInstance,
    cb: (user: NativeAuthUser | null) => void,
  ) => () => void;
}

function mapNativeAuthError(e: unknown): Error {
  const code = (e as { code?: string } | null)?.code ?? "";
  switch (code) {
    case "auth/invalid-phone-number":
      return new Error("The phone number is not in a valid E.164 format.");
    case "auth/missing-phone-number":
      return new Error("Please enter a mobile number.");
    case "auth/quota-exceeded":
      return new Error("SMS quota exceeded for this project — try again later.");
    case "auth/too-many-requests":
      return new Error("Too many requests from this device. Please wait a few minutes.");
    case "auth/invalid-verification-code":
      return new Error("That OTP doesn't match. Please check and try again.");
    case "auth/session-expired":
    case "auth/code-expired":
      return new Error("The OTP has expired. Tap Resend to request a fresh code.");
    case "auth/app-not-authorized":
      return new Error(
        "This app is not authorized to use Firebase Phone Auth — check the SHA-1 / SHA-256 fingerprints in Firebase Console.",
      );
    case "auth/network-request-failed":
      return new Error("Network error — please check your connection and try again.");
    default:
      return e instanceof Error ? e : new Error(String(e ?? "OTP send failed"));
  }
}

export async function verifyOtp(ticket: OtpTicket, code: string): Promise<AppUser> {
  const trimmed = (code || "").replace(/\D+/g, "");
  if (trimmed.length !== 6) {
    throw new Error("Please enter the 6-digit code you received.");
  }
  const auth = getFirebaseAuth();

  // Native path: use the SAME RNFB confirmation we received in sendOtp.
  // `confirmation.confirm(code)` completes the sign-in inside the native
  // Firebase Auth session — the same session native Firestore reads from,
  // so downstream user-doc / shop-provisioning writes are authenticated.
  if (Platform.OS !== "web") {
    if (!ticket.nativeConfirmation) {
      throw new Error("Missing native OTP confirmation — please tap Send OTP again.");
    }
    const nc = ticket.nativeConfirmation as NativeAuthConfirmation;
    try {
      const cred = await nc.confirm(trimmed);
      // Adapt the RNFB user-shape to the tiny surface `hydrateAppUser`
      // needs (uid, email, phoneNumber, displayName). We keep the type
      // compatible via a duck-typed adapter — no `any` casts.
      const adapted: User = {
        uid: cred.user.uid,
        email: cred.user.email ?? null,
        phoneNumber: cred.user.phoneNumber ?? null,
        displayName: cred.user.displayName ?? null,
        // The rest of the User interface isn't used by hydrateAppUser but
        // TypeScript demands we satisfy the shape. We mark those as
        // never-called stubs.
      } as unknown as User;
      return hydrateAppUser(adapted);
    } catch (e) {
      throw mapNativeAuthError(e);
    }
  }

  // Web path — unchanged.
  if (!auth) throw new Error("Firebase Auth not configured.");
  if (!ticket.confirmation) {
    throw new Error("Missing OTP confirmation — please tap Send OTP again.");
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

  // Local-only fallback (Firebase not configured at all).
  if (!auth && Platform.OS === "web") {
    (async () => {
      const u = await readLocalUser();
      if (u?.shopId) setActiveShopId(u.shopId);
      cb(u);
    })();
    return () => {};
  }

  // On native we also subscribe to the RNFB auth session so phone-OTP
  // sign-ins (which live entirely in the native session and never touch
  // the JS SDK auth) still drive AuthContext. Both listeners share the
  // same downstream `hydrate` helper so ordering doesn't matter: whoever
  // fires last wins, and RNFB currentUser + JS SDK currentUser are never
  // both non-null in practice because a user can only be authenticated
  // one way at a time on native.
  const dispose: (() => void)[] = [];

  const hydrate = async (rawUser: User | null) => {
    if (!rawUser) {
      setActiveShopId(null);
      cb(null);
      return;
    }
    try {
      const hydrated = await hydrateAppUser(rawUser);
      cb(hydrated);
    } catch (e) {
      console.warn("[auth] hydrateAppUser failed:", e);
      cb({
        uid: rawUser.uid,
        email: rawUser.email,
        displayName: rawUser.displayName,
        role: "shop_admin",
        shopId: null,
      });
    }
  };

  if (auth) {
    dispose.push(onAuthStateChanged(auth, hydrate));
  }

  if (Platform.OS !== "web") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const rnfb = require("@react-native-firebase/auth") as NativeAuthModule;
      const nativeAuth = rnfb.getAuth();
      const unsub = rnfb.onAuthStateChanged(nativeAuth, (nu) => {
        if (!nu) {
          // Only clear if the JS SDK also has no user — otherwise the JS
          // listener will handle it. Prevents flicker during hot-reload.
          if (!auth?.currentUser) hydrate(null);
          return;
        }
        const adapted: User = {
          uid: nu.uid,
          email: nu.email ?? null,
          phoneNumber: nu.phoneNumber ?? null,
          displayName: nu.displayName ?? null,
        } as unknown as User;
        hydrate(adapted);
      });
      dispose.push(unsub);
    } catch {
      // native module unavailable (Expo Go). JS SDK listener is enough.
    }
  }

  return () => {
    for (const d of dispose) {
      try {
        d();
      } catch {
        /* noop */
      }
    }
  };
}

export { isFirebaseConfigured };
