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
