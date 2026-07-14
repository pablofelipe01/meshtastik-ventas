"use client";

import { useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import type { Lang } from "@/components/Landing";

const L = {
  es: {
    back: "← Volver",
    title: "Trama",
    subtitle: "Inicia sesión para ver tus nodos y escribir a tu gente en campo.",
    email: "Tu email",
    password: "Tu clave",
    signIn: "Entrar",
    signingIn: "Entrando…",
    badCreds: "Email o clave incorrectos.",
    forgotLink: "¿Olvidaste tu clave?",
    noAccount: "¿Sin cuenta? Pídele al administrador que te registre.",
    forgotTitle: "Recuperar clave",
    forgotSubtitle:
      "Escribe tu email y te enviamos un enlace para crear una nueva clave.",
    send: "Enviar enlace",
    sending: "Enviando…",
    sendError: "No se pudo enviar el correo. Verifica el email.",
    sendOk: "Te enviamos un enlace para restablecer tu clave. Revisa tu correo.",
    backToLogin: "← Volver a iniciar sesión",
  },
  en: {
    back: "← Back",
    title: "Trama",
    subtitle: "Sign in to see your nodes and message your people in the field.",
    email: "Your email",
    password: "Your password",
    signIn: "Sign in",
    signingIn: "Signing in…",
    badCreds: "Incorrect email or password.",
    forgotLink: "Forgot your password?",
    noAccount: "No account? Ask the administrator to register you.",
    forgotTitle: "Reset password",
    forgotSubtitle:
      "Enter your email and we'll send you a link to create a new password.",
    send: "Send link",
    sending: "Sending…",
    sendError: "Couldn't send the email. Check the address.",
    sendOk: "We sent you a link to reset your password. Check your inbox.",
    backToLogin: "← Back to sign in",
  },
} as const;

export default function Login({
  onBack,
  lang = "es",
}: {
  onBack?: () => void;
  lang?: Lang;
}) {
  const t = L[lang];
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
    if (error) setError(t.badCreds);
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
    if (error) setError(t.sendError);
    else setInfo(t.sendOk);
  }

  if (mode === "forgot") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
        <div className="text-center">
          <div className="text-4xl">🔑</div>
          <h1 className="mt-2 text-xl font-semibold">{t.forgotTitle}</h1>
          <p className="text-sm text-slate-500">{t.forgotSubtitle}</p>
        </div>
        <form onSubmit={sendReset} className="flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.email}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-green-700">{info}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:bg-slate-300"
          >
            {loading ? t.sending : t.send}
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
          {t.backToLogin}
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      {onBack && (
        <button onClick={onBack} className="self-start text-sm text-blue-600">
          {t.back}
        </button>
      )}
      <div className="text-center">
        <Image
          src="/trama-logo.png"
          alt="Trama"
          width={72}
          height={72}
          className="mx-auto rounded-xl"
          priority
        />
        <h1 className="mt-3 text-xl font-semibold">{t.title}</h1>
        <p className="text-sm text-slate-500">{t.subtitle}</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.email}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500"
        />
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t.password}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:bg-slate-300"
        >
          {loading ? t.signingIn : t.signIn}
        </button>
      </form>

      <button
        onClick={() => {
          setMode("forgot");
          setError(null);
        }}
        className="text-center text-sm text-blue-600"
      >
        {t.forgotLink}
      </button>

      <p className="text-center text-xs text-slate-400">{t.noAccount}</p>
    </main>
  );
}
