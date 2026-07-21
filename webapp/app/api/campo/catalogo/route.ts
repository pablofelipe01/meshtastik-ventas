import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdminCtx, type CtxAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Altas, cambios y bajas del catálogo de Campo (fincas, lotes, parcelas y
 * operarios). Escribe con service_role porque las políticas RLS de `campo_*`
 * solo conceden lectura; el permiso real lo da `requireAdmin`.
 *
 * Montar un cliente nuevo ya no requiere SQL.
 */

type Entidad = "finca" | "lote" | "parcela" | "operario";

const TABLA: Record<Entidad, string> = {
  finca: "campo_fincas",
  lote: "campo_lotes",
  parcela: "campo_parcelas",
  operario: "campo_operarios",
};

/** La clave primaria de `campo_fincas` es su código; las demás usan `id`. */
const CLAVE: Record<Entidad, string> = {
  finca: "codigo",
  lote: "id",
  parcela: "id",
  operario: "id",
};

function esEntidad(v: unknown): v is Entidad {
  return typeof v === "string" && v in TABLA;
}

function num(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Deja solo los campos que cada entidad admite y normaliza tipos. */
function limpiar(entidad: Entidad, d: Record<string, unknown>): Record<string, unknown> {
  switch (entidad) {
    case "finca":
      return {
        codigo: texto(d.codigo).toUpperCase(),
        nombre: texto(d.nombre),
        municipio: texto(d.municipio),
        departamento: texto(d.departamento),
        lat: num(d.lat),
        lng: num(d.lng),
        altitud_msnm: num(d.altitud_msnm),
        hectareas: num(d.hectareas),
      };
    case "lote":
      return {
        finca_codigo: texto(d.finca_codigo).toUpperCase(),
        codigo: texto(d.codigo).toUpperCase(),
        nombre: texto(d.nombre),
        cultivo: texto(d.cultivo).toUpperCase() || null,
        hectareas: num(d.hectareas),
        hato_esperado: num(d.hato_esperado),
        lat: num(d.lat),
        lng: num(d.lng),
      };
    case "parcela":
      return {
        lote_id: num(d.lote_id),
        codigo: texto(d.codigo).toUpperCase(),
        nombre: texto(d.nombre) || null,
        lat: num(d.lat),
        lng: num(d.lng),
      };
    case "operario":
      return {
        node_num: num(d.node_num),
        node_id: texto(d.node_id) || null,
        nombre: texto(d.nombre),
        tipo: texto(d.tipo) === "dispositivo" ? "dispositivo" : "persona",
        finca_codigo: texto(d.finca_codigo).toUpperCase(),
        tarifa_kg: num(d.tarifa_kg),
        activo: d.activo === false ? false : true,
      };
  }
}

/** Comprobaciones mínimas antes de tocar la base. */
function validar(entidad: Entidad, f: Record<string, unknown>): string | null {
  const req = (campo: string, etiqueta: string) =>
    !texto(f[campo]) ? `Falta ${etiqueta}.` : null;

  switch (entidad) {
    case "finca":
      return (
        req("codigo", "el código") ??
        req("nombre", "el nombre") ??
        (texto(f.codigo).length > 8 ? "El código de finca es muy largo." : null)
      );
    case "lote":
      return (
        req("finca_codigo", "la finca") ??
        req("codigo", "el código") ??
        req("nombre", "el nombre") ??
        (f.lat == null || f.lng == null
          ? "Marca el lote en el mapa."
          : null)
      );
    case "parcela":
      return (
        (f.lote_id == null ? "Falta el lote." : null) ??
        req("codigo", "el código") ??
        (f.lat == null || f.lng == null
          ? "Marca la parcela en el mapa."
          : null)
      );
    case "operario":
      return (
        req("nombre", "el nombre") ??
        req("finca_codigo", "la finca") ??
        (f.node_num == null ? "Falta el nodo de radio." : null)
      );
  }
}

/**
 * A qué cliente pertenece la fila que se va a escribir.
 *
 * Se DERIVA del padre (la finca del lote, el lote de la parcela) en vez de
 * creerle al navegador: así es imposible colar un lote de un cliente bajo la
 * finca de otro. Devuelve un mensaje de error si no se puede determinar o si
 * ese administrador no tiene permiso sobre ese cliente.
 */
async function resolverCliente(
  entidad: Entidad,
  f: Record<string, unknown>,
  ctx: CtxAdmin,
  clienteSolicitado: unknown,
): Promise<{ clienteId?: number; error?: string }> {
  let clienteId: number | null = null;

  if (entidad === "finca") {
    // Un super puede elegir cliente; cualquier otro admin usa el suyo.
    clienteId = ctx.esSuper ? (num(clienteSolicitado) ?? ctx.clienteId) : ctx.clienteId;
    if (clienteId == null) return { error: "Elige a qué cliente pertenece la finca." };
  } else if (entidad === "lote" || entidad === "operario") {
    const { data } = await supabaseAdmin
      .from("campo_fincas")
      .select("cliente_id")
      .eq("codigo", texto(f.finca_codigo))
      .maybeSingle();
    if (!data) return { error: "Esa finca no existe." };
    clienteId = data.cliente_id as number;
  } else {
    const { data } = await supabaseAdmin
      .from("campo_lotes")
      .select("cliente_id")
      .eq("id", num(f.lote_id) ?? -1)
      .maybeSingle();
    if (!data) return { error: "Ese lote no existe." };
    clienteId = data.cliente_id as number;
  }

  if (!ctx.esSuper && clienteId !== ctx.clienteId) {
    return { error: "No puedes modificar el catálogo de otro cliente." };
  }
  return { clienteId };
}

/** Comprueba que el admin puede tocar una fila ya existente. */
async function puedeTocar(
  entidad: Entidad,
  id: string | number,
  ctx: CtxAdmin,
): Promise<boolean> {
  if (ctx.esSuper) return true;
  const { data } = await supabaseAdmin
    .from(TABLA[entidad])
    .select("cliente_id")
    .eq(CLAVE[entidad], id)
    .maybeSingle();
  return !!data && data.cliente_id === ctx.clienteId;
}

/** Traduce errores de Postgres a algo que un humano entienda. */
function mensajeError(e: { code?: string; message: string }): string {
  if (e.code === "23505") {
    return "Ya existe un registro con ese código.";
  }
  if (e.code === "23503") {
    return "No se puede borrar: tiene capturas u otros registros asociados.";
  }
  if (e.code === "23514") {
    return "Algún valor no es válido para ese campo.";
  }
  return e.message;
}

export async function POST(req: Request) {
  const ctx = await requireAdminCtx(req);
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const entidad = body.entidad;
  if (!esEntidad(entidad)) {
    return NextResponse.json({ error: "Entidad desconocida" }, { status: 400 });
  }
  const fila = limpiar(entidad, (body.datos ?? {}) as Record<string, unknown>);
  const problema = validar(entidad, fila);
  if (problema) return NextResponse.json({ error: problema }, { status: 400 });

  const { clienteId, error: errCliente } = await resolverCliente(
    entidad, fila, ctx, body.cliente_id,
  );
  if (errCliente) return NextResponse.json({ error: errCliente }, { status: 400 });
  fila.cliente_id = clienteId;

  const { data, error } = await supabaseAdmin
    .from(TABLA[entidad])
    .insert(fila)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 400 });
  }
  return NextResponse.json({ ok: true, fila: data });
}

