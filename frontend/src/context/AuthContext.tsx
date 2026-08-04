import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  signIn as fbSignIn,
  signOut as fbSignOut,
  signUp as fbSignUp,
  subscribeAuth,
  type AppUser,
  type UserRole,
} from "@/src/firebase/auth";

type Ctx = {
  user: AppUser | null;
  initializing: boolean;
  authFired: boolean;
  signIn: (email: string, password: string, role: UserRole) => Promise<void>;
  signUp: (name: string, email: string, password: string, role: UserRole) => Promise<void>;
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
    // Failsafe so we never hang on the splash screen if Firebase never fires
    // (e.g. offline first-launch). We only flip `initializing` — permission
    // gates (see usePermissions) read `authFired` so they don't misfire
    // during the async IndexedDB persistence rehydration window.
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
      signIn: async (email, password, role) => {
        const u = await fbSignIn(email, password, role);
        setUser(u);
        setAuthFired(true);
      },
      signUp: async (name, email, password, role) => {
        const u = await fbSignUp(name, email, password, role);
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
