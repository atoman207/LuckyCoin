"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/coins";

type Ctx = {
  profile: Profile | null;
  loading: boolean;
  authOpen: boolean;
  welcomeOpen: boolean;
  setProfile: (p: Profile | null) => void;
  refresh: () => Promise<void>;
  openAuth: () => void;
  closeAuth: () => void;
  openWelcome: () => void;
  closeWelcome: () => void;
  signOut: () => Promise<void>;
};

const UserContext = createContext<Ctx | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  const openWelcome = useCallback(() => setWelcomeOpen(true), []);
  const closeWelcome = useCallback(() => setWelcomeOpen(false), []);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (res.ok) {
      const { profile } = await res.json();
      setProfile(profile);
    } else {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      if (session) await refresh();
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) refresh();
      else setProfile(null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, refresh]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, [supabase]);

  const value: Ctx = {
    profile,
    loading,
    authOpen,
    welcomeOpen,
    setProfile,
    refresh,
    openAuth: () => setAuthOpen(true),
    closeAuth: () => setAuthOpen(false),
    openWelcome,
    closeWelcome,
    signOut,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used inside <UserProvider>");
  return ctx;
}
