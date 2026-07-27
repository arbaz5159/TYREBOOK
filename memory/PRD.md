# TyreBook — Product Requirements (v2, AI-Enabled)

## What it is
TyreBook is a mobile-first (Expo React Native) full business management app for Indian tyre shops. Ships with inventory, purchases, GST-style billing, KhataBook (customer ledger), owner-only admin, multilingual UI, and an AI invoice scanner.

## Tech stack
- Expo SDK 54, Expo Router (file-based), React Native 0.81
- Firebase JS SDK (Auth + Firestore) — configured via `EXPO_PUBLIC_FIREBASE_*` env vars, with AsyncStorage fallback so the UI stays usable without credentials
- FastAPI backend with MongoDB
- **AI OCR**: `openai/gpt-4o-mini` vision, called via `emergentintegrations` using the Emergent Universal LLM key
- expo-print + expo-sharing for PDF invoices, expo-image-picker + expo-document-picker for the scanner

## Modules (delivered)
1. Splash + Firebase Auth (Login role toggle Owner/Staff, Signup)
2. Bottom tabs: Dashboard · Inventory · Billing · Reports · Settings
3. **Dashboard widgets**: hero (Today's Sales, Profit, Purchase), KPI grid (Total Stock, Pending Khata, Low Stock, Customers), Quick Actions (New Sale, AI Scan Invoice, New Purchase, KhataBook, Add Tyre, Customers), Owner Admin banner, FAB (Quick Bill)
4. **Inventory (New Tyres)** — 7 vehicle categories; per-tyre CRUD with Brand, Tyre Model, Tyre Size, Tube/Tubeless, Radial/Bias, Ply Rating, **Load Index**, **Speed Rating**, Purchase Price, Selling Price, Current Stock, Rack Number; search; low-stock highlight
5. **Purchase Module** — manual purchase form (Supplier / Invoice # / Date / Category / Brand / Model / Size / Qty / Purchase Price / GST / Remarks) with auto stock increment + purchase history
6. **AI Smart Purchase Scanner** — camera capture / upload image / upload PDF → GPT‑4o-mini OCR → editable preview (each field flagged medium/low confidence gets a "verify" badge) → duplicate-invoice check against the backend index → Confirm auto-creates the purchase and increases stock
7. **Sales / GST Billing** — Invoice-type picker (Tax Invoice, GST Invoice, Non-GST, Estimate, Quotation, Delivery Challan, Purchase Order) + Payment mode (Cash / UPI / Card / **Bank Transfer** / Credit); on save auto-decrements stock, upserts customer, writes KhataBook credit entry if Credit, and generates & shares a professional **PDF invoice** with UPI **QR code** for scan-to-pay
8. **KhataBook** — customer ledger keyed by mobile number with running balance, Credit / Payment entries, To-Receive & Advances summary
9. **Customers** — list, search, per-customer purchase history
10. **Reports** — Today/Week/Month filter with Sales, Purchases, Profit, Pending Khata, Input/Output/Net GST
11. **Owner Admin Panel** — Brands / Tyre Models / Tyre Sizes / Vehicle Categories / Suppliers CRUD, Manage Users, Shop / GST / Invoice settings, Backup & Restore (JSON), Customers link
12. **Language switcher** — 22 official Indian languages
13. **PDF invoice & sharing** — expo-print HTML → PDF, then expo-sharing dispatches to WhatsApp / Email / Print. Layout works on A4; 58mm/80mm thermal are handled by the OS print dialog

## Backend endpoints (FastAPI, prefix `/api`)
- `POST /api/ocr/invoice` — vision OCR, returns `InvoiceExtraction` JSON
- `POST /api/purchases/check-duplicate` — returns `{ duplicate: bool, match?: { ... } }`
- `POST /api/purchases/index` — upsert into `purchase_index` for future dedupe
- `GET/POST /api/status` — legacy demo endpoint kept for parity

## Firestore collections
- `tyres`, `purchases`, `sales`, `customers` (id = mobile), `khata`, `users`, `stock_movements`, `settings/shop`
- Master: `brands`, `tyreModels`, `tyreSizes`, `vehicleCategories`, `suppliers`

## Setup for real Firebase & production LLM billing
Fill `/app/frontend/.env` with your Firebase Web-App config. `EMERGENT_LLM_KEY` is already provisioned on the backend — top up in Profile → Universal Key when the balance runs low. To swap in your own OpenAI / Anthropic / Gemini key, set it in `/app/backend/.env` and update `LlmChat(...).with_model(...)`.

## Not yet built (deliberate)
- On-device PDF rasteriser (users are asked to upload the invoice as an image)
- Thermal-printer specific 58/80 mm layouts (uses the OS print dialog instead)
- Owner-vs-Staff enforcement in Firestore security rules (currently UI-only)
- Actual full translations of UI copy into all 22 languages (switcher persists the code; strings remain English baseline)
- Global search on the tab bar (dashboard already jumps to Customers / Inventory)
