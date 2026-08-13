// Client for the Phase-1 OEM read-only endpoints.
// All calls hit `${EXPO_PUBLIC_BACKEND_URL}/api/oem/*` — the same base
// the OCR client uses.
//
// This module is intentionally free of Firebase / tenant scoping — the
// OEM master is a GLOBAL platform database shared by every shop.

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";

export interface OemFitment {
  id: string;
  no: number | null;
  source_pass: number | null;
  category: string | null;
  make: string;
  model: string;
  variant: string;
  year_generation: string;
  front_tyre_size: string;
  rear_tyre_size: string;
  verification_status: string;
  oem_evidence: string;
  oem_source_url: string;
  front_size_normalized: string;
  rear_size_normalized: string;
  _category_review_required?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface OemStats {
  total: number;
  oem_verified: number;
  uncategorised: number;
  by_category: { category: string; count: number }[];
}

export const OEM_UNCATEGORISED_LABEL = "Uncategorised";
// Sentinel returned by the backend distinct endpoints when a source
// cell is blank. UI must translate this to a user-friendly label but
// pass the raw value back to the API when the user selects it.
export const OEM_BLANK_SENTINEL = "__blank__";
export const OEM_BLANK_DISPLAY = "(not specified)";

/** Convert a raw distinct value into the string the UI should show.
 *  The picker still stores the ORIGINAL sentinel so it can be passed
 *  back to the filter endpoints verbatim. */
export function oemDisplayLabel(v: string): string {
  return v === OEM_BLANK_SENTINEL ? OEM_BLANK_DISPLAY : v;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OEM API ${res.status}: ${body.slice(0, 200) || res.statusText}`);
  }
  return (await res.json()) as T;
}

function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export async function oemHealth(): Promise<{ ok: boolean; collection: string; total_documents: number }> {
  return getJson("/api/oem/health");
}

export async function oemStats(): Promise<OemStats> {
  return getJson("/api/oem/stats");
}

export async function oemCategories(): Promise<string[]> {
  const r = await getJson<{ categories: string[] }>("/api/oem/categories");
  return r.categories;
}

export async function oemMakes(category?: string | null): Promise<string[]> {
  const r = await getJson<{ makes: string[] }>(`/api/oem/makes${qs({ category })}`);
  return r.makes;
}

export async function oemModels(category?: string | null, make?: string | null): Promise<string[]> {
  const r = await getJson<{ models: string[] }>(`/api/oem/models${qs({ category, make })}`);
  return r.models;
}

export async function oemVariants(
  category?: string | null,
  make?: string | null,
  model?: string | null,
): Promise<string[]> {
  const r = await getJson<{ variants: string[] }>(
    `/api/oem/variants${qs({ category, make, model })}`,
  );
  return r.variants;
}

export async function oemYears(
  category?: string | null,
  make?: string | null,
  model?: string | null,
  variant?: string | null,
): Promise<string[]> {
  const r = await getJson<{ years: string[] }>(
    `/api/oem/years${qs({ category, make, model, variant })}`,
  );
  return r.years;
}

export interface FitmentQueryResult {
  count: number;
  is_unique: boolean;
  fitments: OemFitment[];
}

export async function oemFitments(input: {
  category?: string | null;
  make?: string | null;
  model?: string | null;
  variant?: string | null;
  year_generation?: string | null;
}): Promise<FitmentQueryResult> {
  return getJson<FitmentQueryResult>(`/api/oem/fitments${qs(input)}`);
}

export interface SearchBySizeResult {
  query: string;
  normalized: string;
  count: number;
  vehicles: OemFitment[];
}

export async function oemSearchBySize(size: string): Promise<SearchBySizeResult> {
  return getJson<SearchBySizeResult>(`/api/oem/search-by-size${qs({ size })}`);
}

// ---------------------------------------------------------------------------
// Admin (Super-Admin only) endpoints
// ---------------------------------------------------------------------------
// All admin calls pass a Firebase ID token in `Authorization: Bearer <token>`.
// The backend verifies the signature + email allow-list via `oem_auth.py`.
// We accept the token as an explicit argument so React components can call
// `firebase.auth().currentUser?.getIdToken()` once and reuse it across calls.

async function getJsonAuth<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OEM API ${res.status}: ${body.slice(0, 400) || res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface OemAdminListResult {
  total: number;
  page: number;
  page_size: number;
  rows: OemFitment[];
}

/** No auth required — the read endpoint is safe for all authenticated users.
 *  We still pass the Firebase token so the audit trail can attribute reads
 *  if we later choose to log them. */
export async function oemAdminList(
  input: {
    category?: string | null;
    make?: string | null;
    model?: string | null;
    size?: string | null;
    needs_review?: boolean | null;
    page?: number;
    page_size?: number;
  } = {},
): Promise<OemAdminListResult> {
  return getJson<OemAdminListResult>(`/api/oem/admin/list${qs(input)}`);
}

export async function oemAdminGet(id: string): Promise<OemFitment> {
  return getJson<OemFitment>(`/api/oem/admin/${encodeURIComponent(id)}`);
}

export interface OemEditResult {
  ok: boolean;
  unchanged?: boolean;
  changed?: string[];
  fitment: OemFitment;
}

export async function oemAdminUpdate(
  id: string,
  patch: Partial<OemFitment>,
  token: string,
): Promise<OemEditResult> {
  const res = await fetch(`${BASE}/api/oem/admin/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OEM API ${res.status}: ${body.slice(0, 400) || res.statusText}`);
  }
  return (await res.json()) as OemEditResult;
}

export interface OemImportPreview {
  ok: boolean;
  error?: string;
  expected_headers?: string[];
  got_headers?: string[];
  sheet?: string;
  excel_rows_on_disk?: number;
  invalid_rows: { row: number; missing: string[] }[];
  conflicts: {
    row: number;
    existing_id: string;
    diff_fields: string[];
    existing: Record<string, unknown>;
    incoming: Record<string, unknown>;
  }[];
  duplicates: {
    row: number;
    duplicate_of_row: number;
    make?: string;
    model?: string;
    variant?: string;
  }[];
  new_rows: {
    row: number;
    make?: string;
    model?: string;
    variant?: string;
    year_generation?: string;
    front_tyre_size?: string;
    rear_tyre_size?: string;
  }[];
  counts: {
    excel_rows_on_disk: number;
    prepared: number;
    invalid: number;
    conflicts: number;
    duplicates_within_file: number;
    new_rows: number | null;
  };
  actor_email?: string;
}

export async function oemAdminImportPreview(
  file: { uri: string; name: string; type: string } | Blob,
  token: string,
): Promise<OemImportPreview> {
  const form = new FormData();
  // React Native accepts { uri, name, type }; Web wants a real File/Blob.
  form.append("file", file as any);
  const res = await fetch(`${BASE}/api/oem/admin/import/preview`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Import preview ${res.status}: ${body.slice(0, 400) || res.statusText}`);
  }
  return (await res.json()) as OemImportPreview;
}

