# TyreBook — Product Requirements

## What it is
TyreBook is a mobile-first (Expo React Native) business management app for Indian tyre shops. It covers inventory, GST billing, khata book, purchase and sales flows with an owner-only admin panel.

## Tech stack
- Expo SDK 54, Expo Router (file-based routing), React Native 0.81
- Firebase JS SDK (Auth + Firestore) — configured via `EXPO_PUBLIC_FIREBASE_*` env vars
- AsyncStorage fallback: if Firebase config is missing, the app writes to local storage so the UI is fully usable
- Material Design 3 tonal palette, no shadows/glass, teal `#006B5F` brand
- Language switcher lists all 22 official Indian languages

## Modules built
1. **Splash + Auth** — Login (role toggle Owner / Staff), Signup
2. **Bottom tabs** — Dashboard · Inventory · Billing · Reports · Settings
3. **Dashboard** — Hero card (Today's Sales, Profit, Purchase) + KPI grid (Total Stock, Pending Khata, Low Stock, Customers) + Quick Actions + Owner Admin banner + FAB
4. **Inventory** — 7 vehicle categories (Bike & Scooty, Car, Auto Rickshaw, Tractor, Truck, Bus, OTR). Add/Edit/Delete/Search tyres with all 11 fields (brand, model, size, tube/tubeless, radial/bias, ply, purchase price, selling price, current stock, rack number)
5. **Purchase** — New Purchase form (supplier, invoice, date, category, brand, model, size, quantity, purchase price, GST, remarks) + Purchase History list. Stock auto-increments on save
6. **Sales / Billing** — New Sale form (customer, mobile, vehicle number, category, brand, model, size, qty, selling price, GST, payment mode: Cash/UPI/Card/Credit). Stock auto-decrements, customer + purchase history is upserted keyed by mobile
7. **Customers** — List with search, per-customer purchase history
8. **Reports** — Today/Week/Month filter with Sales, Purchases, Profit, Pending Khata, Input/Output/Net GST
9. **Owner Admin Panel** — Brands, Tyre Models, Tyre Sizes, Vehicle Categories, Suppliers (add/edit/delete), Manage Users, Shop / GST / Invoice settings, Backup & Restore. Staff is redirected away
10. **Language Switcher** — 22 official Indian languages persisted to AsyncStorage
11. **Settings** — Owner-only rows are hidden for Staff. Logout, Firebase-not-configured banner

## Firestore collections
- `tyres`, `purchases`, `sales`, `customers` (id = mobile), `users`, `settings/shop`
- Master: `brands`, `tyreModels`, `tyreSizes`, `vehicleCategories`, `suppliers`

## Setup needed to switch to real Firebase
Fill these in `/app/frontend/.env` (Firebase Console → Project Settings → Web App):
```
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
```
Enable Email/Password provider in Firebase Auth and enable Firestore in test/prod mode.

## Not yet built (deliberate)
- PDF invoice generation & printing
- Barcode / QR code scan
- Owner-vs-Staff enforcement in Firestore security rules (currently UI-only gating)
- Actual language string translations (only labels for the switcher are localized; UI copy remains English)
