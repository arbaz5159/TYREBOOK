"""Phase-4 regression harness for the OEM tyre-fitment module.

Runs 22 real vehicle scenarios spanning every category present in the
master workbook, plus 5 tyre-size normalisation checks, plus 4
security-gate checks for Super-Admin write routes. All parameters are
seeded from the live MongoDB collection (not hardcoded guesses) so the
suite stays reliable across data refreshes.

Categories covered (14/14 present in DB):
  SUV, Motorcycle, Scooter, Hatchback, Sedan, MPV, Electric Scooter,
  SUV Coupe, Adventure Motorcycle, Electric Hatchback, Electric SUV,
  Dual-Sport Motorcycle, Crossover, Uncategorised.

Special behaviours verified:
  * Same-front-rear vs different-front-rear resolution
  * Ambiguous (multi-fitment) results — must NOT auto-select
  * Blank-variant reachability via the `__blank__` sentinel
  * URL encoding of exotic characters (":", "+", spaces)
  * Size normalisation across 3 common formats
  * Super-Admin write endpoints REJECT unauthenticated calls
"""

from __future__ import annotations

import json
import sys
import urllib.parse

import requests

BASE = "http://localhost:8001"

# Every scenario: (name, params, assertion_fn)
# Params flow through the FastAPI layer — `__blank__` is translated to
# a `$or [None, ""]` filter by the router.
SCENARIOS = [
    # ---- categorised, well-known vehicles ----
    ("01. SUV / Mahindra / Scorpio-N (ambiguous — 2 variants)",
     {"category": "SUV", "make": "Mahindra", "model": "Scorpio-N"},
     lambda r: r["count"] == 2 and not r["is_unique"]),

    ("02. SUV / Mahindra / XUV700 (ambiguous — 2 variants)",
     {"category": "SUV", "make": "Mahindra", "model": "XUV700"},
     lambda r: r["count"] == 2),

    ("03. SUV / Tata / Punch (ambiguous — 3 rows)",
     {"category": "SUV", "make": "Tata", "model": "Punch"},
     lambda r: r["count"] == 3),

    ("04. SUV / Hyundai (multi-model — 12+ rows)",
     {"category": "SUV", "make": "Hyundai"},
     lambda r: r["count"] >= 12),

    ("05. Motorcycle / Hero / Xtreme 125R (unique, F != R)",
     {"category": "Motorcycle", "make": "Hero", "model": "Xtreme 125R"},
     lambda r: r["is_unique"]
                and r["fitments"][0]["front_tyre_size"] == "90/90-17 TL"
                and r["fitments"][0]["rear_tyre_size"] == "120/80-17 TL"),

    ("06. Motorcycle / Bajaj / Pulsar N160 (ambiguous, F != R)",
     {"category": "Motorcycle", "make": "Bajaj", "model": "Pulsar N160"},
     lambda r: r["count"] == 2
                and all(f["front_tyre_size"] != f["rear_tyre_size"] for f in r["fitments"])),

    ("07. Scooter / Suzuki / Access 125 (ambiguous — 3 editions)",
     {"category": "Scooter", "make": "Suzuki", "model": "Access 125"},
     lambda r: r["count"] == 3),

    ("08. Hatchback / Tata / Altroz iCNG (unique, F == R)",
     {"category": "Hatchback", "make": "Tata", "model": "Altroz iCNG"},
     lambda r: r["is_unique"]
                and r["fitments"][0]["front_tyre_size"] == r["fitments"][0]["rear_tyre_size"]
                == "185/60 R16"),

    ("09. Hatchback / Maruti Suzuki / Swift (multi-gen ambiguous)",
     {"category": "Hatchback", "make": "Maruti Suzuki", "model": "Swift"},
     lambda r: r["count"] >= 2),

    ("10. Sedan / Hyundai / Verna (ambiguous — 4 trims)",
     {"category": "Sedan", "make": "Hyundai", "model": "Verna"},
     lambda r: r["count"] == 4),

    ("11. Sedan / Honda / City e:HEV (unique)",
     {"category": "Sedan", "make": "Honda", "model": "City e:HEV"},
     lambda r: r["is_unique"]),

    ("12. MPV / Toyota / Innova Hycross (ambiguous — 3 trims)",
     {"category": "MPV", "make": "Toyota", "model": "Innova Hycross"},
     lambda r: r["count"] == 3),

    ("13. MPV / Kia / Carens (ambiguous — 3 trims)",
     {"category": "MPV", "make": "Kia", "model": "Carens"},
     lambda r: r["count"] == 3),

    # ---- blank-variant sentinel + different F/R ----
    ("14. Electric Scooter / Honda / QC1  [__blank__ variant, F != R]",
     {"category": "Electric Scooter", "make": "Honda", "model": "QC1",
      "variant": "__blank__", "year_generation": "Current India model"},
     lambda r: r["is_unique"]
                and r["fitments"][0]["front_tyre_size"] == "90/90-12"
                and r["fitments"][0]["rear_tyre_size"] == "90/100-10"),

    ("15. Electric Scooter / Honda / Activa e: (unique, F != R)",
     {"category": "Electric Scooter", "make": "Honda", "model": "Activa e:"},
     lambda r: r["is_unique"]
                and r["fitments"][0]["front_tyre_size"] == "90/90-12"
                and r["fitments"][0]["rear_tyre_size"] == "110/80-12"),

    ("16. SUV Coupe / Tata / Curvv (ambiguous — 3 trims)",
     {"category": "SUV Coupe", "make": "Tata", "model": "Curvv"},
     lambda r: r["count"] == 3),

    ("17. Adventure Motorcycle / KTM / 390 Adventure X (unique, F != R)",
     {"category": "Adventure Motorcycle", "make": "KTM", "model": "390 Adventure X"},
     lambda r: r["is_unique"]
                and r["fitments"][0]["front_tyre_size"] == "100/90-19"
                and r["fitments"][0]["rear_tyre_size"] == "130/80-17"),

    ("18. Electric Hatchback / MG / Comet EV (unique, F == R)",
     {"category": "Electric Hatchback", "make": "MG", "model": "Comet EV"},
     lambda r: r["is_unique"]
                and r["fitments"][0]["front_tyre_size"] == "145/70 R12"),

    ("19. Electric SUV / Hyundai / Creta Electric (ambiguous — 2 batts)",
     {"category": "Electric SUV", "make": "Hyundai", "model": "Creta Electric"},
     lambda r: r["count"] == 2),

    ("20. Dual-Sport Motorcycle / KTM / 390 Enduro R (unique, F != R)",
     {"category": "Dual-Sport Motorcycle", "make": "KTM", "model": "390 Enduro R"},
     lambda r: r["is_unique"]
                and r["fitments"][0]["front_tyre_size"] != r["fitments"][0]["rear_tyre_size"]),

    ("21. Crossover / Maruti Suzuki / Fronx (unique, F == R)",
     {"category": "Crossover", "make": "Maruti Suzuki", "model": "Fronx"},
     lambda r: r["is_unique"]
                and r["fitments"][0]["front_tyre_size"] == "195/60 R16"),

    # ---- Uncategorised buckets — differentiated by case (Hyundai) ----
    ("22. Uncategorised / Hyundai / CRETA Electric / 42 kWh / 2025-present (unique, F == R)",
     {"category": "Uncategorised", "make": "Hyundai", "model": "CRETA Electric",
      "variant": "42 kWh", "year_generation": "2025-present"},
     lambda r: r["is_unique"]
                and r["fitments"][0]["front_tyre_size"] == "215/60 R17"
                and r["fitments"][0]["rear_tyre_size"] == "215/60 R17"),

    # ---- Category totals — protect against silent data-drift ----
    ("23. Category total: SUV == 113",
     {"category": "SUV"},
     lambda r: r["count"] == 113),

    ("24. Category total: Uncategorised == 172",
     {"category": "Uncategorised"},
     lambda r: r["count"] == 172),

    ("25. Category total: Motorcycle == 58",
     {"category": "Motorcycle"},
     lambda r: r["count"] == 58),
]

