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
  signIn: (email: string, password: string, role: UserRole) => Promise<void>;
  signUp: (name: string, email: string, password: string, role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let mounted = true;
    const unsub = subscribeAuth((u) => {
      if (!mounted) return;
      setUser(u);
      setInitializing(false);
    });
    // Failsafe so we never hang on the splash if Firebase never fires.
    const timer = setTimeout(() => {
      if (mounted) setInitializing(false);
    }, 1500);
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
      signIn: async (email, password, role) => {
        const u = await fbSignIn(email, password, role);
        setUser(u);
      },
      signUp: async (name, email, password, role) => {
        const u = await fbSignUp(name, email, password, role);
        setUser(u);
      },
      signOut: async () => {
        await fbSignOut();
        setUser(null);
      },
    }),
    [user, initializing],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
