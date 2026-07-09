import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// Datos para el panel de admin: contactos, nodos y asignaciones.
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const [contacts, nodes, assigns, emails] = await Promise.all([
    supabaseAdmin
      .from("contacts")
      .select("id,name,email,is_admin")
      .order("id"),
    supabaseAdmin
      .from("nodes")
      .select("node_num,long_name,short_name")
      .eq("is_gateway", false)
      .order("long_name"),
    supabaseAdmin.from("node_contacts").select("node_num,contact_id"),
    supabaseAdmin
      .from("email_contacts")
      .select("id,alias,email,name")
      .order("alias"),
  ]);

  return NextResponse.json({
    contacts: contacts.data ?? [],
    nodes: nodes.data ?? [],
    assigns: assigns.data ?? [],
    emailContacts: emails.data ?? [],
  });
}
