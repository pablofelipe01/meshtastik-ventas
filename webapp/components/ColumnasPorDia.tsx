"use client";

import { useState } from "react";
import { CampoTipo, TIPO, TIPOS } from "@/lib/campoTypes";

export type DiaBarra = {
  dia: string; // YYYY-MM-DD
  etiqueta: string; // "lun 21"
  porTipo: Record<CampoTipo, number>;
  total: number;
};

/**
 * Actividad por día, apilada por tipo de captura.
 *
 * Los colores son la paleta categórica validada (ver lib/campoTypes.ts). Entre
 * segmentos va una separación de 2 px del color de la superficie, para que dos
 * bloques contiguos no se lean como uno solo.
 */
export default function ColumnasPorDia({ dias }: { dias: DiaBarra[] }) {
  const [activo, setActivo] = useState<string | null>(null);
  const max = Math.max(...dias.map((d) => d.total), 1);
  const sel = dias.find((d) => d.dia === activo);

  return (
    <div>
      <div className="flex h-40 items-end gap-1.5">
        {dias.map((d) => {
          const on = activo === d.dia;
          return (
            <div
              key={d.dia}
              className="flex h-full flex-1 flex-col justify-end"
              onMouseEnter={() => setActivo(d.dia)}
              onMouseLeave={() => setActivo(null)}
            >
              <div
                className="flex w-full flex-col-reverse justify-start overflow-hidden rounded-md transition-opacity"
                style={{
                  height: `${Math.max((d.total / max) * 100, d.total ? 3 : 0)}%`,
                  opacity: activo && !on ? 0.5 : 1,
                }}
              >
                {TIPOS.map((t) => {
                  const v = d.porTipo[t] ?? 0;
                  if (!v) return null;
                  return (
                    <div
                      key={t}
                      style={{
                        height: `${(v / d.total) * 100}%`,
                        backgroundColor: TIPO[t].color,
                        // separación del color de la superficie entre segmentos
                        borderBottom: "2px solid #0b1f33",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex gap-1.5">
        {dias.map((d) => (
          <span
            key={d.dia}
            className="flex-1 truncate text-center text-[10px] text-slate-500"
          >
            {d.etiqueta}
          </span>
        ))}
      </div>

      <div className="mt-2 min-h-[18px] text-center text-xs text-slate-400">
        {sel ? (
          <span>
            <b className="text-slate-200">{sel.total}</b> capturas ·{" "}
            {TIPOS.filter((t) => sel.porTipo[t])
              .map((t) => `${TIPO[t].label} ${sel.porTipo[t]}`)
              .join(" · ")}
          </span>
        ) : (
          <span className="text-slate-600">Pasa el cursor por un día</span>
        )}
      </div>
    </div>
  );
}
