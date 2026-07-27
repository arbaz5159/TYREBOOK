# TyreBook — Product Requirements (v3)

## What it is
Full-stack Expo mobile app for Indian tyre shops. Inventory, purchases, GST billing, KhataBook, AI invoice OCR, dealer discount management and role-based access.

## Tech stack
- Expo SDK 54, Expo Router
- Firebase JS SDK (Auth + Firestore) with AsyncStorage fallback
- FastAPI + MongoDB backend
- OpenAI `gpt-4o-mini` vision via `emergentintegrations` + Emergent Universal LLM key
- expo-print + expo-sharing (PDF invoices + WhatsApp/Email share)
- expo-image-picker / expo-document-picker (AI invoice scanner input)

## Modules
1. Splash + Auth (Owner / Staff role toggle)
2. Bottom tabs — Dashboard · Inventory · Billing · Reports · Settings
3. **Role-based dashboards**
   - Owner: hero (Today's Sales / Profit / Purchase pills), KPI grid (Retail / Wholesale / Old / Remould / Inventory / Pending Khata / Low Stock / Customers), Owner Admin banner
   - Staff: hero (Today's Retail Sales / Bills Today / Pending Khata), KPI grid (Retail Sales / Current Inventory / Pending Khata / Low Stock / Customers)
4. **Inventory** — segmented New / Old / Remould, 7 vehicle categories, per-tyre CRUD (Brand, Model, Pattern, Size, Tube/Tubeless, Radial/Bias, Ply, Load Index, Speed Rating, Vehicle Compatibility, Purchase / Retail / MRP / Company Price List, Min Stock Alert, Current Stock, Rack)
5. **Purchase Module** — manual + AI Smart Purchase Scanner (camera / gallery / PDF-hint) → GPT-4o-mini → editable preview with low/medium confidence badges → duplicate check → auto stock in
6. **Sales / GST Billing** — 7 invoice types, 5 customer types (Retail / Wholesale / Dealer / Fleet / Government), 5 payment modes (Cash / UPI / Card / Bank Transfer / Credit), Dealer Discount Pricing card (Price List, Discount %, Discount Amount, Final Price) with auto-fill from customer type default, Owner override, UPI QR-code invoice PDF, WhatsApp/Email/Print share
7. **KhataBook** — customer ledger keyed by mobile, running balance, credit + payment entries, auto-writes credit entry on Credit-mode sales
8. **Customers** — list with search, per-customer purchase history, customerType + defaultDiscount saved on profile, per-customer total spent + total discount given
9. **Reports** — Today/Week/Month with Total Sales, Retail Sales, Wholesale+Others (owner), Total Purchase (owner), Estimated Profit (owner), Total Discount Given (owner), GST breakdown (owner)
10. **Global Search** — Brand · Model · Size · Vehicle name · Supplier · Customer · Invoice #. Vehicle lookup auto-suggests Front Size and Rear Size (seeded with 12 popular Indian vehicles).
11. **Owner Admin Panel** — Brands / Tyre Models / Tyre Sizes / Vehicle Categories / Suppliers CRUD, Manage Users, Shop / GST / Invoice settings, Backup & Restore (JSON), Vehicles master (front/rear size DB)
12. **RBAC** (Owner vs Staff) — enforced UI-side via `usePermissions()` hook:
    - Staff: Retail bill only, no stock/price edits, no admin, no profit view, no delete bills, no GST settings, no purchase / AI scan
    - Owner: full access
13. Language switcher (22 official Indian languages)

## RBAC matrix
| Action                 | Owner | Staff |
|------------------------|:-----:|:-----:|
| Create Retail Bill     |  ✅   |  ✅   |
| Create Wholesale/Dealer/Fleet/Gov |  ✅   |  ❌   |
| Create Purchase / AI Scan | ✅ | ❌   |
| Edit / Delete Tyre stock |  ✅ | ❌   |
| Edit prices (MRP, list, retail) | ✅ | ❌ |
| Access Admin Panel     |  ✅   |  ❌   |
| View Profit reports    |  ✅   |  ❌   |
| Delete bills           |  ✅   |  ❌   |
| GST Settings           |  ✅   |  ❌   |
| Manage customers/suppliers | ✅ | ❌   |
| Backup / Restore       |  ✅   |  ❌   |
| Receive payments (Khata) | ✅ | ✅ (both) |
| Search inventory       |  ✅   |  ✅   |

## Backend endpoints (`/api`)
- `POST /ocr/invoice` — GPT-4o-mini vision OCR
- `POST /purchases/check-duplicate` — duplicate-invoice check
- `POST /purchases/index` — index a saved purchase

## Firestore collections
`tyres`, `purchases`, `sales`, `customers`, `khata`, `users`, `settings/shop`, `stock_movements`, `vehicles`, plus master: `brands`, `tyreModels`, `tyreSizes`, `vehicleCategories`, `suppliers`

## Not yet built (deliberate)
- Firestore security rules — RBAC is enforced UI-side; server-side rules should mirror the matrix
- Actual excel/CSV import UI (data model supports it, no dedicated screen shipped)
- On-device PDF rasteriser for direct PDF OCR (Expo-native limitation)
- Thermal 58/80 mm dedicated print templates (uses OS print dialog with the A4 template instead)
- Barcode/QR barcode generator per tyre item (data model has `barcode` slot; UI/render not shipped)
- Full UI-string translations into all 22 Indian languages
