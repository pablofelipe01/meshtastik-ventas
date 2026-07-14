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

export type Lang = "es" | "en";

const T = {
  es: {
    tagline: "Una sola red.",
    enter: "Entrar",
    heroBadge: "Conectividad mesh + IA",
    heroTitle1: "Una sola conexión a internet. ",
    heroTitle2: "Toda una región conectada.",
    heroSubtitle:
      "Trama toma un único enlace a internet —Starlink, satelital o celular— y lo reparte por una malla de radio de largo alcance. Con unos pocos nodos repetidores cubres kilómetros de campo, montaña o selva donde no llega ninguna señal.",
    heroCta: "Entrar a la plataforma",
    howCta: "Cómo funciona",
    heroNote:
      "Sin datos móviles · Sin torres celulares · Funciona con batería o panel solar.",
    heroImgAlt:
      "Del internet a la malla: una nube conectada a un gateway que reparte la señal a muchos nodos",
    howTitle: "Cómo funciona",
    howSubtitle:
      "Internet entra por un solo punto y la malla lo lleva hasta donde estés. Cada eslabón extiende la cobertura sin infraestructura.",
    steps: [
      {
        title: "El enlace",
        body: "Una conexión a internet en el punto base: Starlink, antena satelital o una señal celular.",
      },
      {
        title: "El gateway",
        body: "Un pequeño equipo (Raspberry Pi) traduce internet ↔ malla de radio LoRa y hospeda la IA.",
      },
      {
        title: "Los repetidores",
        body: "Nodos repetidores saltan la señal sobre montañas y valles, cubriendo kilómetros.",
      },
      {
        title: "Los usuarios",
        body: "Cada persona lleva su nodo y su teléfono con la app. Chatea sin señal celular ni datos.",
      },
    ],
    possTitle: "Lo que hace posible",
    possSubtitle:
      "Una infraestructura mínima que abre capacidades que antes exigían torres, cableado o cobertura celular.",
    features: [
      {
        title: "IA en pleno campo",
        body: "Pregúntale cualquier cosa a Claude por radio: datos, cálculos, información en tiempo real. La respuesta llega a tu nodo aunque no tengas internet.",
      },
      {
        title: "Mensajería con tu familia",
        body: "Quien está en el campo escribe por la malla; su familia lo recibe al instante en la web. Ambos lados pueden iniciar la conversación.",
      },
      {
        title: "Correo desde la nada",
        body: "Envía correos electrónicos reales desde una zona sin señal. El gateway los despacha por ti a cualquier destinatario.",
      },
      {
        title: "Cobertura enorme",
        body: "Con unos pocos nodos repetidores se cubren kilómetros. La red crece sumando eslabones, sin obra ni permisos.",
      },
      {
        title: "Ubicación en el mapa",
        body: "Cada nodo reporta su posición GPS. Desde la web ves dónde está tu gente sobre el mapa, en vivo.",
      },
      {
        title: "Resiliente y portátil",
        body: "Funciona con batería o panel solar y sigue operando aunque el internet base falle: la malla local no se cae.",
      },
    ],
    casesTitle: "Pensado para donde no llega nada",
    cases: [
      "Emergencias y desastres",
      "Minería y agro remoto",
      "Expediciones y turismo",
      "Zonas rurales",
      "Brigadas y rescate",
      "Operaciones en selva",
    ],
    ctaTitle1: "Una sola red. ",
    ctaTitle2: "Todos conectados.",
    ctaSubtitle:
      "Entra a la plataforma para ver tus nodos en el mapa y conversar con tu gente en el campo.",
    footerNote:
      "Red mesh LoRa · IA · Conectividad para zonas sin cobertura",
  },
  en: {
    tagline: "One single network.",
    enter: "Sign in",
    heroBadge: "Mesh connectivity + AI",
    heroTitle1: "One internet connection. ",
    heroTitle2: "An entire region connected.",
    heroSubtitle:
      "Trama takes a single internet link —Starlink, satellite or cellular— and spreads it across a long-range radio mesh. With just a few repeater nodes you cover kilometers of field, mountain or jungle where no signal reaches.",
    heroCta: "Enter the platform",
    howCta: "How it works",
    heroNote:
      "No mobile data · No cell towers · Runs on battery or solar power.",
    heroImgAlt:
      "From the internet to the mesh: a cloud connected to a gateway that spreads the signal to many nodes",
    howTitle: "How it works",
    howSubtitle:
      "The internet comes in at a single point and the mesh carries it to wherever you are. Every link extends coverage with no infrastructure.",
    steps: [
      {
        title: "The uplink",
        body: "An internet connection at the base point: Starlink, a satellite dish or a cellular signal.",
      },
      {
        title: "The gateway",
        body: "A small device (Raspberry Pi) bridges the internet ↔ the LoRa radio mesh and hosts the AI.",
      },
      {
        title: "The repeaters",
        body: "Repeater nodes hop the signal over mountains and valleys, covering kilometers.",
      },
      {
        title: "The users",
        body: "Each person carries their node and phone with the app. Chat with no cell signal or data.",
      },
    ],
    possTitle: "What it makes possible",
    possSubtitle:
      "A minimal setup that unlocks capabilities that once required towers, cabling or cellular coverage.",
    features: [
      {
        title: "AI out in the field",
        body: "Ask Claude anything over radio: facts, calculations, real-time information. The answer reaches your node even with no internet.",
      },
      {
        title: "Messaging with your family",
        body: "Whoever is in the field writes over the mesh; their family gets it instantly on the web. Either side can start the conversation.",
      },
      {
        title: "Email from nowhere",
        body: "Send real emails from an area with no signal. The gateway dispatches them for you to any recipient.",
      },
      {
        title: "Huge coverage",
        body: "A few repeater nodes cover kilometers. The network grows by adding links, with no construction or permits.",
      },
      {
        title: "Location on the map",
        body: "Each node reports its GPS position. From the web you see where your people are on the map, live.",
      },
      {
        title: "Resilient and portable",
        body: "Runs on battery or solar and keeps working even if the base internet fails: the local mesh stays up.",
      },
    ],
    casesTitle: "Built for where nothing else reaches",
    cases: [
      "Emergencies and disasters",
      "Remote mining and agriculture",
      "Expeditions and tourism",
      "Rural areas",
      "Field crews and rescue",
      "Jungle operations",
    ],
    ctaTitle1: "One single network. ",
    ctaTitle2: "Everyone connected.",
    ctaSubtitle:
      "Enter the platform to see your nodes on the map and talk with your people in the field.",
    footerNote:
      "LoRa mesh network · AI · Connectivity for areas with no coverage",
  },
} as const;

