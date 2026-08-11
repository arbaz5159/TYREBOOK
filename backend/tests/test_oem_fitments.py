"""OEM Vehicle Fitments API - Phase 1 read-only endpoint tests.

Tests every /api/oem/* endpoint against the user-critical invariants
listed in the review request. Also includes regression tests for the
existing TyreBook endpoints (/api/, /api/status, /api/purchases/*).
"""
import os
import pytest
import requests

# Public URL only - matches ingress config
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get(
    "EXPO_BACKEND_URL"
) or "https://tire-inventory-app-1.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")

EXPECTED_CATEGORY_COUNTS = {
    "SUV": 113,
    "Motorcycle": 58,
    "Hatchback": 36,
    "Sedan": 31,
    "MPV": 10,
    "Electric Scooter": 9,
    "Scooter": 7,
    "SUV Coupe": 5,
    "Adventure Motorcycle": 3,
    "Electric SUV": 2,
    "Electric Hatchback": 2,
    "Dual-Sport Motorcycle": 1,
    "Crossover": 1,
    "Uncategorised": 172,
}


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ------------------------------------------------------------------
# Invariants: total docs, verification_status, uncategorised count
# ------------------------------------------------------------------
class TestInvariants:
    def test_health_total_is_450(self, api):
        r = api.get(f"{BASE_URL}/api/oem/health")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["total_documents"] == 450, f"Expected 450, got {data['total_documents']}"

    def test_stats_totals_and_breakdown(self, api):
        r = api.get(f"{BASE_URL}/api/oem/stats")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 450
        assert data["oem_verified"] == 450, (
            f"All 450 docs must be OEM VERIFIED, got {data['oem_verified']}"
        )
        assert data["uncategorised"] == 172
        actual = {b["category"]: b["count"] for b in data["by_category"]}
        # print for proof of import
        print("STATS BREAKDOWN:", actual)
        assert actual == EXPECTED_CATEGORY_COUNTS, (
            f"Category breakdown mismatch.\nExpected: {EXPECTED_CATEGORY_COUNTS}\nActual:   {actual}"
        )


# ------------------------------------------------------------------
# Categories / makes / models / variants / years
# ------------------------------------------------------------------
class TestDropdowns:
    def test_categories_endpoint(self, api):
        r = api.get(f"{BASE_URL}/api/oem/categories")
        assert r.status_code == 200
        cats = r.json()["categories"]
        assert len(cats) == 14, f"Expected 14 categories, got {len(cats)}: {cats}"
        assert "Uncategorised" in cats
        # Case-insensitive alphabetical order
        sorted_ci = sorted(cats, key=lambda x: x.lower())
        assert cats == sorted_ci, f"Categories not sorted case-insensitively: {cats}"

    def test_makes_for_suv(self, api):
        r = api.get(f"{BASE_URL}/api/oem/makes", params={"category": "SUV"})
        assert r.status_code == 200
        makes = r.json()["makes"]
        assert len(makes) > 0
        assert len(makes) == len(set(makes)), "Makes must be unique"
        assert makes == sorted(makes, key=lambda x: x.lower())

    def test_makes_for_uncategorised(self, api):
        r = api.get(f"{BASE_URL}/api/oem/makes", params={"category": "Uncategorised"})
        assert r.status_code == 200
        makes = r.json()["makes"]
        assert len(makes) > 0, "Uncategorised must contain 172 rows with makes"

    def test_models_hyundai_includes_creta_electric(self, api):
        r = api.get(f"{BASE_URL}/api/oem/models", params={"make": "Hyundai"})
        assert r.status_code == 200
        models = r.json()["models"]
        assert len(models) > 0
        assert "CRETA Electric" in models, f"CRETA Electric missing: {models}"

    def test_variants_hyundai_creta_electric(self, api):
        r = api.get(
            f"{BASE_URL}/api/oem/variants",
            params={"make": "Hyundai", "model": "CRETA Electric"},
        )
        assert r.status_code == 200
        variants = r.json()["variants"]
        for expected in ("42 kWh", "51.4 kWh", "51.4 kWh Long Range"):
            assert expected in variants, f"'{expected}' missing in {variants}"

    def test_years_hyundai_creta_electric_42kwh(self, api):
        r = api.get(
            f"{BASE_URL}/api/oem/years",
            params={"make": "Hyundai", "model": "CRETA Electric", "variant": "42 kWh"},
        )
        assert r.status_code == 200
        years = r.json()["years"]
        assert len(years) > 0, f"Expected non-empty years, got {years}"


