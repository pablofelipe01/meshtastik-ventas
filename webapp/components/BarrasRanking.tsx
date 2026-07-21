"use client";

import { useState } from "react";

export type ItemBarra = {
  clave: string;
  etiqueta: string;
  valor: number;
  detalle?: string;
};

/**
 * Comparación de magnitud (quién más, quién menos).
 *
 * Un solo color a propósito: la longitud ya codifica la magnitud, así que
 * pintar cada barra de un color distinto no añadiría información y sí
 * sugeriría categorías que no existen.
 */
export default function BarrasRanking({
  items,
  unidad,
  color = "#159fb0",
  formato,
}: {
  items: ItemBarra[];
  unidad?: string;
  color?: string;
  formato?: (n: number) => string;
}) {
  const [activo, setActivo] = useState<string | null>(null);
  const fmt = formato ?? ((n: number) => n.toLocaleString("es-CO"));
  const max = Math.max(...items.map((i) => i.valor), 1);

  if (!items.length) {
    return (
      <p className="p-4 text-center text-sm text-slate-500">
        Todavía no hay datos suficientes.
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {items.map((i) => {
        const pct = Math.max((i.valor / max) * 100, 1.5);
        const on = activo === i.clave;
        return (
          <li
            key={i.clave}
            onMouseEnter={() => setActivo(i.clave)}
            onMouseLeave={() => setActivo(null)}
            className="cursor-default"
          >
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-xs text-slate-300">{i.etiqueta}</span>
              <span className="shrink-0 text-xs tabular-nums text-slate-400">
                {fmt(i.valor)}
                {unidad ? ` ${unidad}` : ""}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full transition-[width,opacity] duration-300"
                style={{
                  width: `${pct}%`,
                  backgroundColor: color,
                  opacity: activo && !on ? 0.45 : 1,
                }}
              />
            </div>
            {i.detalle && on && (
              <p className="mt-1 text-[11px] text-slate-500">{i.detalle}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
