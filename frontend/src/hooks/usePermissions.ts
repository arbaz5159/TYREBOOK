// Role Based Access Control (RBAC) — single source of truth for permission flags.
// All screens must read from `usePermissions()` and NOT check `user.role` directly.
//
//   super_admin  → platform owner (whitelisted email). Can inspect any shop
//                  once they pick one from the Super Admin panel.
//   shop_admin   → owner of a single tenant. Full access to their shop only.
//   staff        → limited retail-billing operator inside one shop.
//
// Staff cannot: wholesale bills, edit stock, edit prices, admin panel,
// profit reports, delete bills, GST settings, backup, purchase entries.

import { useAuth } from "@/src/context/AuthContext";
import { useActiveShopId } from "@/src/firebase/tenant";

export interface Permissions {
  loading: boolean;
  isOwner: boolean;         // shop_admin OR super_admin (legacy semantics)
  isSuperAdmin: boolean;
  isShopAdmin: boolean;
  isStaff: boolean;
  hasShop: boolean;         // active shopId available (needed for tenant reads)
  canCreateRetail: boolean;
  canCreateWholesale: boolean;
  canCreatePurchase: boolean;
  canEditStock: boolean;
  canEditPrices: boolean;
  canAccessAdmin: boolean;
  canAccessSuperAdmin: boolean;
  canViewProfit: boolean;
  canDeleteBills: boolean;
  canManageGst: boolean;
  canBackupRestore: boolean;
  canReceivePayments: boolean;
  canCreateRetailCustomer: boolean;
  canSearchInventory: boolean;
  canInviteStaff: boolean;
}

export function usePermissions(): Permissions {
  const { user, authFired } = useAuth();
  const activeShopId = useActiveShopId();
  const role = user?.role;
  const isSuperAdmin = role === "super_admin";
  const isShopAdmin = role === "shop_admin";
  const isStaff = role === "staff";
  const isOwner = isShopAdmin || isSuperAdmin;
  // `hasShop` is true when the current session has an addressable tenant:
  //   - shop_admin / staff  → their bound `users/{uid}.shopId`
  //   - super_admin         → an activeShopId set via "Enter this shop"
  //                           from the Super Admin panel (impersonation)
  const hasShop = Boolean(user?.shopId || activeShopId);
  return {
    // `loading` is true until Firebase Auth has actually fired at least
    // once. Screens gating on ownership MUST wait for this to flip false —
    // otherwise a hard refresh bounces the Owner because `user` is null
    // during the IndexedDB persistence rehydration window.
    loading: !authFired,
    isOwner,
    isSuperAdmin,
    isShopAdmin,
    isStaff,
    hasShop,
    canCreateRetail: !isSuperAdmin || hasShop, // both roles, super_admin only after picking a shop
    canCreateWholesale: (isShopAdmin || isSuperAdmin) && hasShop,
    canCreatePurchase: (isShopAdmin || isSuperAdmin) && hasShop,
    canEditStock: (isShopAdmin || isSuperAdmin) && hasShop,
    canEditPrices: isShopAdmin || isSuperAdmin,
    canAccessAdmin: (isShopAdmin || isSuperAdmin) && hasShop,
    canAccessSuperAdmin: isSuperAdmin,
    canViewProfit: isShopAdmin || isSuperAdmin,
    canDeleteBills: isShopAdmin || isSuperAdmin,
    canManageGst: isShopAdmin || isSuperAdmin,
    canBackupRestore: isShopAdmin || isSuperAdmin,
    canReceivePayments: true, // any authenticated user
    canCreateRetailCustomer: true,
    canSearchInventory: true,
    canInviteStaff: isShopAdmin || isSuperAdmin,
  };
}
