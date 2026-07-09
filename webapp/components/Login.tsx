"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) setError("Email o clave incorrectos.");
  }

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset`,
    });
    setLoading(false);
    if (error) setError("No se pudo enviar el correo. Verifica el email.");
    else setInfo("Te enviamos un enlace para restablecer tu clave. Revisa tu correo.");
  }

  if (mode === "forgot") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
        <div className="text-center">
          <div className="text-4xl">🔑</div>
          <h1 className="mt-2 text-xl font-semibold">Recuperar clave</h1>
          <p className="text-sm text-slate-500">
            Escribe tu email y te enviamos un enlace para crear una nueva clave.
          </p>
        </div>
        <form onSubmit={sendReset} className="flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Tu email"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-green-700">{info}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:bg-slate-300"
          >
            {loading ? "Enviando…" : "Enviar enlace"}
          </button>
        </form>
        <button
          onClick={() => {
            setMode("login");
            setError(null);
            setInfo(null);
          }}
          className="text-center text-sm text-blue-600"
        >
          ← Volver a iniciar sesión
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <div className="text-4xl">📡</div>
        <h1 className="mt-2 text-xl font-semibold">Mesh Familia</h1>
        <p className="text-sm text-slate-500">
          Inicia sesión para escribirle a tu familia en campo.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Tu email"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500"
        />
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Tu clave"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:bg-slate-300"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <button
        onClick={() => {
          setMode("forgot");
          setError(null);
        }}
        className="text-center text-sm text-blue-600"
      >
        ¿Olvidaste tu clave?
      </button>

      <p className="text-center text-xs text-slate-400">
        ¿Sin cuenta? Pídele al administrador que te registre.
      </p>
    </main>
  );
}
