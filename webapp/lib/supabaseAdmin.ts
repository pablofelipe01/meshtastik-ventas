import { createClient } from "@supabase/supabase-js";

// Cliente con service_role — SOLO se usa en rutas de servidor (app/api/**).
// La service key nunca llega al navegador (no lleva prefijo NEXT_PUBLIC).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_KEY!;

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Verifica que el llamador (header Authorization: Bearer <token>) sea un admin.
 * Devuelve su email si lo es, o null.
 */
export async function requireAdmin(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  const email = data?.user?.email;
  if (error || !email) return null;
  const { data: c } = await supabaseAdmin
    .from("contacts")
    .select("is_admin")
    .eq("email", email)
    .maybeSingle();
  return c?.is_admin ? email : null;
}

/** Clave temporal legible (sin caracteres ambiguos). */
export function tempPassword(len = 10): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
