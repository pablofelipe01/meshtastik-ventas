import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Cliente Supabase para el navegador (clave publishable / anon). */
export const supabase = createClient(url, key, {
  realtime: { params: { eventsPerSecond: 5 } },
});
