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

export type CtxAdmin = {
  email: string;
  clienteId: number | null;
  esSuper: boolean;
};

/**
 * Como `requireAdmin`, pero devuelve además a qué cliente pertenece.
 *
 * Las rutas que escriben en `campo_*` necesitan saberlo para estampar el
 * `cliente_id` correcto — y para comprobar que ese admin puede tocar ese
 * cliente. Nunca se toma el cliente de lo que manda el navegador.
 */
export async function requireAdminCtx(req: Request): Promise<CtxAdmin | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  const email = data?.user?.email;
  if (error || !email) return null;
  const { data: c } = await supabaseAdmin
    .from("contacts")
    .select("is_admin,cliente_id,es_super")
    .eq("email", email)
    .maybeSingle();
  if (!c?.is_admin) return null;
  return {
    email,
    clienteId: (c.cliente_id as number | null) ?? null,
    esSuper: Boolean(c.es_super),
  };
}

/** Clave temporal legible (sin caracteres ambiguos). */
export function tempPassword(len = 10): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
