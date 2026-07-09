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
      <header className="flex items-center gap-3 bg-blue-700 px-4 py-3 text-white shadow">
        <Link href="/" className="text-xl leading-none" aria-label="Volver">
          ‹
        </Link>
        <h1 className="flex-1 text-base font-semibold">Mi cuenta</h1>
      </header>

      <section className="p-4">
        <div className="mb-4 rounded-xl bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Nombre</p>
          <p className="font-medium">{contact?.name ?? "—"}</p>
          <p className="mt-2 text-sm text-slate-500">Email</p>
          <p className="font-medium">{user?.email ?? "—"}</p>
        </div>

        <h2 className="mb-2 text-sm font-semibold text-slate-600">
          Cambiar mi clave
        </h2>
        <form
          onSubmit={changePassword}
          className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm"
        >
          <input
            type="password"
            autoComplete="new-password"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            placeholder="Nueva clave"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500"
          />
          <input
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="Repite la nueva clave"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {msg && <p className="text-sm text-green-700">{msg}</p>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:bg-slate-300"
          >
            {saving ? "Guardando…" : "Cambiar clave"}
          </button>
        </form>

        <button
          onClick={signOut}
          className="mt-6 w-full rounded-lg bg-slate-200 px-4 py-2 text-slate-700"
        >
          Cerrar sesión
        </button>
      </section>
    </main>
  );
}
