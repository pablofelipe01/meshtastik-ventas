import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// Marcar un lead como atendido / pendiente (?id=123, body { handled: boolean }).
export async function PATCH(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const { error } = await supabaseAdmin
    .from("leads")
    .update({ handled: Boolean(body.handled) })
    .eq("id", Number(id));
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// Eliminar un lead (?id=123).
export async function DELETE(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }
  const { error } = await supabaseAdmin
    .from("leads")
    .delete()
    .eq("id", Number(id));
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
