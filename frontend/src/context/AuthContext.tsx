import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  signIn as fbSignIn,
  signOut as fbSignOut,
  signUp as fbSignUp,
  subscribeAuth,
  type AppRole,
  type AppUser,
} from "@/src/firebase/auth";

// Legacy alias for backward compatibility. Prefer AppRole in new code.
export type UserRole = AppRole;

type Ctx = {
  user: AppUser | null;
  initializing: boolean;
  authFired: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, shopName?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [authFired, setAuthFired] = useState(false);

  useEffect(() => {
    let mounted = true;
    const unsub = subscribeAuth((u) => {
      if (!mounted) return;
      setUser(u);
      setAuthFired(true);
      setInitializing(false);
    });
    // Splash-screen failsafe. Only flips `initializing` — screens gate on
    // `authFired` via usePermissions so they never redirect prematurely
    // during Firebase Auth's IndexedDB persistence rehydration.
    const timer = setTimeout(() => {
      if (mounted) setInitializing(false);
    }, 4000);
    return () => {
      mounted = false;
      clearTimeout(timer);
      unsub();
    };
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      user,
      initializing,
      authFired,
      signIn: async (email, password) => {
        const u = await fbSignIn(email, password);
        setUser(u);
        setAuthFired(true);
      },
      signUp: async (name, email, password, shopName) => {
        const u = await fbSignUp(name, email, password, shopName);
        setUser(u);
        setAuthFired(true);
      },
      signOut: async () => {
        await fbSignOut();
        setUser(null);
        setAuthFired(true);
      },
    }),
    [user, initializing, authFired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
