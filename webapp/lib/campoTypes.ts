/** Tipos y catálogo visual del módulo Campo (captura agroindustrial). */

export type CampoTipo = "FRJ" | "JOR" | "CEN" | "PLG" | "GAN";

export type Captura = {
  id: number;
  tipo: CampoTipo;
  finca_codigo: string | null;
  lote_codigo: string | null;
  parcela_codigo: string | null;
  cultivo: string | null;
  node_num: number | null;
  operario_nombre: string | null;
  valor: number | null;
  unidad: string | null;
  datos: Record<string, unknown> | null;
  lat: number | null;
  lng: number | null;
  raw: string | null;
  capturado_at: string | null;
  recibido_at: string;
};

export type Lote = {
  id: number;
  finca_codigo: string;
  codigo: string;
  nombre: string;
  cultivo: string | null;
  hectareas: number | null;
  lat: number;
  lng: number;
};

export type Finca = {
  codigo: string;
  nombre: string;
  municipio: string;
  departamento: string;
  lat: number;
  lng: number;
  altitud_msnm: number | null;
  cliente_id: number;
};

export type Cliente = {
  id: number;
  nombre: string;
  slug: string;
  activo: boolean;
};

/**
 * Paleta categórica de los tipos de captura.
 *
 * El ORDEN importa: se validó con el verificador de paletas para modo oscuro
 * sobre la superficie #0b1f33 y pasa las cinco comprobaciones (banda de
 * luminosidad, croma, separación bajo daltonismo, visión normal y contraste).
 * Lima y naranja NO pueden quedar adyacentes: bajo deuteranopía se confunden.
 * Si cambias un color, vuelve a validar — no lo estimes a ojo.
 */
export const TIPO: Record<
  CampoTipo,
  { label: string; icon: string; color: string }
> = {
  FRJ: { label: "Frutos rojos", icon: "🍒", color: "#de4f74" },
  JOR: { label: "Jornal", icon: "⚖️", color: "#68a91e" },
  CEN: { label: "Censo", icon: "📦", color: "#159fb0" },
  PLG: { label: "Plaga", icon: "🐛", color: "#c96d24" },
  GAN: { label: "Ganado", icon: "🐄", color: "#8b7bec" },
};

/** Orden de leyenda = orden validado de la paleta. */
export const TIPOS: CampoTipo[] = ["FRJ", "JOR", "CEN", "PLG", "GAN"];

const TZ = "America/Bogota";

/** Fecha "YYYY-MM-DD" en hora de Colombia. */
export function diaCO(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function esHoy(iso: string | null): boolean {
  return !!iso && diaCO(iso) === diaCO(new Date());
}

/** Número compacto: 1.284 · 12,9 K · 1,2 M */
export function compacto(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} K`;
  return n.toLocaleString("es-CO", { maximumFractionDigits: 2 });
}

export function pesos(n: number): string {
  return `$${compacto(Math.round(n))}`;
}

/**
 * Demora entre que el operario capturó el dato y que llegó al gateway.
 * Es la métrica que vende el producto: hoy el cliente la sufre en horas.
 */
export function demora(c: Captura): string | null {
  if (!c.capturado_at) return null;
  const s = Math.round(
    (new Date(c.recibido_at).getTime() - new Date(c.capturado_at).getTime()) / 1000,
  );
  if (s < 0) return null;
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

/** Texto del valor de una captura, según su tipo. */
export function valorTexto(c: Captura): string {
  const v = c.valor ?? 0;
  if (c.tipo === "PLG") {
    const nombre = (c.datos?.plaga_nombre as string) ?? "Plaga";
    return `${nombre} · severidad ${v}/5`;
  }
  return `${compacto(v)} ${c.unidad ?? ""}`.trim();
}

/**
 * Reses que faltan respecto al hato esperado del lote.
 *
 * Es lo que convierte un conteo en una respuesta: no «hay 117 cabezas», sino
 * «faltan 3». Hoy el ganadero se entera de eso días después.
 */
export function resesFaltantes(c: Captura): number {
  if (c.tipo !== "GAN") return 0;
  const n = Number(c.datos?.faltan ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
