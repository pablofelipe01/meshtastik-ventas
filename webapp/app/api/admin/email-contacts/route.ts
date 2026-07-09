import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// Crear/actualizar una entrada de la libreta de correos (alias → email).
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const alias: string = (body.alias ?? "").trim().toLowerCase();
  const email: string = (body.email ?? "").trim();
  const name: string = (body.name ?? "").trim();

  if (!alias || !email) {
    return NextResponse.json(
      { error: "Alias y email son obligatorios." },
      { status: 400 },
    );
  }
  if (/\s/.test(alias)) {
    return NextResponse.json(
      { error: "El alias debe ser una sola palabra (sin espacios)." },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("email_contacts")
    .upsert({ alias, email, name: name || null }, { onConflict: "alias" })
    .select("id,alias,email,name")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ emailContact: data });
}

// Eliminar una entrada por id (?id=123).
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
    .from("email_contacts")
    .delete()
    .eq("id", Number(id));
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
