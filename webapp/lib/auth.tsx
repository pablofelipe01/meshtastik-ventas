"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import Landing from "@/components/Landing";

export type Contact = {
  id: number;
  name: string;
  email: string;
  is_admin: boolean;
};

type AuthState = {
  user: User | null;
  contact: Contact | null;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<AuthState>({
  user: null,
  contact: null,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);

  useEffect(() => {
    let active = true;

    async function loadContact(u: User | null) {
      if (!u) {
        setContact(null);
        return;
      }
      // RLS deja ver solo la propia fila de contacto.
      const { data } = await supabase
        .from("contacts")
        .select("id,name,email,is_admin")
        .maybeSingle();
      if (active) setContact((data as Contact) ?? null);
    }

    supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      supabase.realtime.setAuth(s?.access_token);
      setUser(s?.user ?? null);
      loadContact(s?.user ?? null).finally(() => {
        if (active) setLoading(false);
      });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      supabase.realtime.setAuth(session?.access_token);
      setUser(session?.user ?? null);
      loadContact(session?.user ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  let content: ReactNode;
  if (loading) {
    content = (
      <div className="flex min-h-dvh items-center justify-center text-slate-400">
        Cargando…
      </div>
    );
  } else if (!user) {
    content = <Landing />;
  } else if (!contact) {
    content = (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-slate-300">
          Tu cuenta <b>{user.email}</b> no está vinculada a ningún contacto.
          Pide al administrador que te registre.
        </p>
        <button
          onClick={signOut}
          className="btn-ghost rounded-lg px-4 py-2"
        >
          Cerrar sesión
        </button>
      </div>
    );
  } else {
    content = children;
  }

  return (
    <AuthCtx.Provider value={{ user, contact, signOut }}>
      {content}
    </AuthCtx.Provider>
  );
}
