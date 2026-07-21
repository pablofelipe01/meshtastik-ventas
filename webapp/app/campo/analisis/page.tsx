"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import BarrasRanking, { ItemBarra } from "@/components/BarrasRanking";
import ColumnasPorDia, { DiaBarra } from "@/components/ColumnasPorDia";
import {
  Captura,
  CampoTipo,
  Finca,
  TIPO,
  TIPOS,
  compacto,
  diaCO,
  pesos,
} from "@/lib/campoTypes";

/** Supuestos del simulador. Todos visibles y ajustables: es una estimación. */
type Supuestos = {
  recolectores: number;
  pesajes: number; // pesadas por jornada y persona
  dias: number; // jornadas al mes
  precio: number; // $/kg de cereza pagado al productor
  tarifa: number; // $/kg pagado al recolector
  error: number; // % de descuadre del conteo manual
};

const INICIAL: Supuestos = {
  recolectores: 12,
  pesajes: 3,
  dias: 24,
  precio: 3200,
  tarifa: 900,
  error: 3,
};

export default function Analisis() {
  const { contact } = useAuth();
  const [capturas, setCapturas] = useState<Captura[]>([]);
  const [fincas, setFincas] = useState<Finca[]>([]);
  const [fincaSel, setFincaSel] = useState("");
  const [sup, setSup] = useState<Supuestos>(INICIAL);
  const [loading, setLoading] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [cap, fin] = await Promise.all([
      supabase
        .from("campo_capturas")
        .select("*")
        .order("recibido_at", { ascending: false })
        .limit(1000),
      supabase.from("campo_fincas").select("*").order("nombre"),
    ]);
    setCapturas((cap.data as Captura[]) ?? []);
    setFincas((fin.data as Finca[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("campo-analisis")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "campo_capturas" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const visibles = useMemo(
    () =>
      fincaSel ? capturas.filter((c) => c.finca_codigo === fincaSel) : capturas,
    [capturas, fincaSel],
  );

  // ---- Lo observado de verdad (base del simulador) ----
  const jornales = useMemo(
    () => visibles.filter((c) => c.tipo === "JOR" && (c.valor ?? 0) > 0),
    [visibles],
  );

  const kgPorPesaje = useMemo(() => {
    if (!jornales.length) return 32; // referencia si aún no hay datos
    return jornales.reduce((a, c) => a + (c.valor ?? 0), 0) / jornales.length;
  }, [jornales]);

  const demoraMedia = useMemo(() => {
    const ds = visibles
      .filter((c) => c.capturado_at)
      .map(
        (c) =>
          (new Date(c.recibido_at).getTime() -
            new Date(c.capturado_at!).getTime()) /
          1000,
      )
      .filter((s) => s >= 0 && s < 3600);
    if (!ds.length) return null;
    return ds.reduce((a, b) => a + b, 0) / ds.length;
  }, [visibles]);

  // ---- La simulación ----
  const sim = useMemo(() => {
    const kgJornada = kgPorPesaje * sup.pesajes * sup.recolectores;
    const kgMes = kgJornada * sup.dias;
    const ingresoMes = kgMes * sup.precio;
    const nominaMes = kgMes * sup.tarifa;
    const descuadreMes = nominaMes * (sup.error / 100);
    return { kgJornada, kgMes, ingresoMes, nominaMes, descuadreMes };
  }, [kgPorPesaje, sup]);

  // ---- Análisis ----
  const porOperario: ItemBarra[] = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of jornales) {
      const k = c.operario_nombre ?? "—";
      m.set(k, (m.get(k) ?? 0) + (c.valor ?? 0));
    }
    return [...m.entries()]
      .map(([etiqueta, valor]) => ({ clave: etiqueta, etiqueta, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);
  }, [jornales]);

  const dias: DiaBarra[] = useMemo(() => {
    const out: DiaBarra[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const clave = diaCO(d);
      const porTipo = {} as Record<CampoTipo, number>;
      for (const t of TIPOS) porTipo[t] = 0;
      let total = 0;
      for (const c of visibles) {
        if (diaCO(c.recibido_at) === clave) {
          porTipo[c.tipo] = (porTipo[c.tipo] ?? 0) + 1;
          total++;
        }
      }
      out.push({
        dia: clave,
        etiqueta: d
          .toLocaleDateString("es-CO", { weekday: "short", day: "numeric" })
          .replace(".", ""),
        porTipo,
        total,
      });
    }
    return out;
  }, [visibles]);

  // ---- Datos de demostración ----
  async function llamarDemo(metodo: "POST" | "DELETE") {
    setTrabajando(true);
    setAviso(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const r = await fetch("/api/campo/demo", {
        method: metodo,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: metodo === "POST" ? JSON.stringify({ cantidad: 60, dias: 7 }) : undefined,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "falló");
      setAviso(
        metodo === "POST"
          ? `Se generaron ${j.insertadas} capturas de demostración.`
          : `Se borraron ${j.borradas} capturas de demostración.`,
      );
      await load();
    } catch (e) {
      setAviso(`Error: ${e instanceof Error ? e.message : e}`);
    } finally {
      setTrabajando(false);
    }
  }

  const hayDemo = capturas.some((c) => c.datos?.demo === true);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="app-header flex items-center gap-3 px-4 py-3 text-slate-100">
        <Link href="/campo" className="btn-ghost rounded-lg px-2.5 py-1.5 text-xs">
          ‹
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold leading-tight">Análisis</h1>
          <p className="truncate text-xs text-slate-400">
            Qué dicen los datos que llegan por la mesh
          </p>
        </div>
      </header>

      <div className="flex gap-2 overflow-x-auto px-3 pt-3">
        <button
          onClick={() => setFincaSel("")}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs ${
            fincaSel === "" ? "btn-lime" : "btn-ghost"
          }`}
        >
          Todas
        </button>
        {fincas.map((f) => (
          <button
            key={f.codigo}
            onClick={() => setFincaSel(f.codigo)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs ${
              fincaSel === f.codigo ? "btn-lime" : "btn-ghost"
            }`}
          >
            {f.nombre}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="p-8 text-center text-sm text-slate-400">Cargando…</p>
      ) : (
        <>
          {/* La cifra real: lo que se midió, no lo que se promete. */}
          <section className="px-3 pt-3">
            <div className="card rounded-xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Demora medida del dato
              </p>
              <p className="mt-1 text-5xl font-semibold leading-none text-[#68a91e]">
                {demoraMedia == null
                  ? "—"
                  : demoraMedia < 90
                    ? `${Math.round(demoraMedia)} s`
                    : `${Math.round(demoraMedia / 60)} min`}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Desde que el operario registra en campo —sin señal— hasta que el
                dato está en la base. Medido sobre{" "}
                {visibles.filter((c) => c.capturado_at).length} capturas.
              </p>
            </div>
          </section>

          {/* ---------- Simulador ---------- */}
          <section className="p-3">
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Simulador · ¿y si fuera toda la finca?
            </h2>
            <div className="card rounded-xl p-4">
              <p className="mb-4 text-xs text-slate-400">
                Parte de lo observado —{" "}
                <b className="text-slate-200">
                  {kgPorPesaje.toLocaleString("es-CO", {
                    maximumFractionDigits: 1,
                  })}{" "}
                  kg
                </b>{" "}
                por pesaje
                {jornales.length
                  ? ` en ${jornales.length} pesajes reales`
                  : " (referencia: aún no hay pesajes)"}
                — y lo escala. Mueve los supuestos.
              </p>

              <Deslizador
                label="Recolectores en campo"
                valor={sup.recolectores}
                min={1}
                max={80}
                paso={1}
                sufijo=""
                onChange={(v) => setSup({ ...sup, recolectores: v })}
              />
              <Deslizador
                label="Pesajes por jornada"
                valor={sup.pesajes}
                min={1}
                max={6}
                paso={1}
                sufijo=""
                onChange={(v) => setSup({ ...sup, pesajes: v })}
              />
              <Deslizador
                label="Jornadas al mes"
                valor={sup.dias}
                min={1}
                max={26}
                paso={1}
                sufijo=""
                onChange={(v) => setSup({ ...sup, dias: v })}
              />
              <Deslizador
                label="Precio del kilo"
                valor={sup.precio}
                min={1500}
                max={8000}
                paso={100}
                sufijo=" $/kg"
                onChange={(v) => setSup({ ...sup, precio: v })}
              />
              <Deslizador
                label="Tarifa al recolector"
                valor={sup.tarifa}
                min={400}
                max={2000}
                paso={50}
                sufijo=" $/kg"
                onChange={(v) => setSup({ ...sup, tarifa: v })}
              />
              <Deslizador
                label="Descuadre del conteo manual"
                valor={sup.error}
                min={0}
                max={10}
                paso={0.5}
                sufijo=" %"
                onChange={(v) => setSup({ ...sup, error: v })}
              />

              <div className="mt-5 grid grid-cols-2 gap-2">
                <Salida
                  label="Cosecha por jornada"
                  valor={`${compacto(sim.kgJornada)} kg`}
                />
                <Salida label="Cosecha al mes" valor={`${compacto(sim.kgMes)} kg`} />
                <Salida label="Ingreso al mes" valor={pesos(sim.ingresoMes)} />
                <Salida
                  label="Nómina de recolección"
                  valor={pesos(sim.nominaMes)}
                />
              </div>

              <div
                className="mt-3 rounded-xl p-4"
                style={{
                  background: "rgba(201,109,36,0.12)",
                  border: "1px solid rgba(201,109,36,0.45)",
                }}
              >
                <p className="text-[11px] uppercase tracking-wide text-slate-300">
                  Se va sin que nadie lo vea
                </p>
                <p
                  className="mt-1 text-4xl font-semibold leading-none"
                  style={{ color: "#e08a3c" }}
                >
                  {pesos(sim.descuadreMes)}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  Al mes, con un descuadre del {sup.error}% en el conteo manual.
                  Es lo que cuesta enterarse tarde.
                </p>
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                Es una <b>estimación</b>, no una promesa: escala linealmente los
                pesajes observados y usa los supuestos de arriba. Sirve para
                dimensionar el orden de magnitud, no para liquidar nómina.
              </p>
            </div>
          </section>

          {/* ---------- Análisis ---------- */}
          <section className="px-3 pb-3">
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Kilos recogidos por operario
            </h2>
            <div className="card rounded-xl p-4">
              <BarrasRanking items={porOperario} unidad="kg" />
            </div>
          </section>

          <section className="px-3 pb-3">
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Actividad de los últimos 7 días
            </h2>
            <div className="card rounded-xl p-4">
              <ColumnasPorDia dias={dias} />
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-white/[0.06] pt-3">
                {TIPOS.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1.5 text-[11px] text-slate-400"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: TIPO[t].color }}
                    />
                    {TIPO[t].label}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* ---------- Datos de demostración ---------- */}
          {contact?.is_admin && (
            <section className="px-3 pb-8">
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Datos de demostración
              </h2>
              <div className="card rounded-xl p-4">
                <p className="mb-3 text-xs text-slate-400">
                  Genera capturas creíbles con el catálogo real, para que el panel
                  se vea vivo sin tener gente en campo. Quedan marcadas y se
                  borran de un golpe. <b className="text-slate-300">No</b> se
                  suben a Airtable.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    disabled={trabajando}
                    onClick={() => llamarDemo("POST")}
                    className="btn-lime rounded-lg px-3 py-2 text-xs disabled:opacity-50"
                  >
                    {trabajando ? "Trabajando…" : "Generar 60 capturas"}
                  </button>
                  <button
                    disabled={trabajando || !hayDemo}
                    onClick={() => llamarDemo("DELETE")}
                    className="btn-ghost rounded-lg px-3 py-2 text-xs disabled:opacity-40"
                  >
                    Borrar datos de demostración
                  </button>
                </div>
                {aviso && (
                  <p className="mt-3 text-xs text-slate-300">{aviso}</p>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function Deslizador({
  label,
  valor,
  min,
  max,
  paso,
  sufijo,
  onChange,
}: {
  label: string;
  valor: number;
  min: number;
  max: number;
  paso: number;
  sufijo: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-3.5">
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-xs text-slate-300">{label}</label>
        <span className="text-xs font-medium tabular-nums text-slate-100">
          {valor.toLocaleString("es-CO")}
          {sufijo}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={paso}
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        className="deslizador w-full"
        aria-label={label}
      />
    </div>
  );
}

function Salida({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl bg-white/[0.04] p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold text-slate-100">{valor}</p>
    </div>
  );
}
