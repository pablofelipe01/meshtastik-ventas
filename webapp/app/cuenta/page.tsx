"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export default function CuentaPage() {
  const { contact, user, signOut } = useAuth();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    if (pw1.length < 6) {
      setError("La clave debe tener al menos 6 caracteres.");
      return;
    }
    if (pw1 !== pw2) {
      setError("Las claves no coinciden.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setSaving(false);
    if (error) {
      setError("No se pudo cambiar la clave. Intenta de nuevo.");
      return;
    }
    setPw1("");
    setPw2("");
    setMsg("✅ Clave actualizada.");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="app-header flex items-center gap-3 px-4 py-3 text-slate-100">
        <Link href="/" className="text-xl leading-none" aria-label="Volver">
          ‹
        </Link>
        <h1 className="flex-1 text-base font-semibold">Mi cuenta</h1>
      </header>

      <section className="p-4">
        <div className="card mb-4 rounded-xl p-4">
          <p className="text-sm text-slate-400">Nombre</p>
          <p className="font-medium text-slate-100">{contact?.name ?? "—"}</p>
          <p className="mt-2 text-sm text-slate-400">Email</p>
          <p className="font-medium text-slate-100">{user?.email ?? "—"}</p>
        </div>

        <h2 className="mb-2 text-sm font-semibold text-slate-400">
          Cambiar mi clave
        </h2>
        <form
          onSubmit={changePassword}
          className="card flex flex-col gap-3 rounded-xl p-4"
        >
          <input
            type="password"
            autoComplete="new-password"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            placeholder="Nueva clave"
            className="field rounded-lg px-3 py-2 outline-none"
          />
          <input
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="Repite la nueva clave"
            className="field rounded-lg px-3 py-2 outline-none"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          {msg && <p className="text-sm text-green-400">{msg}</p>}
          <button
            type="submit"
            disabled={saving}
            className="btn-lime rounded-lg px-4 py-2"
          >
            {saving ? "Guardando…" : "Cambiar clave"}
          </button>
        </form>

        <button
          onClick={signOut}
          className="btn-ghost mt-6 w-full rounded-lg px-4 py-2"
        >
          Cerrar sesión
        </button>
      </section>
    </main>
  );
}