# ------------------------------------------------------------------
# Fitments endpoint
# ------------------------------------------------------------------
class TestFitments:
    def test_fitments_creta_electric_42kwh(self, api):
        r = api.get(
            f"{BASE_URL}/api/oem/fitments",
            params={"make": "Hyundai", "model": "CRETA Electric", "variant": "42 kWh"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["count"] >= 1
        assert isinstance(data["is_unique"], bool)
        for f in data["fitments"]:
            assert f["front_tyre_size"] == "215/60 R17", (
                f"Front size mismatch: {f['front_tyre_size']}"
            )
            assert f["rear_tyre_size"] == "215/60 R17", (
                f"Rear size mismatch: {f['rear_tyre_size']}"
            )

    def test_fitments_unique_with_year(self, api):
        r = api.get(
            f"{BASE_URL}/api/oem/fitments",
            params={
                "make": "Hyundai",
                "model": "CRETA Electric",
                "variant": "42 kWh",
                "year_generation": "2025-present",
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["is_unique"] is True, (
            f"Expected unique match; got count={data['count']}, fitments={data['fitments']}"
        )
        assert data["count"] == 1


# ------------------------------------------------------------------
# Search-by-size normalisation
# ------------------------------------------------------------------
class TestSearchBySize:
    def test_size_variants_return_same_normalized(self, api):
        variants = ["215/60 R17", "215/60-R17", "215/60r17", "215%2F60%20R17"]
        results = []
        for v in variants:
            # requests will re-encode; use raw url for the pre-encoded one
            if "%" in v:
                r = api.get(f"{BASE_URL}/api/oem/search-by-size?size={v}")
            else:
                r = api.get(f"{BASE_URL}/api/oem/search-by-size", params={"size": v})
            assert r.status_code == 200, f"{v} -> {r.status_code} {r.text}"
            results.append(r.json())
        norms = {res["normalized"] for res in results}
        counts = {res["count"] for res in results}
        assert len(norms) == 1, f"Normalized values differ: {norms}"
        assert len(counts) == 1, f"Counts differ across size variants: {counts}"

    def test_honda_qc1_front_neq_rear(self, api):
        # 90/100-10 is the REAR of Honda QC1; F: 90/90-12
        r1 = api.get(f"{BASE_URL}/api/oem/search-by-size", params={"size": "90/100-10"})
        r2 = api.get(f"{BASE_URL}/api/oem/search-by-size", params={"size": "90-100-10"})
        assert r1.status_code == 200 and r2.status_code == 200
        d1, d2 = r1.json(), r2.json()
        assert d1["count"] == d2["count"], (
            f"Different counts for equivalent sizes: {d1['count']} vs {d2['count']}"
        )
        assert d1["normalized"] == d2["normalized"]
        # Verify at least one match is a Honda whose front differs from rear
        matches = [
            v for v in d1["vehicles"]
            if v.get("make", "").lower() == "honda"
            and v.get("front_tyre_size", "") != v.get("rear_tyre_size", "")
        ]
        assert len(matches) >= 1, (
            f"Expected Honda front!=rear match in 90/100-10 search; got {d1['vehicles']}"
        )

    def test_empty_size_rejected(self, api):
        r = api.get(f"{BASE_URL}/api/oem/search-by-size", params={"size": "  "})
        # 400 empty size OR 422 validation error (min_length=2)
        assert r.status_code in (400, 422), r.text


# ------------------------------------------------------------------
# Admin listing (read-only in Phase 1)
# ------------------------------------------------------------------
class TestAdminList:
    def test_admin_list_pagination(self, api):
        r = api.get(f"{BASE_URL}/api/oem/admin/list", params={"page": 1, "page_size": 25})
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 450
        assert len(data["rows"]) <= 25
        # rows should be sorted by (make, model, variant, year)
        keys = [
            (r.get("make", ""), r.get("model", ""), r.get("variant", ""), r.get("year_generation", ""))
            for r in data["rows"]
        ]
        assert keys == sorted(keys), "admin/list rows not sorted"

    def test_admin_list_needs_review(self, api):
        r = api.get(f"{BASE_URL}/api/oem/admin/list", params={"needs_review": "true", "page_size": 500})
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 172, f"Expected 172 needs-review rows, got {data['total']}"
        for row in data["rows"]:
            assert row.get("_category_review_required") is True
            assert row.get("category") is None

    def test_admin_list_filter_suv_hyundai(self, api):
        r = api.get(
            f"{BASE_URL}/api/oem/admin/list",
            params={"category": "SUV", "make": "Hyundai", "page_size": 500},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["total"] > 0
        for row in data["rows"]:
            assert row.get("category") == "SUV"
            assert row.get("make") == "Hyundai"

    def test_admin_get_valid_id(self, api):
        # Grab a row from listing
        r = api.get(f"{BASE_URL}/api/oem/admin/list", params={"page_size": 1})
        assert r.status_code == 200
        row = r.json()["rows"][0]
        fid = row["id"]
        r2 = api.get(f"{BASE_URL}/api/oem/admin/{fid}")
        assert r2.status_code == 200
        got = r2.json()
        assert got["id"] == fid
        assert got["make"] == row["make"]

    def test_admin_get_unknown_id_404(self, api):
        r = api.get(f"{BASE_URL}/api/oem/admin/definitely-not-a-real-id-xyz-999")
        assert r.status_code == 404

    def test_original_tyre_size_preserved(self, api):
        # Pick any doc and confirm front_tyre_size is a non-empty string preserved as-is
        r = api.get(f"{BASE_URL}/api/oem/admin/list", params={"page_size": 5})
        rows = r.json()["rows"]
        for row in rows:
            assert isinstance(row.get("front_tyre_size"), str)
            assert row["front_tyre_size"] != ""


# ------------------------------------------------------------------
# No write endpoints exposed in Phase 1
# ------------------------------------------------------------------
class TestNoWriteEndpoints:
    def test_admin_post_not_allowed(self, api):
        r = api.post(f"{BASE_URL}/api/oem/admin/list", json={"foo": "bar"})
        assert r.status_code in (404, 405), f"unexpected {r.status_code}"

    def test_admin_put_not_allowed(self, api):
        # Try updating a fitment via PUT
        r = api.put(f"{BASE_URL}/api/oem/admin/some-id", json={"make": "X"})
        assert r.status_code in (404, 405)

    def test_admin_delete_not_allowed(self, api):
        r = api.delete(f"{BASE_URL}/api/oem/admin/some-id")
        assert r.status_code in (404, 405)

    def test_fitments_post_not_allowed(self, api):
        r = api.post(f"{BASE_URL}/api/oem/fitments", json={})
        assert r.status_code in (404, 405)


# ------------------------------------------------------------------
# Regression: existing TyreBook endpoints
# ------------------------------------------------------------------
class TestRegression:
    def test_root(self, api):
        r = api.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        assert r.json() == {"message": "TyreBook API"}

    def test_status_post(self, api):
        r = api.post(f"{BASE_URL}/api/status", json={"client_name": "regtest"})
        assert r.status_code == 200
        data = r.json()
        assert data["client_name"] == "regtest"
        assert "id" in data

    def test_purchases_check_duplicate(self, api):
        r = api.post(
            f"{BASE_URL}/api/purchases/check-duplicate",
            json={"invoice_number": "TEST_NONEXISTENT_INV_999", "supplier_name": ""},
        )
        assert r.status_code == 200
        assert r.json()["duplicate"] is False

    def test_purchases_index(self, api):
        r = api.post(
            f"{BASE_URL}/api/purchases/index",
            json={
                "invoice_number": "TEST_REGRESSION_INV_1",
                "supplier_name": "TEST_SUP",
                "total": 100.0,
                "date": "01-01-2026",
            },
        )
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_ocr_invoice_empty_payload(self, api):
        # Schema requires image_base64; empty string -> 400 empty payload
        r = api.post(f"{BASE_URL}/api/ocr/invoice", json={"image_base64": ""})
        # Accept 400 (our validation) OR 422 (pydantic) OR 500 (missing key)
        assert r.status_code in (400, 422, 500, 502), r.text

    def test_ocr_invoice_missing_field(self, api):
        r = api.post(f"{BASE_URL}/api/ocr/invoice", json={})
        assert r.status_code == 422  # pydantic missing field
