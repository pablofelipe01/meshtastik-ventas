"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ResetPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // El enlace del correo establece una sesión de recuperación.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
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
      setError("No se pudo actualizar. Pide un enlace nuevo.");
      return;
    }
    setDone(true);
    setTimeout(() => router.replace("/"), 1500);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <div className="text-4xl">🔑</div>
        <h1 className="mt-2 text-xl font-semibold">Nueva clave</h1>
      </div>

      {done ? (
        <p className="text-center text-green-700">
          ✅ Clave actualizada. Entrando…
        </p>
      ) : !ready ? (
        <p className="text-center text-sm text-slate-500">
          Validando el enlace… Si llegaste aquí sin el enlace del correo, vuelve a
          pedir la recuperación.
        </p>
      ) : (
        <form onSubmit={save} className="flex flex-col gap-3">
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
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:bg-slate-300"
          >
            {saving ? "Guardando…" : "Guardar clave"}
          </button>
        </form>
      )}
    </main>
  );
}
