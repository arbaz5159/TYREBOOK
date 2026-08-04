// Role Based Access Control (RBAC) — single source of truth for permission flags.
// All screens must read from `usePermissions()` and NOT check `user.role` directly.
//
//   OWNER  → everything true
//   STAFF  → retail billing + inventory viewing + customer creation + payments only
//
// Staff cannot: wholesale bills, edit stock, edit prices, admin panel, profit
// reports, delete bills, GST settings, backup, purchase entries.

import { useAuth } from "@/src/context/AuthContext";

export interface Permissions {
  loading: boolean;
  isOwner: boolean;
  isStaff: boolean;
  canCreateRetail: boolean;
  canCreateWholesale: boolean;
  canCreatePurchase: boolean;
  canEditStock: boolean;
  canEditPrices: boolean;
  canAccessAdmin: boolean;
  canViewProfit: boolean;
  canDeleteBills: boolean;
  canManageGst: boolean;
  canBackupRestore: boolean;
  canReceivePayments: boolean;
  canCreateRetailCustomer: boolean;
  canSearchInventory: boolean;
}

export function usePermissions(): Permissions {
  const { user, initializing } = useAuth();
  const isOwner = user?.role === "owner";
  const isStaff = !isOwner;
  return {
    // `loading` is true while Firebase Auth is still hydrating the current
    // user + role. Screens that gate on ownership (e.g. Add Tyre form,
    // Admin panel) MUST wait until this flips false before deciding to
    // redirect — otherwise a hard refresh will bounce the owner off the page.
    loading: initializing,
    isOwner,
    isStaff,
    canCreateRetail: true, // both
    canCreateWholesale: isOwner,
    canCreatePurchase: isOwner,
    canEditStock: isOwner,
    canEditPrices: isOwner,
    canAccessAdmin: isOwner,
    canViewProfit: isOwner,
    canDeleteBills: isOwner,
    canManageGst: isOwner,
    canBackupRestore: isOwner,
    canReceivePayments: true, // both
    canCreateRetailCustomer: true, // both
    canSearchInventory: true, // both
  };
}