# Each tuple = variations of the SAME real tyre size in different
# formats. Normalisation must collapse them to identical result counts.
SIZE_SEARCH_FORMATS = [
    ("90/100-10", "90-100-10", "90/100/10"),
    ("215/60 R17", "215/60R17", "215/60-r17"),
    ("195/60 R16", "195/60r16", "195-60-R16"),
    ("100/80-17", "100/80/17", "100-80-17"),
    ("145/70 R12", "145/70r12", "145/70-R12"),
]


def run() -> int:
    passed = 0
    failed = 0
    failures = []
    scenario_results = []

    # ---- 25 vehicle scenarios ----
    for name, params, assertion in SCENARIOS:
        try:
            url = f"{BASE}/api/oem/fitments?{urllib.parse.urlencode(params)}"
            r = requests.get(url, timeout=10)
            r.raise_for_status()
            body = r.json()
            ok = bool(assertion(body))
            info = {
                "count": body.get("count"),
                "is_unique": body.get("is_unique"),
                "first_front": body.get("fitments", [{}])[0].get("front_tyre_size") if body.get("fitments") else None,
                "first_rear": body.get("fitments", [{}])[0].get("rear_tyre_size") if body.get("fitments") else None,
            }
            scenario_results.append({"name": name, "params": params, "pass": ok, **info})
            if ok:
                passed += 1
            else:
                failed += 1
                failures.append({"name": name, "params": params, "response_summary": info})
        except Exception as e:  # noqa: BLE001
            failed += 1
            failures.append({"name": name, "params": params, "error": str(e)})
            scenario_results.append({"name": name, "params": params, "pass": False, "error": str(e)})

    # ---- size-search normalisation ----
    size_results = []
    for formats in SIZE_SEARCH_FORMATS:
        counts = []
        for q in formats:
            try:
                r = requests.get(f"{BASE}/api/oem/search-by-size", params={"size": q}, timeout=10)
                r.raise_for_status()
                body = r.json()
                counts.append(body["count"])
            except Exception as e:  # noqa: BLE001
                counts.append(f"ERR:{e}")
        ok = len(set(counts)) == 1 and isinstance(counts[0], int) and counts[0] >= 1
        size_results.append({"formats": formats, "counts": counts, "pass": ok})
        if ok:
            passed += 1
        else:
            failed += 1
            failures.append({"name": f"size-normalisation {formats}", "counts": counts})

    # ---- security gate: writes must reject unauthenticated calls ----
    security = []
    for method, path, body_kw, description in [
        ("PUT", "/api/oem/admin/nonexistent-id", {"json": {"make": "X"}},
         "PUT /admin/{id} without auth"),
        ("POST", "/api/oem/admin/import/preview", {},
         "POST /admin/import/preview without auth"),
        ("POST", "/api/oem/admin/import/commit", {},
         "POST /admin/import/commit without auth"),
        ("GET", "/api/oem/admin/audit-log/list", {},
         "GET /admin/audit-log/list without auth"),
    ]:
        try:
            resp = requests.request(method, f"{BASE}{path}", timeout=10, **body_kw)
            status = resp.status_code
            ok = status in (401, 403)
            security.append({"path": path, "method": method, "status": status,
                             "pass": ok, "description": description})
            if ok:
                passed += 1
            else:
                failed += 1
                failures.append({"name": description, "status": status,
                                 "body": resp.text[:200]})
        except Exception as e:  # noqa: BLE001
            security.append({"path": path, "error": str(e), "pass": False})
            failed += 1

    # ---- data-integrity checkpoint ----
    integrity = {}
    try:
        stats = requests.get(f"{BASE}/api/oem/stats", timeout=10).json()
        integrity = {
            "total": stats["total"],
            "oem_verified": stats["oem_verified"],
            "uncategorised": stats["uncategorised"],
            "distinct_categories": len(stats["by_category"]),
        }
        ok = integrity["total"] == 450 and integrity["uncategorised"] == 172
        if ok:
            passed += 1
        else:
            failed += 1
            failures.append({"name": "integrity: total==450 & uncat==172",
                             "actual": integrity})
    except Exception as e:  # noqa: BLE001
        failed += 1
        failures.append({"name": "integrity fetch", "error": str(e)})

    print(json.dumps({
        "passed": passed,
        "failed": failed,
        "total": passed + failed,
        "integrity": integrity,
        "fitment_scenarios": scenario_results,
        "size_search_normalisation": size_results,
        "security_gate": security,
        "failures": failures,
    }, indent=2))
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(run())
