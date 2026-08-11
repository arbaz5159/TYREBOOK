"""OEM tyre fitment read-only query endpoints.

Phase 1 delivers ONLY read/search endpoints — they are safe to expose
to every authenticated app user (Shop Admin + Staff). Admin write
endpoints (edit, Excel-import) will be added in Phase 4 with Firebase
ID-token verification against the Super Admin allow-list.

All endpoints:
    GET /api/oem/health
    GET /api/oem/stats
    GET /api/oem/categories
    GET /api/oem/makes?category=...
    GET /api/oem/models?category=...&make=...
    GET /api/oem/variants?category=...&make=...&model=...
    GET /api/oem/years?category=...&make=...&model=...&variant=...
    GET /api/oem/fitments?category=...&make=...&model=...&variant=...&year_generation=...
    GET /api/oem/search-by-size?size=...
    GET /api/oem/admin/list?...   (Phase 1 exposes read-only; write is Phase 4)

Design notes:
    * We deliberately DO NOT paginate distinct-value endpoints — the
      OEM master has ~450 rows today and even at 50k the distinct
      Make list is still under a few hundred. The admin list is
      paginated because it returns every row.
    * "Uncategorised" (per user directive #3) is a client-visible label
      for the subset whose source `category` cell is None. Callers pass
      the literal string "Uncategorised" and we translate it to a
      `{"$or": [{"category": None}, {"category": ""}]}` filter.
    * Size normalisation is done in `oem_utils.normalize_size`. The
      exact original size string is always returned to the UI —
      normalisation is used ONLY for the query.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from oem_utils import (
    COLLECTION,
    UNCATEGORISED_LABEL,
    normalize_size,
    public_projection,
)


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(prefix="/oem", tags=["oem"])
    coll = db[COLLECTION]

    # ------------------------------------------------------------
    # Filter helpers
    # ------------------------------------------------------------
    def _category_filter(category: Optional[str]) -> Dict[str, Any]:
        """`Uncategorised` maps to blank/None category rows. Any other
        value is an exact match. `None`/`""` means "no filter"."""
        if category is None or category == "":
            return {}
        if category == UNCATEGORISED_LABEL:
            return {"$or": [{"category": None}, {"category": ""}]}
        return {"category": category}

    def _exact(field: str, value: Optional[str]) -> Dict[str, Any]:
        if value is None or value == "":
            return {}
        return {field: value}

    def _combine(*parts: Dict[str, Any]) -> Dict[str, Any]:
        merged: Dict[str, Any] = {}
        for p in parts:
            if not p:
                continue
            # If merging two $or clauses we need $and to combine safely.
            if "$or" in merged and "$or" in p:
                merged.setdefault("$and", []).append({"$or": merged.pop("$or")})
                merged["$and"].append({"$or": p["$or"]})
            elif "$or" in merged and "$or" not in p:
                merged.setdefault("$and", []).append({"$or": merged.pop("$or")})
                merged["$and"].append(p)
            elif "$or" in p and "$or" not in merged:
                if merged:
                    merged = {"$and": [merged, {"$or": p["$or"]}]}
                else:
                    merged["$or"] = p["$or"]
            else:
                merged.update(p)
        return merged

    async def _distinct(field: str, filt: Dict[str, Any]) -> List[str]:
        raw = await coll.distinct(field, filt)
        # Normalise None → UNCATEGORISED_LABEL for the "category" field
        # only. All other fields keep their original value.
        if field == "category":
            out = []
            for v in raw:
                if v is None or v == "":
                    out.append(UNCATEGORISED_LABEL)
                else:
                    out.append(v)
        else:
            out = [v for v in raw if v is not None and v != ""]
        # Deduplicate + case-insensitive sort so the mobile dropdown
        # feels natural. We keep the ORIGINAL casing from the data.
        seen = {}
        for v in out:
            key = v.lower()
            if key not in seen:
                seen[key] = v
        return sorted(seen.values(), key=lambda x: x.lower())

    # ------------------------------------------------------------
    # /health, /stats
    # ------------------------------------------------------------
    @router.get("/health")
    async def health():
        try:
            total = await coll.count_documents({})
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"db error: {e}")
        return {
            "ok": True,
            "collection": COLLECTION,
            "total_documents": total,
        }

    @router.get("/stats")
    async def stats():
        total = await coll.count_documents({})
        oem_verified = await coll.count_documents({"verification_status": "OEM VERIFIED"})
        uncategorised = await coll.count_documents(
            {"$or": [{"category": None}, {"category": ""}]}
        )
        # per-category counts
        pipeline = [
            {"$group": {"_id": "$category", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]
        buckets = []
        async for row in coll.aggregate(pipeline):
            label = row["_id"] if row["_id"] not in (None, "") else UNCATEGORISED_LABEL
            buckets.append({"category": label, "count": row["count"]})
        return {
            "total": total,
            "oem_verified": oem_verified,
            "uncategorised": uncategorised,
            "by_category": buckets,
        }

    # ------------------------------------------------------------
    # Dropdown cascade
    # ------------------------------------------------------------
    @router.get("/categories")
    async def list_categories():
        values = await _distinct("category", {})
        return {"categories": values}

    @router.get("/makes")
    async def list_makes(category: Optional[str] = Query(default=None)):
        filt = _category_filter(category)
        values = await _distinct("make", filt)
        return {"makes": values}

    @router.get("/models")
    async def list_models(
        category: Optional[str] = Query(default=None),
        make: Optional[str] = Query(default=None),
    ):
        filt = _combine(_category_filter(category), _exact("make", make))
        values = await _distinct("model", filt)
        return {"models": values}

    @router.get("/variants")
    async def list_variants(
        category: Optional[str] = Query(default=None),
        make: Optional[str] = Query(default=None),
        model: Optional[str] = Query(default=None),
    ):
        filt = _combine(
            _category_filter(category),
            _exact("make", make),
            _exact("model", model),
        )
        values = await _distinct("variant", filt)
        return {"variants": values}

    @router.get("/years")
    async def list_years(
        category: Optional[str] = Query(default=None),
        make: Optional[str] = Query(default=None),
        model: Optional[str] = Query(default=None),
        variant: Optional[str] = Query(default=None),
    ):
        filt = _combine(
            _category_filter(category),
            _exact("make", make),
            _exact("model", model),
            _exact("variant", variant),
        )
        values = await _distinct("year_generation", filt)
        return {"years": values}

    # ------------------------------------------------------------
    # Fitment resolution
    # ------------------------------------------------------------
    @router.get("/fitments")
    async def list_fitments(
        category: Optional[str] = Query(default=None),
        make: Optional[str] = Query(default=None),
        model: Optional[str] = Query(default=None),
        variant: Optional[str] = Query(default=None),
        year_generation: Optional[str] = Query(default=None),
    ):
        """Return every OEM fitment matching the filters. The Vehicle
        Search UI is expected to keep prompting until a unique row
        remains (per user directives #4 and #11). If more than one row
        comes back the UI must NOT auto-select — it must ask the user
        to disambiguate.
        """
        filt = _combine(
            _category_filter(category),
            _exact("make", make),
            _exact("model", model),
            _exact("variant", variant),
            _exact("year_generation", year_generation),
        )
        rows: List[Dict[str, Any]] = []
        cursor = coll.find(filt, public_projection()).sort(
            [("make", 1), ("model", 1), ("variant", 1), ("year_generation", 1)]
        )
        async for r in cursor:
            rows.append(r)
        return {
            "count": len(rows),
            "is_unique": len(rows) == 1,
            "fitments": rows,
        }

    # ------------------------------------------------------------
    # Search by tyre size (both front and rear)
    # ------------------------------------------------------------
    @router.get("/search-by-size")
    async def search_by_size(
        size: str = Query(..., min_length=2, description="Tyre size in any common format"),
    ):
        norm = normalize_size(size)
        if not norm:
            raise HTTPException(status_code=400, detail="empty size")
        # `$or` because the same size can appear as either front or rear.
        filt = {
            "$or": [
                {"front_size_normalized": norm},
                {"rear_size_normalized": norm},
            ]
        }
        rows = []
        cursor = coll.find(filt, public_projection()).sort([("make", 1), ("model", 1)])
        async for r in cursor:
            rows.append(r)
        return {
            "query": size,
            "normalized": norm,
            "count": len(rows),
            "vehicles": rows,
        }

    # ------------------------------------------------------------
    # Admin (read-only in Phase 1 — Phase 4 will add write)
    # ------------------------------------------------------------
    @router.get("/admin/list")
    async def admin_list(
        category: Optional[str] = Query(default=None),
        make: Optional[str] = Query(default=None),
        model: Optional[str] = Query(default=None),
        size: Optional[str] = Query(default=None),
        needs_review: Optional[bool] = Query(default=None,
            description="If true, return only rows whose Category is blank."),
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=50, ge=1, le=500),
    ):
        parts: List[Dict[str, Any]] = []
        if category:
            parts.append(_category_filter(category))
        if make:
            parts.append({"make": make})
        if model:
            parts.append({"model": model})
        if size:
            norm = normalize_size(size)
            parts.append({
                "$or": [
                    {"front_size_normalized": norm},
                    {"rear_size_normalized": norm},
                ]
            })
        if needs_review is True:
            parts.append({"_category_review_required": True})
        elif needs_review is False:
            parts.append({"_category_review_required": {"$ne": True}})
        filt = _combine(*parts)

        total = await coll.count_documents(filt)
        skip = (page - 1) * page_size
        # Admin listing exposes _category_review_required so the UI can
        # badge rows, so we do NOT hide it via the projection.
        proj = {"_id": 0, "_source_excel_row": 0}
        rows = []
        cursor = coll.find(filt, proj).sort(
            [("make", 1), ("model", 1), ("variant", 1), ("year_generation", 1)]
        ).skip(skip).limit(page_size)
        async for r in cursor:
            rows.append(r)
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "rows": rows,
        }

    @router.get("/admin/{fitment_id}")
    async def admin_get(fitment_id: str):
        row = await coll.find_one({"id": fitment_id}, {"_id": 0})
        if not row:
            raise HTTPException(status_code=404, detail="OEM fitment not found")
        return row

    return router
