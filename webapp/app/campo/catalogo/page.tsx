"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import SelectorMapa, { PuntoRef } from "@/components/SelectorMapa";
import { Cliente, Finca, Lote } from "@/lib/campoTypes";

type Parcela = {
  id: number;
  lote_id: number;
  codigo: string;
  nombre: string | null;
  lat: number;
  lng: number;
};
type Operario = {
  id: number;
  node_num: number | null;
  node_id: string | null;
  nombre: string;
  tipo: string;
  finca_codigo: string | null;
  tarifa_kg: number | null;
  activo: boolean;
};
type Cultivo = { codigo: string; nombre: string };
type NodoVisto = { node_num: number; node_id: string | null; long_name: string | null };

type Entidad = "finca" | "lote" | "parcela" | "operario";
type Edicion = {
  entidad: Entidad;
  id: string | number | null; // null = alta
  datos: Record<string, unknown>;
};

const CENTRO_CO = { lat: 4.55, lng: -74.3 };

export default function Catalogo() {
  const { contact } = useAuth();
  const [fincas, setFincas] = useState<Finca[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [operarios, setOperarios] = useState<Operario[]>([]);
  const [cultivos, setCultivos] = useState<Cultivo[]>([]);
  const [nodos, setNodos] = useState<NodoVisto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteSel, setClienteSel] = useState<number | null>(null);

  const [fincaSel, setFincaSel] = useState<string>("");
  const [loteSel, setLoteSel] = useState<number | null>(null);
  const [ed, setEd] = useState<Edicion | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);

  const load = useCallback(async () => {
    const [f, l, p, o, c, n, cl] = await Promise.all([
      supabase.from("campo_fincas").select("*").order("nombre"),
      supabase.from("campo_lotes").select("*").order("codigo"),
      supabase.from("campo_parcelas").select("*").order("codigo"),
      supabase.from("campo_operarios").select("*").order("nombre"),
      supabase.from("campo_cultivos").select("codigo,nombre").order("nombre"),
      supabase.from("nodes").select("node_num,node_id,long_name").order("long_name"),
      supabase.from("campo_clientes").select("*").eq("activo", true).order("nombre"),
    ]);
    setFincas((f.data as Finca[]) ?? []);
    setLotes((l.data as Lote[]) ?? []);
    setParcelas((p.data as Parcela[]) ?? []);
    setOperarios((o.data as Operario[]) ?? []);
    setCultivos((c.data as Cultivo[]) ?? []);
    setNodos((n.data as NodoVisto[]) ?? []);
    setClientes((cl.data as Cliente[]) ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // El personal de Trama trabaja sobre el cliente que elija; un admin de
  // cliente solo puede ver el suyo (RLS ya se lo garantiza).
  useEffect(() => {
    if (clienteSel != null) return;
    if (contact?.es_super) {
      if (clientes.length) setClienteSel(clientes[0].id);
    } else if (contact?.cliente_id != null) {
      setClienteSel(contact.cliente_id);
    }
  }, [clientes, contact, clienteSel]);

  const fincasCliente = useMemo(
    () => (clienteSel == null ? fincas : fincas.filter((f) => f.cliente_id === clienteSel)),
    [fincas, clienteSel],
  );

  useEffect(() => {
    if (fincasCliente.length && !fincasCliente.some((f) => f.codigo === fincaSel)) {
      setFincaSel(fincasCliente[0].codigo);
      setLoteSel(null);
    }
  }, [fincasCliente, fincaSel]);

  const finca = fincasCliente.find((f) => f.codigo === fincaSel) ?? null;
  const susLotes = useMemo(
    () => lotes.filter((l) => l.finca_codigo === fincaSel),
    [lotes, fincaSel],
  );
  const susOperarios = useMemo(
    () => operarios.filter((o) => o.finca_codigo === fincaSel),
    [operarios, fincaSel],
  );
  const susParcelas = useMemo(
    () => parcelas.filter((p) => p.lote_id === loteSel),
    [parcelas, loteSel],
  );

  const centroMapa = finca ? { lat: finca.lat, lng: finca.lng } : CENTRO_CO;
  const refsLotes: PuntoRef[] = susLotes.map((l) => ({
    clave: `l${l.id}`,
    lat: l.lat,
    lng: l.lng,
    titulo: `${l.codigo} · ${l.nombre}`,
  }));

  async function enviar(metodo: "POST" | "PATCH" | "DELETE", cuerpo: unknown, qs = "") {
    const { data } = await supabase.auth.getSession();
    const r = await fetch(`/api/campo/catalogo${qs}`, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session?.access_token}`,
      },
      body: metodo === "DELETE" ? undefined : JSON.stringify(cuerpo),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "Falló la operación");
    return j;
  }

  async function guardar() {
    if (!ed) return;
    setGuardando(true);
    setError(null);
    setOk(null);
    try {
      if (ed.id === null) {
        // El servidor decide el cliente definitivo; esto solo es la propuesta
        // de un super, y solo cuenta al crear una finca.
        await enviar("POST", {
          entidad: ed.entidad,
          datos: ed.datos,
          cliente_id: clienteSel,
        });
      } else {
        await enviar("PATCH", { entidad: ed.entidad, id: ed.id, datos: ed.datos });
      }
      setOk("Guardado.");
      setEd(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(entidad: Entidad, id: string | number) {
    setError(null);
    setOk(null);
    try {
      await enviar("DELETE", null, `?entidad=${entidad}&id=${encodeURIComponent(id)}`);
      setOk("Eliminado.");
      setBorrando(null);
      if (entidad === "lote" && id === loteSel) setLoteSel(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBorrando(null);
    }
  }

  const set = (k: string, v: unknown) =>
    setEd((p) => (p ? { ...p, datos: { ...p.datos, [k]: v } } : p));

  if (!contact?.is_admin) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col">
        <Cabecera />
        <p className="p-8 text-center text-sm text-slate-400">
          Solo un administrador puede editar el catálogo.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col pb-10">
      <Cabecera />

      <p className="px-4 pt-3 text-[11px] leading-relaxed text-slate-500">
        Los cambios llegan al gateway en unos minutos. Para que un operario los
        vea en el teléfono, debe pulsar <b>Descargar catálogo</b> en la pestaña
        Campo de la app.
      </p>

      {(error || ok) && (
        <div className="px-3 pt-3">
          <div
            className="rounded-xl p-3 text-xs"
            style={
              error
                ? { background: "rgba(222,79,116,0.12)", border: "1px solid rgba(222,79,116,0.45)", color: "#f0a8ba" }
                : { background: "rgba(104,169,30,0.12)", border: "1px solid rgba(104,169,30,0.45)", color: "#b7dd85" }
            }
          >
            {error ?? ok}
          </div>
        </div>
      )}

      {cargando ? (
        <p className="p-8 text-center text-sm text-slate-400">Cargando…</p>
      ) : (
        <>
          {/* ---------- Fincas ---------- */}
          {/* Selector de cliente: solo para el personal de Trama. */}
          {contact.es_super && (
            <Seccion titulo="Cliente">
              <select
                value={clienteSel ?? ""}
                onChange={(e) => {
                  setClienteSel(Number(e.target.value));
                  setFincaSel("");
                  setLoteSel(null);
                }}
                className="field w-full rounded-lg px-3 py-2 text-sm"
              >
                {clientes.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#0b1f33]">
                    {c.nombre}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] text-slate-500">
                Ves todos los clientes porque eres personal de Trama. Cada
                cliente solo se ve a sí mismo.
              </p>
            </Seccion>
          )}

          <Seccion titulo="Fincas">
            <div className="mb-3 flex flex-wrap gap-2">
              {fincasCliente.map((f) => (
                <button
                  key={f.codigo}
                  onClick={() => {
                    setFincaSel(f.codigo);
                    setLoteSel(null);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs ${
                    fincaSel === f.codigo ? "btn-lime" : "btn-ghost"
                  }`}
                >
                  {f.nombre}
                </button>
              ))}
              <button
                onClick={() =>
                  setEd({ entidad: "finca", id: null, datos: { departamento: "", municipio: "" } })
                }
                className="btn-ghost rounded-lg px-3 py-1.5 text-xs"
              >
                ＋ Nueva finca
              </button>
            </div>

            {finca && (
              <div className="card flex items-center gap-3 rounded-xl p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">
                    {finca.codigo} · {finca.nombre}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {finca.municipio}, {finca.departamento}
                    {finca.altitud_msnm ? ` · ${finca.altitud_msnm} msnm` : ""}
                  </p>
                </div>
                <Acciones
                  onEditar={() =>
                    setEd({ entidad: "finca", id: finca.codigo, datos: { ...finca } })
                  }
                  confirmando={borrando === `finca-${finca.codigo}`}
                  onBorrar={() => setBorrando(`finca-${finca.codigo}`)}
                  onConfirmar={() => borrar("finca", finca.codigo)}
                  onCancelar={() => setBorrando(null)}
                />
              </div>
            )}
          </Seccion>

          {/* ---------- Lotes ---------- */}
          {finca && (
            <Seccion titulo={`Lotes de ${finca.nombre}`}>
              {susLotes.length === 0 && (
                <p className="mb-2 text-xs text-slate-500">
                  Todavía no hay lotes en esta finca.
                </p>
              )}
              <ul className="space-y-2">
                {susLotes.map((l) => (
                  <li key={l.id}>
                    <div
                      className={`card flex items-center gap-3 rounded-xl p-3 ${
                        loteSel === l.id ? "ring-1 ring-[#93d02c]/50" : ""
                      }`}
                    >
                      <button
                        onClick={() => setLoteSel(loteSel === l.id ? null : l.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm font-medium text-slate-100">
                          {l.codigo} · {l.nombre}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {l.cultivo ?? "sin cultivo"}
                          {l.hectareas ? ` · ${l.hectareas} ha` : ""} ·{" "}
                          {parcelas.filter((p) => p.lote_id === l.id).length} parcelas
                        </p>
                      </button>
                      <Acciones
                        onEditar={() =>
                          setEd({ entidad: "lote", id: l.id, datos: { ...l } })
                        }
                        confirmando={borrando === `lote-${l.id}`}
                        onBorrar={() => setBorrando(`lote-${l.id}`)}
                        onConfirmar={() => borrar("lote", l.id)}
                        onCancelar={() => setBorrando(null)}
                      />
                    </div>

                    {/* Parcelas del lote abierto */}
                    {loteSel === l.id && (
                      <div className="mt-2 space-y-2 border-l border-white/10 pl-3">
                        {susParcelas.map((p) => (
                          <div
                            key={p.id}
                            className="card flex items-center gap-3 rounded-lg p-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs text-slate-200">
                                {p.codigo}
                                {p.nombre ? ` · ${p.nombre}` : ""}
                              </p>
                            </div>
                            <Acciones
                              pequeno
                              onEditar={() =>
                                setEd({ entidad: "parcela", id: p.id, datos: { ...p } })
                              }
                              confirmando={borrando === `parcela-${p.id}`}
                              onBorrar={() => setBorrando(`parcela-${p.id}`)}
                              onConfirmar={() => borrar("parcela", p.id)}
                              onCancelar={() => setBorrando(null)}
                            />
                          </div>
                        ))}
                        <button
                          onClick={() =>
                            setEd({
                              entidad: "parcela",
                              id: null,
                              datos: { lote_id: l.id, lat: l.lat, lng: l.lng },
                            })
                          }
                          className="btn-ghost w-full rounded-lg px-3 py-1.5 text-xs"
                        >
                          ＋ Nueva parcela en {l.codigo}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <button
                onClick={() =>
                  setEd({
                    entidad: "lote",
                    id: null,
                    datos: {
                      finca_codigo: finca.codigo,
                      lat: finca.lat,
                      lng: finca.lng,
                    },
                  })
                }
                className="btn-ghost mt-2 w-full rounded-lg px-3 py-2 text-xs"
              >
                ＋ Nuevo lote
              </button>
            </Seccion>
          )}

          {/* ---------- Operarios ---------- */}
          {finca && (
            <Seccion titulo={`Operarios de ${finca.nombre}`}>
              <p className="mb-2 text-[11px] text-slate-500">
                El nodo de radio es lo que identifica a quién captura. Si no
                coincide, el gateway responde «sin operario registrado».
              </p>
              <ul className="space-y-2">
                {susOperarios.map((o) => (
                  <li key={o.id} className="card flex items-center gap-3 rounded-xl p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-100">
                        {o.nombre}
                        {o.tipo === "dispositivo" && (
                          <span className="ml-2 text-[10px] uppercase text-slate-500">
                            dispositivo
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {o.node_id ?? o.node_num}
                        {o.tarifa_kg ? ` · $${o.tarifa_kg}/kg` : ""}
                        {o.activo ? "" : " · inactivo"}
                      </p>
                    </div>
                    <Acciones
                      onEditar={() =>
                        setEd({ entidad: "operario", id: o.id, datos: { ...o } })
                      }
                      confirmando={borrando === `operario-${o.id}`}
                      onBorrar={() => setBorrando(`operario-${o.id}`)}
                      onConfirmar={() => borrar("operario", o.id)}
                      onCancelar={() => setBorrando(null)}
                    />
                  </li>
                ))}
              </ul>
              <button
                onClick={() =>
                  setEd({
                    entidad: "operario",
                    id: null,
                    datos: { finca_codigo: finca.codigo, tipo: "persona", activo: true },
                  })
                }
                className="btn-ghost mt-2 w-full rounded-lg px-3 py-2 text-xs"
              >
                ＋ Nuevo operario
              </button>
            </Seccion>
          )}
        </>
      )}

      {/* ---------- Formulario ---------- */}
      {ed && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[#0b1f33] p-4 shadow-2xl sm:rounded-2xl">
            <h3 className="mb-3 text-sm font-semibold text-slate-100">
              {ed.id === null ? "Nuevo" : "Editar"}{" "}
              {ed.entidad === "finca"
                ? "finca"
                : ed.entidad === "lote"
                  ? "lote"
                  : ed.entidad === "parcela"
                    ? "parcela"
                    : "operario"}
            </h3>

            {ed.entidad === "finca" && (
              <>
                <Campo label="Código (3 letras)" valor={ed.datos.codigo} onChange={(v) => set("codigo", v)} placeholder="ESP" />
                <Campo label="Nombre" valor={ed.datos.nombre} onChange={(v) => set("nombre", v)} placeholder="La Esperanza" />
                <Campo label="Municipio" valor={ed.datos.municipio} onChange={(v) => set("municipio", v)} />
                <Campo label="Departamento" valor={ed.datos.departamento} onChange={(v) => set("departamento", v)} />
                <div className="grid grid-cols-2 gap-2">
                  <Campo label="Altitud (msnm)" valor={ed.datos.altitud_msnm} onChange={(v) => set("altitud_msnm", v)} tipo="number" />
                  <Campo label="Hectáreas" valor={ed.datos.hectareas} onChange={(v) => set("hectareas", v)} tipo="number" />
                </div>
                <p className="mb-1 mt-3 text-xs text-slate-300">
                  Marca el centro de la finca
                </p>
                <SelectorMapa
                  lat={numOrNull(ed.datos.lat)}
                  lng={numOrNull(ed.datos.lng)}
                  centro={CENTRO_CO}
                  onElegir={(la, ln) => {
                    set("lat", la);
                    set("lng", ln);
                  }}
                />
                <Coordenadas lat={ed.datos.lat} lng={ed.datos.lng} />
              </>
            )}

            {ed.entidad === "lote" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Campo label="Código" valor={ed.datos.codigo} onChange={(v) => set("codigo", v)} placeholder="L1" />
                  <Campo label="Hectáreas" valor={ed.datos.hectareas} onChange={(v) => set("hectareas", v)} tipo="number" />
                </div>
                <Campo label="Nombre" valor={ed.datos.nombre} onChange={(v) => set("nombre", v)} placeholder="El Alto" />
                <Selector
                  label="Cultivo"
                  valor={String(ed.datos.cultivo ?? "")}
                  onChange={(v) => set("cultivo", v)}
                  opciones={[
                    { valor: "", texto: "— sin cultivo —" },
                    ...cultivos.map((c) => ({ valor: c.codigo, texto: `${c.codigo} · ${c.nombre}` })),
                  ]}
                />
                <p className="mb-1 mt-3 text-xs text-slate-300">
                  Toca el mapa para marcar el lote
                </p>
                <SelectorMapa
                  lat={numOrNull(ed.datos.lat)}
                  lng={numOrNull(ed.datos.lng)}
                  centro={centroMapa}
                  referencias={refsLotes.filter((r) => r.clave !== `l${ed.id}`)}
                  onElegir={(la, ln) => {
                    set("lat", la);
                    set("lng", ln);
                  }}
                />
                <Coordenadas lat={ed.datos.lat} lng={ed.datos.lng} />
              </>
            )}

            {ed.entidad === "parcela" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Campo label="Código" valor={ed.datos.codigo} onChange={(v) => set("codigo", v)} placeholder="P1" />
                  <Campo label="Nombre (opcional)" valor={ed.datos.nombre} onChange={(v) => set("nombre", v)} />
                </div>
                <p className="mb-1 mt-3 text-xs text-slate-300">
                  Toca el mapa para marcar la parcela
                </p>
                <SelectorMapa
                  lat={numOrNull(ed.datos.lat)}
                  lng={numOrNull(ed.datos.lng)}
                  centro={centroMapa}
                  referencias={susParcelas
                    .filter((p) => p.id !== ed.id)
                    .map((p) => ({
                      clave: `p${p.id}`,
                      lat: p.lat,
                      lng: p.lng,
                      titulo: p.codigo,
                    }))}
                  onElegir={(la, ln) => {
                    set("lat", la);
                    set("lng", ln);
                  }}
                />
                <Coordenadas lat={ed.datos.lat} lng={ed.datos.lng} />
              </>
            )}

            {ed.entidad === "operario" && (
              <>
                <Campo label="Nombre" valor={ed.datos.nombre} onChange={(v) => set("nombre", v)} />
                <Selector
                  label="Nodo de radio"
                  valor={String(ed.datos.node_num ?? "")}
                  onChange={(v) => {
                    const n = nodos.find((x) => String(x.node_num) === v);
                    set("node_num", v);
                    set("node_id", n?.node_id ?? null);
                  }}
                  opciones={[
                    { valor: "", texto: "— elige un nodo —" },
                    ...nodos.map((n) => ({
                      valor: String(n.node_num),
                      texto: `${n.long_name ?? n.node_id ?? n.node_num} (${n.node_id ?? n.node_num})`,
                    })),
                  ]}
                />
                <p className="-mt-2 mb-3 text-[11px] text-slate-500">
                  Solo aparecen los nodos que el gateway ha visto en la malla.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Selector
                    label="Tipo"
                    valor={String(ed.datos.tipo ?? "persona")}
                    onChange={(v) => set("tipo", v)}
                    opciones={[
                      { valor: "persona", texto: "Persona" },
                      { valor: "dispositivo", texto: "Dispositivo (cámara)" },
                    ]}
                  />
                  <Campo label="Tarifa ($/kg)" valor={ed.datos.tarifa_kg} onChange={(v) => set("tarifa_kg", v)} tipo="number" />
                </div>
                <label className="mb-3 flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={ed.datos.activo !== false}
                    onChange={(e) => set("activo", e.target.checked)}
                  />
                  Activo
                </label>
              </>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={guardar}
                disabled={guardando}
                className="btn-lime flex-1 rounded-lg px-3 py-2.5 text-sm disabled:opacity-50"
              >
                {guardando ? "Guardando…" : "Guardar"}
              </button>
              <button
                onClick={() => setEd(null)}
                className="btn-ghost rounded-lg px-4 py-2.5 text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function numOrNull(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function Cabecera() {
  return (
    <header className="app-header flex items-center gap-3 px-4 py-3 text-slate-100">
      <Link href="/campo" className="btn-ghost rounded-lg px-2.5 py-1.5 text-xs">
        ‹
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="text-base font-semibold leading-tight">Catálogo</h1>
        <p className="truncate text-xs text-slate-400">
          Fincas, lotes, parcelas y operarios
        </p>
      </div>
    </header>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="px-3 pt-4">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Acciones({
  onEditar,
  onBorrar,
  onConfirmar,
  onCancelar,
  confirmando,
  pequeno,
}: {
  onEditar: () => void;
  onBorrar: () => void;
  onConfirmar: () => void;
  onCancelar: () => void;
  confirmando: boolean;
  pequeno?: boolean;
}) {
  const c = pequeno ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-xs";
  if (confirmando) {
    return (
      <div className="flex shrink-0 gap-1.5">
        <button
          onClick={onConfirmar}
          className={`rounded-lg ${c}`}
          style={{ background: "#de4f74", color: "#0b1f33", fontWeight: 600 }}
        >
          Borrar
        </button>
        <button onClick={onCancelar} className={`btn-ghost rounded-lg ${c}`}>
          No
        </button>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 gap-1.5">
      <button onClick={onEditar} className={`btn-ghost rounded-lg ${c}`}>
        Editar
      </button>
      <button onClick={onBorrar} className={`btn-ghost rounded-lg ${c}`}>
        ✕
      </button>
    </div>
  );
}

function Campo({
  label,
  valor,
  onChange,
  placeholder,
  tipo = "text",
}: {
  label: string;
  valor: unknown;
  onChange: (v: string) => void;
  placeholder?: string;
  tipo?: string;
}) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs text-slate-300">{label}</label>
      <input
        type={tipo}
        value={valor === null || valor === undefined ? "" : String(valor)}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="field w-full rounded-lg px-3 py-2 text-sm"
      />
    </div>
  );
}

function Selector({
  label,
  valor,
  onChange,
  opciones,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  opciones: { valor: string; texto: string }[];
}) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs text-slate-300">{label}</label>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="field w-full rounded-lg px-3 py-2 text-sm"
      >
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor} className="bg-[#0b1f33]">
            {o.texto}
          </option>
        ))}
      </select>
    </div>
  );
}

function Coordenadas({ lat, lng }: { lat: unknown; lng: unknown }) {
  const la = numOrNull(lat);
  const ln = numOrNull(lng);
  return (
    <p className="mt-1.5 text-[11px] tabular-nums text-slate-500">
      {la != null && ln != null
        ? `${la.toFixed(5)}, ${ln.toFixed(5)}`
        : "Sin marcar — toca el mapa"}
    </p>
  );
}
