import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdminCtx } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Generador de datos de demostración para el módulo Campo.
 *
 * Inventa capturas creíbles usando el catálogo REAL (mismas fincas, lotes,
 * parcelas y operarios), para que el panel se vea vivo sin necesidad de tener
 * gente caminando en el campo durante una demo.
 *
 * Dos decisiones importantes:
 *  - Cada fila queda marcada con `datos.demo = true`, así se puede borrar todo
 *    sin tocar ni un dato real (DELETE de esta misma ruta).
 *  - Se insertan con `airtable_synced_at` ya puesto, para que el espejo del
 *    gateway las IGNORE. Los datos inventados no deben ensuciar el Airtable que
 *    se le enseña al cliente — y si se borran de aquí, no quedan huérfanos allá.
 */

type Lote = {
  id: number;
  finca_codigo: string;
  codigo: string;
  cultivo: string | null;
};
type Parcela = { id: number; lote_id: number; codigo: string; lat: number; lng: number };
type Operario = {
  id: number;
  node_num: number;
  nombre: string;
  tipo: string;
  finca_codigo: string;
  tarifa_kg: number | null;
};

const UNIDADES: Record<string, string> = {
  CAF: "kg cereza",
  CAC: "kg baba",
  PLA: "racimos",
  PAL: "kg RFF",
  GAN: "cabezas",
};

function entre(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
function elegir<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}

export async function POST(req: Request) {
  const ctx = await requireAdminCtx(req);
  if (!ctx) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const cantidad = Math.min(Math.max(Number(body.cantidad) || 40, 1), 300);
  const dias = Math.min(Math.max(Number(body.dias) || 7, 1), 60);

  // Un super puede generar para el cliente que elija; el resto, solo el suyo.
  const clienteId = ctx.esSuper
    ? (Number(body.cliente_id) || ctx.clienteId)
    : ctx.clienteId;
  if (!clienteId) {
    return NextResponse.json(
      { error: "Elige para qué cliente generar los datos." },
      { status: 400 },
    );
  }

  const [{ data: lotes }, { data: parcelas }, { data: operarios }, { data: plagas }] =
    await Promise.all([
      supabaseAdmin
        .from("campo_lotes")
        .select("id,finca_codigo,codigo,cultivo")
        .eq("cliente_id", clienteId),
      supabaseAdmin
        .from("campo_parcelas")
        .select("id,lote_id,codigo,lat,lng")
        .eq("cliente_id", clienteId),
      supabaseAdmin
        .from("campo_operarios")
        .select("id,node_num,nombre,tipo,finca_codigo,tarifa_kg")
        .eq("activo", true)
        .eq("cliente_id", clienteId),
      supabaseAdmin.from("campo_plagas").select("codigo,nombre,cultivo"),
    ]);

  if (!lotes?.length || !parcelas?.length || !operarios?.length) {
    return NextResponse.json(
      { error: "El catálogo está vacío; siembra fincas y lotes primero." },
      { status: 400 },
    );
  }

  const filas = [];
  for (let i = 0; i < cantidad; i++) {
    const op = elegir(operarios as Operario[]);
    const susLotes = (lotes as Lote[]).filter((l) => l.finca_codigo === op.finca_codigo);
    if (!susLotes.length) continue;
    const lote = elegir(susLotes);
    const susParcelas = (parcelas as Parcela[]).filter((p) => p.lote_id === lote.id);
    if (!susParcelas.length) continue;
    const parcela = elegir(susParcelas);

    // La cámara solo cuenta ganado; las personas hacen el resto.
    const tipo =
      op.tipo === "dispositivo"
        ? "GAN"
        : lote.cultivo === "GAN"
          ? elegir(["GAN", "PLG"])
          : elegir(["FRJ", "JOR", "JOR", "CEN", "PLG"]); // el jornal es lo más frecuente

    // Dispersar en horario de trabajo dentro de los últimos `dias`.
    const diaAtras = Math.floor(entre(0, dias));
    const recibido = new Date();
    recibido.setDate(recibido.getDate() - diaAtras);
    recibido.setHours(6 + Math.floor(entre(0, 11)), Math.floor(entre(0, 60)), 0, 0);
    // Demora realista: lo que tarda un paquete LoRa en llegar.
    const capturado = new Date(recibido.getTime() - Math.round(entre(3, 12)) * 1000);

    let valor: number;
    let unidad: string;
    const datos: Record<string, unknown> = { demo: true };

    switch (tipo) {
      case "FRJ":
        valor = Math.round(entre(320, 1250));
        unidad = "frutos";
        datos.estado = "maduro";
        break;
      case "JOR": {
        valor = Math.round(entre(14, 58) * 10) / 10;
        unidad = "kg";
        const tarifa = Number(op.tarifa_kg ?? 0);
        if (tarifa) {
          datos.tarifa_kg = tarifa;
          datos.pago_cop = Math.round(valor * tarifa);
        }
        break;
      }
      case "PLG": {
        const delCultivo = (plagas ?? []).filter(
          (p: { cultivo: string | null }) => p.cultivo === lote.cultivo,
        );
        const p = delCultivo.length ? elegir(delCultivo) : elegir(plagas ?? []);
        if (!p) continue;
        valor = Math.ceil(entre(0.5, 5));
        unidad = "severidad";
        datos.plaga = p.codigo;
        datos.plaga_nombre = p.nombre;
        datos.severidad = valor;
        break;
      }
      case "CEN":
        valor = Math.round(entre(180, 2400));
        unidad = UNIDADES[lote.cultivo ?? ""] ?? "kg";
        break;
      default: // GAN
        valor = Math.round(entre(45, 190));
        unidad = "cabezas";
        datos.confianza = Math.round(entre(0.82, 0.99) * 100) / 100;
        datos.fuente = "camara";
    }

    filas.push({
      tipo,
      cliente_id: clienteId,
      finca_codigo: op.finca_codigo,
      lote_id: lote.id,
      parcela_id: parcela.id,
      lote_codigo: lote.codigo,
      parcela_codigo: parcela.codigo,
      cultivo: lote.cultivo,
      node_num: op.node_num,
      operario_id: op.id,
      operario_nombre: op.nombre,
      valor,
      unidad,
      datos,
      lat: parcela.lat,
      lng: parcela.lng,
      raw: `@ag|${tipo}|${lote.codigo}|${parcela.codigo}|${valor} (demo)`,
      capturado_at: capturado.toISOString(),
      recibido_at: recibido.toISOString(),
      // Ya "sincronizado": el espejo del gateway no sube datos inventados.
      airtable_synced_at: new Date().toISOString(),
    });
  }

  const { error } = await supabaseAdmin.from("campo_capturas").insert(filas);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, insertadas: filas.length });
}

/**
 * Borra las capturas de demostración. No toca ningún dato real, ni las de otro
 * cliente: un super borra las del cliente que indique; el resto, solo el suyo.
 */
export async function DELETE(req: Request) {
  const ctx = await requireAdminCtx(req);
  if (!ctx) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const pedido = Number(new URL(req.url).searchParams.get("cliente_id"));
  const clienteId = ctx.esSuper ? (pedido || ctx.clienteId) : ctx.clienteId;
  if (!clienteId) {
    return NextResponse.json(
      { error: "Elige de qué cliente borrar los datos." },
      { status: 400 },
    );
  }
  const { data, error } = await supabaseAdmin
    .from("campo_capturas")
    .delete()
    .eq("datos->>demo", "true")
    .eq("cliente_id", clienteId)
    .select("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, borradas: data?.length ?? 0 });
}