export interface OemImportCommitResult {
  ok: boolean;
  added: number;
  overwritten: number;
  skipped_conflicts_awaiting_review: number;
  invalid_rows: { row: number; missing: string[] }[];
  final_count: number;
}

export async function oemAdminImportCommit(
  file: { uri: string; name: string; type: string } | Blob,
  overwrite_conflicts: boolean,
  token: string,
): Promise<OemImportCommitResult> {
  const form = new FormData();
  form.append("file", file as any);
  const url = `${BASE}/api/oem/admin/import/commit?overwrite_conflicts=${overwrite_conflicts ? "true" : "false"}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Import commit ${res.status}: ${body.slice(0, 400) || res.statusText}`);
  }
  return (await res.json()) as OemImportCommitResult;
}

export interface OemAuditEntry {
  id: string;
  action: "edit" | "import-insert" | "import-overwrite";
  fitment_id: string | null;
  actor_uid: string | null;
  actor_email: string | null;
  changed_fields: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  extra: Record<string, unknown>;
  timestamp: string;
}

export interface OemAuditListResult {
  total: number;
  page: number;
  page_size: number;
  rows: OemAuditEntry[];
}

export async function oemAdminAuditList(
  token: string,
  input: { fitment_id?: string | null; page?: number; page_size?: number } = {},
): Promise<OemAuditListResult> {
  return getJsonAuth<OemAuditListResult>(`/api/oem/admin/audit-log/list${qs(input)}`, token);
}

/**
 * Fetch a fresh Firebase ID token for the currently signed-in user.
 * Throws if the caller is not signed in.
 */
export async function getFirebaseIdToken(): Promise<string> {
  // Late import — the auth SDK is only needed on admin screens.
  const { getFirebaseAuth } = await import("@/src/firebase/config");
  const auth = getFirebaseAuth();
  if (!auth || !auth.currentUser) {
    throw new Error("You must be signed in as a Super Admin to perform this action.");
  }
  return auth.currentUser.getIdToken(/* forceRefresh */ false);
}