export async function PATCH(req: Request) {
  const ctx = await requireAdminCtx(req);
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const entidad = body.entidad;
  if (!esEntidad(entidad)) {
    return NextResponse.json({ error: "Entidad desconocida" }, { status: 400 });
  }
  if (body.id === undefined || body.id === null || body.id === "") {
    return NextResponse.json({ error: "Falta el identificador" }, { status: 400 });
  }
  if (!(await puedeTocar(entidad, body.id as string | number, ctx))) {
    return NextResponse.json(
      { error: "No puedes modificar el catálogo de otro cliente." },
      { status: 403 },
    );
  }
  const fila = limpiar(entidad, (body.datos ?? {}) as Record<string, unknown>);
  const problema = validar(entidad, fila);
  if (problema) return NextResponse.json({ error: problema }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from(TABLA[entidad])
    .update(fila)
    .eq(CLAVE[entidad], body.id as string | number)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 400 });
  }
  return NextResponse.json({ ok: true, fila: data });
}

export async function DELETE(req: Request) {
  const ctx = await requireAdminCtx(req);
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const url = new URL(req.url);
  const entidad = url.searchParams.get("entidad");
  const id = url.searchParams.get("id");
  if (!esEntidad(entidad) || !id) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }
  if (!(await puedeTocar(entidad, id, ctx))) {
    return NextResponse.json(
      { error: "No puedes modificar el catálogo de otro cliente." },
      { status: 403 },
    );
  }
  const { error } = await supabaseAdmin
    .from(TABLA[entidad])
    .delete()
    .eq(CLAVE[entidad], id);
  if (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
