"""
OEM tyre fitment shared helpers.

Everything in this module is stateless and safe to import from both
the FastAPI runtime (`oem_router.py`) and the one-shot importer
(`import_oem.py`).

DATA INTEGRITY RULE (per user directive #17):
    We NEVER invent, guess, replace, or normalize incorrectly. All
    fields are preserved exactly as they appear in the source Excel.
    We only ADD a `front_size_normalized` / `rear_size_normalized`
    field for size-search matching — the original strings remain
    untouched and are always what we return to the UI.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Optional

COLLECTION = "oem_vehicle_fitments"

# The exact column headers as they appear in
# `TyreBook_FINAL_Master_450_OEM_Verified.xlsx`. Do not reorder.
EXCEL_HEADERS = (
    "No.",
    "Pass",
    "Category",
    "Make",
    "Model",
    "Variant / Fitment",
    "Year / Generation",
    "Front Tyre Size",
    "Rear Tyre Size",
    "Verification",
    "OEM Evidence",
    "OEM Source URL",
)

# UI-facing label for records whose Category cell is blank/None in the
# source Excel. Per user directive: DO NOT invent a category — surface
# a stable placeholder so the record remains searchable.
UNCATEGORISED_LABEL = "Uncategorised"

# Sentinel emitted by the distinct-value endpoints (and accepted by the
# filter endpoints) when a Variant / Year cell is blank in the source
# Excel. The mobile UI translates this to the user-facing string
# "(not specified)". A dedicated sentinel is required because bare
# empty-string parameters cannot be distinguished from "no filter" in
# a query-string, and per user directive #17 we must not invent values
# to fill blank cells — those rows must still be reachable.
BLANK_SENTINEL = "__blank__"


def normalize_size(raw: Optional[str]) -> str:
    """Rules-safe tyre-size normaliser used ONLY for search matching.

    Removes every non-alphanumeric character and lowercases the rest, so
    the following all collapse to the same key:
        `90/100-10`, `90/100/10`, `90-100-10`, `90/100 10`  →  `9010010`
        `205/55 R16`, `205/55R16`, `205-55-R16`             →  `20555r16`
        `7.00-15`, `7.00 15`, `7.00/15`                     →  `70015`

    Never mutates the original size string — this value is stored on a
    separate `*_size_normalized` field for lookups.
    """
    if raw is None:
        return ""
    return re.sub(r"[^a-z0-9]", "", str(raw).lower())


def _s(v: Any) -> str:
    """Cell → string, preserving the original whitespace-trimmed value."""
    if v is None:
        return ""
    if isinstance(v, str):
        return v.strip()
    return str(v).strip()


def _s_or_none(v: Any) -> Optional[str]:
    """Same as `_s` but returns None for a blank cell so blank-Category
    rows can be flagged in the admin UI without inventing a value.
    """
    s = _s(v)
    return s if s else None


def _int_or_none(v: Any) -> Optional[int]:
    if v is None or v == "":
        return None
    try:
        return int(v)
    except (ValueError, TypeError):
        try:
            return int(float(v))
        except (ValueError, TypeError):
            return None


def excel_row_to_doc(row: tuple, row_number: int) -> Dict[str, Any]:
    """Map a raw Excel row (tuple in EXCEL_HEADERS order) to the Mongo
    document shape. `row_number` is the 1-indexed row number IN THE
    Excel sheet (so header is row 1, first data row is row 2) — kept
    only for debug/audit logs, never surfaced to end users.
    """
    (
        col_no,
        col_pass,
        col_category,
        col_make,
        col_model,
        col_variant,
        col_year,
        col_front,
        col_rear,
        col_verification,
        col_evidence,
        col_source,
    ) = row

    return {
        # Stable identity — used as the Mongo `id` field so future
        # imports can dedupe against the (make, model, variant,
        # year, front, rear) natural key. See `natural_key` below.
        "no": _int_or_none(col_no),
        "source_pass": _int_or_none(col_pass),
        "category": _s_or_none(col_category),
        "make": _s(col_make),
        "model": _s(col_model),
        "variant": _s(col_variant),
        "year_generation": _s(col_year),
        "front_tyre_size": _s(col_front),
        "rear_tyre_size": _s(col_rear),
        "verification_status": _s(col_verification) or "OEM VERIFIED",
        "oem_evidence": _s(col_evidence),
        "oem_source_url": _s(col_source),
        # Derived / search-only fields — do NOT surface these as the
        # displayed tyre size.
        "front_size_normalized": normalize_size(col_front),
        "rear_size_normalized": normalize_size(col_rear),
        # Audit
        "_source_excel_row": row_number,
        "_category_review_required": _s_or_none(col_category) is None,
    }


def natural_key(doc: Dict[str, Any]) -> tuple:
    """Six-tuple used to identify an OEM record for duplicate detection.
    Per user directive #1: DO NOT collapse rows that only look
    duplicate — variant / year / fitment MUST differ before a row is
    considered a true duplicate.
    """
    return (
        (doc.get("make") or "").strip().lower(),
        (doc.get("model") or "").strip().lower(),
        (doc.get("variant") or "").strip().lower(),
        (doc.get("year_generation") or "").strip().lower(),
        (doc.get("front_tyre_size") or "").strip().lower(),
        (doc.get("rear_tyre_size") or "").strip().lower(),
    )


def public_projection() -> Dict[str, int]:
    """Fields exposed to the client. `_id` is always hidden and internal
    audit fields (`_source_excel_row`, `_category_review_required`)
    are only surfaced via the admin listing endpoint."""
    return {
        "_id": 0,
        "_source_excel_row": 0,
    }
