import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin, tempPassword } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// Crea (o actualiza) un familiar: cuenta de acceso + contacto + nodos asignados.
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name: string = (body.name ?? "").trim();
  const email: string = (body.email ?? "").trim().toLowerCase();
  const nodeNums: number[] = Array.isArray(body.node_nums) ? body.node_nums : [];

  if (!name || !email) {
    return NextResponse.json(
      { error: "Nombre y email son obligatorios." },
      { status: 400 },
    );
  }

  // 1. Crear la cuenta de acceso (auth). Si ya existe, seguimos y solo
  //    vinculamos el contacto (no reseteamos su clave).
  const pw = tempPassword();
  const { error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: pw,
    email_confirm: true,
  });
  const userExisted = !!authErr; // típicamente "email already registered"

  // 2. Crear/actualizar el contacto.
  const { data: contact, error: conErr } = await supabaseAdmin
    .from("contacts")
    .upsert({ name, email }, { onConflict: "email" })
    .select("id,name,email")
    .single();
  if (conErr || !contact) {
    return NextResponse.json(
      { error: conErr?.message ?? "No se pudo guardar el contacto." },
      { status: 400 },
    );
  }

  // 3. Asignar nodos.
  if (nodeNums.length) {
    await supabaseAdmin
      .from("node_contacts")
      .upsert(
        nodeNums.map((n) => ({ node_num: n, contact_id: contact.id })),
        { onConflict: "node_num,contact_id" },
      );
  }

  return NextResponse.json({
    contact,
    tempPassword: userExisted ? null : pw,
    note: userExisted
      ? "La cuenta ya existía; se vinculó/actualizó el contacto y sus nodos."
      : null,
  });
}
