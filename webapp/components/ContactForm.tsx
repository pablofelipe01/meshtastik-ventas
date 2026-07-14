"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Lang } from "@/components/Landing";

const LIME = "#93d02c";
const TEAL = "#34c1cc";
const ORANGE = "#ee8034";
const NAVY_DEEP = "#081726";

const EMAIL = "pablofelipe@me.com";
const GITHUB = "https://github.com/pablofelipe01/meshtastik-ventas";

const C = {
  es: {
    title: "Hablemos",
    subtitle: "Cuéntanos qué necesitas conectar y te contactamos.",
    name: "Nombre",
    namePh: "Ada Lovelace",
    company: "Empresa",
    companyPh: "Tu organización",
    email: "Email",
    emailPh: "tu@correo.com",
    message: "¿Qué necesitas conectar?",
    messagePh:
      "Describe tu zona, cuántos usuarios, y qué quieres lograr (chat, IA, correo…).",
    submit: "Solicitar contacto",
    sending: "Enviando…",
    okTitle: "¡Gracias!",
    okBody: "Recibimos tu mensaje. Te contactamos pronto.",
    error: "No se pudo enviar. Intenta de nuevo.",
    privacyA:
      "Tus datos se envían de forma segura y se usan solo para responderte — nunca se venden ni comparten. ¿Prefieres escribir directo? ",
    emailCard: "Email",
    emailSub: "Escríbenos",
    githubCard: "GitHub",
    githubSub: "Ver el código",
    infoTitle: "A medida",
    infoBody:
      "Cada despliegue se cotiza según la zona, la cantidad de nodos y lo que la red necesita. No hay planes fijos.",
  },
  en: {
    title: "Let's talk",
    subtitle: "Tell us what you need to connect and we'll reach out.",
    name: "Name",
    namePh: "Ada Lovelace",
    company: "Company",
    companyPh: "Your organization",
    email: "Email",
    emailPh: "you@company.com",
    message: "What do you need to connect?",
    messagePh:
      "Describe your area, how many users, and what you want to achieve (chat, AI, email…).",
    submit: "Request contact",
    sending: "Sending…",
    okTitle: "Thank you!",
    okBody: "We got your message. We'll be in touch soon.",
    error: "Couldn't send. Please try again.",
    privacyA:
      "Your details are sent securely and used only to reply to you — never sold or shared. Prefer to write directly? ",
    emailCard: "Email",
    emailSub: "Write to us",
    githubCard: "GitHub",
    githubSub: "View the source",
    infoTitle: "Tailored",
    infoBody:
      "Every deployment is quoted based on the area, the number of nodes and what the network needs. No fixed plans.",
  },
} as const;

export default function ContactForm({ lang }: { lang: Lang }) {
  const t = C[lang];
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">(
    "idle",
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !message.trim()) return;
    setStatus("sending");
    const { error } = await supabase.from("leads").insert({
      name: name.trim(),
      company: company.trim() || null,
      email: email.trim() || null,
      message: message.trim(),
      source: "landing",
    });
    if (error) {
      setStatus("error");
      return;
    }
    setStatus("ok");
    setName("");
    setCompany("");
    setEmail("");
    setMessage("");
  }

  const inputCls =
    "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-white/30";

  return (
    <section
      id="contacto"
      className="scroll-mt-20 border-t border-white/10"
      style={{ background: NAVY_DEEP }}
    >
      <div className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          {t.title}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-300">
          {t.subtitle}
        </p>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          {/* ---- Formulario ---- */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
            {status === "ok" ? (
              <div className="flex min-h-72 flex-col items-center justify-center text-center">
                <div className="text-4xl">✅</div>
                <h3 className="mt-3 text-xl font-semibold">{t.okTitle}</h3>
                <p className="mt-2 text-slate-300">{t.okBody}</p>
                <button
                  onClick={() => setStatus("idle")}
                  className="mt-6 text-sm"
                  style={{ color: TEAL }}
                >
                  ↩ {lang === "es" ? "Enviar otro" : "Send another"}
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="flex flex-col gap-2">
                    <span className="text-sm text-slate-300">
                      {t.name} <span style={{ color: ORANGE }}>*</span>
                    </span>
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t.namePh}
                      className={inputCls}
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-sm text-slate-300">{t.company}</span>
                    <input
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder={t.companyPh}
                      className={inputCls}
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-2">
                  <span className="text-sm text-slate-300">{t.email}</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.emailPh}
                    className={inputCls}
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm text-slate-300">
                    {t.message} <span style={{ color: ORANGE }}>*</span>
                  </span>
                  <textarea
                    required
                    rows={5}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t.messagePh}
                    className={`${inputCls} resize-y`}
                  />
                </label>

                {status === "error" && (
                  <p className="text-sm text-red-400">{t.error}</p>
                )}

                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="w-fit rounded-full px-7 py-3 text-base font-semibold text-slate-900 transition hover:brightness-110 disabled:opacity-60"
                  style={{
                    background: `linear-gradient(90deg, ${ORANGE}, #f2b24a)`,
                  }}
                >
                  {status === "sending" ? t.sending : `${t.submit} ↗`}
                </button>

                <p className="text-xs leading-relaxed text-slate-500">
                  {t.privacyA}
                  <a
                    href={`mailto:${EMAIL}`}
                    className="underline"
                    style={{ color: TEAL }}
                  >
                    {EMAIL}
                  </a>
                </p>
              </form>
            )}
          </div>

          {/* ---- Panel de contacto ---- */}
          <div className="flex flex-col gap-4">
            <a
              href={`mailto:${EMAIL}`}
              className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition hover:bg-white/[0.05]"
            >
              <span
                className="flex h-11 w-11 items-center justify-center rounded-xl text-xl"
                style={{ backgroundColor: `${ORANGE}22` }}
              >
                ✉️
              </span>
              <span>
                <span className="block font-semibold">{t.emailCard}</span>
                <span className="block text-sm text-slate-400">{EMAIL}</span>
              </span>
            </a>

            <a
              href={GITHUB}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition hover:bg-white/[0.05]"
            >
              <span
                className="flex h-11 w-11 items-center justify-center rounded-xl text-xl"
                style={{ backgroundColor: `${LIME}22` }}
              >
                💻
              </span>
              <span>
                <span className="block font-semibold">{t.githubCard}</span>
                <span className="block text-sm text-slate-400">
                  {t.githubSub}
                </span>
              </span>
            </a>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h3 className="font-semibold" style={{ color: TEAL }}>
                {t.infoTitle}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                {t.infoBody}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
