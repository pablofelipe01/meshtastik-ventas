"use client";

import { useState } from "react";
import Image from "next/image";
import Login from "@/components/Login";

/* Paleta tomada del logo: azul noche, verde lima, teal y naranja. */
const NAVY = "#0b1f33";
const NAVY_DEEP = "#081726";
const LIME = "#93d02c";
const TEAL = "#34c1cc";
const ORANGE = "#ee8034";

export default function Landing() {
  const [showLogin, setShowLogin] = useState(false);

  if (showLogin) {
    return <Login onBack={() => setShowLogin(false)} />;
  }

  const enter = () => setShowLogin(true);

  return (
    <div
      className="min-h-dvh text-slate-100"
      style={{
        background: `radial-gradient(1200px 600px at 80% -10%, rgba(52,193,204,0.15), transparent 60%), radial-gradient(900px 500px at 0% 10%, rgba(147,208,44,0.12), transparent 55%), ${NAVY}`,
      }}
    >
      {/* ---------- Barra superior ---------- */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <Image
            src="/trama-logo.png"
            alt="Trama"
            width={44}
            height={44}
            className="rounded-xl"
            priority
          />
          <div className="leading-tight">
            <div className="text-xl font-bold tracking-tight">Trama</div>
            <div className="text-xs" style={{ color: LIME }}>
              Una sola red.
            </div>
          </div>
        </div>
        <button
          onClick={enter}
          className="rounded-full px-5 py-2 text-sm font-semibold text-slate-900 transition hover:brightness-110"
          style={{ backgroundColor: LIME }}
        >
          Entrar
        </button>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="mx-auto max-w-6xl px-6 pt-10 pb-16 sm:pt-16">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <span
              className="inline-block rounded-full border px-3 py-1 text-xs font-medium"
              style={{ borderColor: `${TEAL}55`, color: TEAL }}
            >
              Conectividad mesh + IA
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              Una sola conexión a internet.{" "}
              <span style={{ color: LIME }}>Toda una región conectada.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-300">
              Trama toma un único enlace a internet —Starlink, satelital o
              celular— y lo reparte por una malla de radio de largo alcance.
              Con unos pocos nodos repetidores cubres kilómetros de campo,
              montaña o selva donde no llega ninguna señal.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={enter}
                className="rounded-full px-6 py-3 text-base font-semibold text-slate-900 transition hover:brightness-110"
                style={{ backgroundColor: LIME }}
              >
                Entrar a la plataforma
              </button>
              <a
                href="#como-funciona"
                className="rounded-full border border-white/20 px-6 py-3 text-base font-semibold text-slate-100 transition hover:bg-white/5"
              >
                Cómo funciona
              </a>
            </div>
            <p className="mt-6 text-sm text-slate-400">
              Sin datos móviles · Sin torres celulares · Funciona con batería o
              panel solar.
            </p>
          </div>

          <div className="flex justify-center">
            <Image
              src="/trama-hero.png"
              alt="Del internet a la malla: una nube conectada a un gateway que reparte la señal a muchos nodos"
              width={460}
              height={460}
              className="w-full max-w-md rounded-3xl"
              style={{ boxShadow: "0 0 140px rgba(52,193,204,0.18)" }}
              priority
            />
          </div>
        </div>
      </section>

      {/* ---------- Cómo funciona ---------- */}
      <section
        id="como-funciona"
        className="border-t border-white/10"
        style={{ background: NAVY_DEEP }}
      >
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            Cómo funciona
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-300">
            Internet entra por un solo punto y la malla lo lleva hasta donde
            estés. Cada eslabón extiende la cobertura sin infraestructura.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-4">
            <Step
              n="1"
              color={TEAL}
              title="El enlace"
              body="Una conexión a internet en el punto base: Starlink, antena satelital o una señal celular."
            />
            <Step
              n="2"
              color={LIME}
              title="El gateway"
              body="Un pequeño equipo (Raspberry Pi) traduce internet ↔ malla de radio LoRa y hospeda la IA."
            />
            <Step
              n="3"
              color={ORANGE}
              title="Los repetidores"
              body="Nodos repetidores saltan la señal sobre montañas y valles, cubriendo kilómetros."
            />
            <Step
              n="4"
              color={TEAL}
              title="Los usuarios"
              body="Cada persona lleva su nodo y su teléfono con la app. Chatea sin señal celular ni datos."
            />
          </div>
        </div>
      </section>

      {/* ---------- Posibilidades ---------- */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          Lo que hace posible
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-300">
          Una infraestructura mínima que abre capacidades que antes exigían
          torres, cableado o cobertura celular.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Feature
            color={LIME}
            icon="🤖"
            title="IA en pleno campo"
            body="Pregúntale cualquier cosa a Claude por radio: datos, cálculos, información en tiempo real. La respuesta llega a tu nodo aunque no tengas internet."
          />
          <Feature
            color={TEAL}
            icon="💬"
            title="Mensajería con tu familia"
            body="Quien está en el campo escribe por la malla; su familia lo recibe al instante en la web. Ambos lados pueden iniciar la conversación."
          />
          <Feature
            color={ORANGE}
            icon="✉️"
            title="Correo desde la nada"
            body="Envía correos electrónicos reales desde una zona sin señal. El gateway los despacha por ti a cualquier destinatario."
          />
          <Feature
            color={TEAL}
            icon="🗺️"
            title="Cobertura enorme"
            body="Con unos pocos nodos repetidores se cubren kilómetros. La red crece sumando eslabones, sin obra ni permisos."
          />
          <Feature
            color={LIME}
            icon="📍"
            title="Ubicación en el mapa"
            body="Cada nodo reporta su posición GPS. Desde la web ves dónde está tu gente sobre el mapa, en vivo."
          />
          <Feature
            color={ORANGE}
            icon="🛡️"
            title="Resiliente y portátil"
            body="Funciona con batería o panel solar y sigue operando aunque el internet base falle: la malla local no se cae."
          />
        </div>
      </section>

      {/* ---------- Casos de uso ---------- */}
      <section className="border-t border-white/10" style={{ background: NAVY_DEEP }}>
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            Pensado para donde no llega nada
          </h2>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {[
              "Emergencias y desastres",
              "Minería y agro remoto",
              "Expediciones y turismo",
              "Zonas rurales",
              "Brigadas y rescate",
              "Operaciones en selva",
            ].map((t) => (
              <span
                key={t}
                className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-200"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- CTA final ---------- */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Una sola red. <span style={{ color: LIME }}>Todos conectados.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-slate-300">
          Entra a la plataforma para ver tus nodos en el mapa y conversar con tu
          gente en el campo.
        </p>
        <button
          onClick={enter}
          className="mt-8 rounded-full px-8 py-3 text-base font-semibold text-slate-900 transition hover:brightness-110"
          style={{ backgroundColor: LIME }}
        >
          Entrar
        </button>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <div className="flex items-center gap-3">
            <Image
              src="/trama-logo.png"
              alt="Trama"
              width={32}
              height={32}
              className="rounded-lg"
            />
            <div className="text-sm">
              <span className="font-semibold">Trama</span>
              <span className="text-slate-400"> · Una sola red.</span>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Red mesh LoRa · IA · Conectividad para zonas sin cobertura
          </p>
        </div>
      </footer>
    </div>
  );
}

function Step({
  n,
  title,
  body,
  color,
}: {
  n: string;
  title: string;
  body: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full text-base font-bold text-slate-900"
        style={{ backgroundColor: color }}
      >
        {n}
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-slate-300">{body}</p>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
  color,
}: {
  icon: string;
  title: string;
  body: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:bg-white/[0.06]">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl"
        style={{ backgroundColor: `${color}22` }}
      >
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold" style={{ color }}>
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">{body}</p>
    </div>
  );
}