export default function Landing() {
  const [lang, setLang] = useState<Lang>("es");
  const [showLogin, setShowLogin] = useState(false);
  const t = T[lang];

  if (showLogin) {
    return <Login lang={lang} onBack={() => setShowLogin(false)} />;
  }

  const enter = () => setShowLogin(true);
  const stepColors = [TEAL, LIME, ORANGE, TEAL];
  const featureMeta = [
    { icon: "🤖", color: LIME },
    { icon: "💬", color: TEAL },
    { icon: "✉️", color: ORANGE },
    { icon: "🗺️", color: TEAL },
    { icon: "📍", color: LIME },
    { icon: "🛡️", color: ORANGE },
  ];

  return (
    <div
      className="min-h-dvh text-slate-100"
      style={{
        background: `radial-gradient(1200px 600px at 80% -10%, rgba(52,193,204,0.15), transparent 60%), radial-gradient(900px 500px at 0% 10%, rgba(147,208,44,0.12), transparent 55%), ${NAVY}`,
      }}
    >
      {/* ---------- Barra superior (fija) ---------- */}
      <header
        className="sticky top-0 z-50 border-b border-white/10 backdrop-blur"
        style={{ background: "rgba(11,31,51,0.82)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Image
              src="/trama-logo.png"
              alt="Trama"
              width={40}
              height={40}
              className="rounded-xl"
              priority
            />
            <div className="leading-tight">
              <div className="text-lg font-bold tracking-tight">Trama</div>
              <div className="text-xs" style={{ color: LIME }}>
                {t.tagline}
              </div>
            </div>
          </div>
          <LangToggle lang={lang} setLang={setLang} />
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="mx-auto max-w-6xl px-6 pt-10 pb-16 sm:pt-16">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <span
              className="inline-block rounded-full border px-3 py-1 text-xs font-medium"
              style={{ borderColor: `${TEAL}55`, color: TEAL }}
            >
              {t.heroBadge}
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              {t.heroTitle1}
              <span style={{ color: LIME }}>{t.heroTitle2}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-300">
              {t.heroSubtitle}
            </p>
            <div className="mt-8">
              <a
                href="#como-funciona"
                className="inline-block rounded-full border border-white/20 px-6 py-3 text-base font-semibold text-slate-100 transition hover:bg-white/5"
              >
                {t.howCta}
              </a>
            </div>
            <p className="mt-6 text-sm text-slate-400">{t.heroNote}</p>
          </div>

          <div className="flex justify-center">
            <Image
              src="/trama-hero.png"
              alt={t.heroImgAlt}
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
        className="scroll-mt-20 border-t border-white/10"
        style={{ background: NAVY_DEEP }}
      >
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            {t.howTitle}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-300">
            {t.howSubtitle}
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-4">
            {t.steps.map((s, i) => (
              <Step
                key={i}
                n={String(i + 1)}
                color={stepColors[i]}
                title={s.title}
                body={s.body}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Posibilidades ---------- */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          {t.possTitle}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-300">
          {t.possSubtitle}
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {t.features.map((f, i) => (
            <Feature
              key={i}
              color={featureMeta[i].color}
              icon={featureMeta[i].icon}
              title={f.title}
              body={f.body}
            />
          ))}
        </div>
      </section>

      {/* ---------- Casos de uso ---------- */}
      <section className="border-t border-white/10" style={{ background: NAVY_DEEP }}>
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            {t.casesTitle}
          </h2>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {t.cases.map((c) => (
              <span
                key={c}
                className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-200"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- CTA final ---------- */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t.ctaTitle1}
          <span style={{ color: LIME }}>{t.ctaTitle2}</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-slate-300">{t.ctaSubtitle}</p>
      </section>

      {/* ---------- Footer (único acceso: Chat) ---------- */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-10">
          <button
            onClick={enter}
            className="rounded-full px-10 py-3 text-base font-semibold text-slate-900 transition hover:brightness-110"
            style={{ backgroundColor: LIME }}
          >
            Chat
          </button>
          <div className="flex w-full flex-col items-center justify-between gap-4 sm:flex-row">
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
                <span className="text-slate-400"> · {t.tagline}</span>
              </div>
            </div>
            <p className="text-xs text-slate-500">{t.footerNote}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function LangToggle({
  lang,
  setLang,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-full border border-white/15 text-xs font-semibold">
      {(["es", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className="px-3 py-1.5 uppercase transition"
          style={
            lang === l
              ? { backgroundColor: LIME, color: "#0f172a" }
              : { color: "#cbd5e1" }
          }
        >
          {l}
        </button>
      ))}
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
