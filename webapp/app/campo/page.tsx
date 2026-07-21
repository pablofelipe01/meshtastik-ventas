"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { timeAgo, hhmm } from "@/lib/format";
import CampoMap from "@/components/CampoMap";
import {
  Captura,
  Finca,
  Lote,
  TIPO,
  TIPOS,
  compacto,
  demora,
  esHoy,
  pesos,
  valorTexto,
} from "@/lib/campoTypes";

export default function Campo() {
  const [capturas, setCapturas] = useState<Captura[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [fincas, setFincas] = useState<Finca[]>([]);
  const [fincaSel, setFincaSel] = useState<string>("");
  const [nuevos, setNuevos] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const load = useCallback(async () => {
    const [cap, lot, fin] = await Promise.all([
      supabase
        .from("campo_capturas")
        .select("*")
        .order("recibido_at", { ascending: false })
        .limit(100),
      supabase.from("campo_lotes").select("*"),
      supabase.from("campo_fincas").select("*").order("nombre"),
    ]);
    setCapturas((cap.data as Captura[]) ?? []);
    setLotes((lot.data as Lote[]) ?? []);
    setFincas((fin.data as Finca[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Solo INSERT: el espejo a Airtable hace PATCH sobre cada fila, y
    // escuchando "*" la página se recargaría en bucle.
    const ch = supabase
      .channel("campo-capturas")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "campo_capturas" },
        (payload) => {
          const id = (payload.new as { id?: number })?.id;
          if (typeof id === "number") {
            setNuevos((prev) => new Set(prev).add(id));
            const t = setTimeout(
              () =>
                setNuevos((prev) => {
                  const n = new Set(prev);
                  n.delete(id);
                  return n;
                }),
              5000,
            );
            timers.current.push(t);
          }
          load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [load]);

  const finca = fincas.find((f) => f.codigo === fincaSel) ?? null;
  const enFinca = <T extends { finca_codigo: string | null }>(xs: T[]) =>
    fincaSel ? xs.filter((x) => x.finca_codigo === fincaSel) : xs;

  const visibles = enFinca(capturas);
  const lotesVis = enFinca(lotes);
  const hoy = visibles.filter((c) => esHoy(c.recibido_at));

  const kgJornal = hoy
    .filter((c) => c.tipo === "JOR")
    .reduce((a, c) => a + (c.valor ?? 0), 0);
  const pagoDia = hoy
    .filter((c) => c.tipo === "JOR")
    .reduce((a, c) => a + Number(c.datos?.pago_cop ?? 0), 0);
  const focos = hoy.filter((c) => c.tipo === "PLG").length;
  const ultimoGan = visibles.find((c) => c.tipo === "GAN");
  const ultima = visibles[0];

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="app-header flex items-center gap-3 px-4 py-3 text-slate-100">
        <Link href="/" className="btn-ghost rounded-lg px-2.5 py-1.5 text-xs">
          ‹
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold leading-tight">Campo</h1>
          <p className="flex items-center gap-1.5 truncate text-xs text-slate-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#68a91e] opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#68a91e]" />
            </span>
            En vivo desde la mesh
          </p>
        </div>
      </header>

      {/* Filtro: una sola fila, encima de los datos. */}
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

      {/* Figura principal: el número con el que abre el panel. */}
      <section className="px-3 pt-3">
        <div className="card rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Capturas hoy
          </p>
          <p className="mt-1 text-5xl font-semibold leading-none text-slate-50">
            {hoy.length}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            {ultima
              ? `Última ${timeAgo(ultima.recibido_at)} · ${ultima.operario_nombre ?? "—"}`
              : "Aún no hay capturas"}
          </p>
        </div>
      </section>

      <div className="mt-3 h-[34dvh] w-full bg-[#081726]">
        <CampoMap lotes={lotesVis} capturas={visibles} finca={finca} />
      </div>

      {/* Fila de indicadores */}
      <section className="grid grid-cols-2 gap-2 p-3">
        <Tile label="Jornal hoy" value={`${compacto(kgJornal)} kg`} />
        <Tile label="Pago del día" value={pesos(pagoDia)} />
        <Tile label="Focos de plaga" value={String(focos)} />
        <Tile
          label="Último conteo"
          value={ultimoGan ? `${compacto(ultimoGan.valor ?? 0)} cab.` : "—"}
        />
      </section>

      {/* Leyenda: con 5 series, la identidad nunca puede ir solo por color. */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 px-4 pb-1">
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

      <section className="flex-1 p-3">
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Actividad ({visibles.length})
        </h2>

        {loading ? (
          <p className="p-4 text-center text-sm text-slate-400">Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="p-4 text-center text-sm text-slate-400">
            Todavía no hay capturas. Aparecerán aquí en cuanto un operario
            registre un dato en campo.
          </p>
        ) : (
          <ul className="space-y-2">
            {visibles.map((c) => {
              const t = TIPO[c.tipo];
              const d = demora(c);
              return (
                <li
                  key={c.id}
                  className={`card flex items-center gap-3 rounded-xl p-3 ${
                    nuevos.has(c.id) ? "flash-nuevo" : ""
                  }`}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
                    style={{
                      backgroundColor: `${t?.color ?? "#94a3b8"}22`,
                      border: `1px solid ${t?.color ?? "#94a3b8"}66`,
                    }}
                  >
                    {t?.icon ?? "•"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-100">
                      {valorTexto(c)}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {t?.label} · {c.finca_codigo} {c.lote_codigo}
                      {c.parcela_codigo} · {c.operario_nombre ?? "—"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-slate-400">
                      {hhmm(c.recibido_at)}
                    </p>
                    {d && (
                      <p className="text-[10px] text-slate-500" title="Demora entre la captura en campo y su llegada al gateway">
                        +{d}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card rounded-xl p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-semibold text-slate-100">{value}</p>
    </div>
  );
}
