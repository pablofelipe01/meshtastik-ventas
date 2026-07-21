"use client";

import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import { Captura, Lote, Finca, TIPO } from "@/lib/campoTypes";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

/**
 * Icono SVG en data-URI. Se usa un objeto plano `{url}` a propósito: cualquier
 * otra forma (SymbolPath, Size, Point) necesita el global `google`, que no
 * existe todavía cuando este componente se renderiza por primera vez.
 */
function icono(color: string, r: number): { url: string } {
  const d = (r + 2) * 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}">` +
    `<circle cx="${d / 2}" cy="${d / 2}" r="${r}" fill="${color}" ` +
    `stroke="#0b1f33" stroke-width="2"/></svg>`;
  return { url: `data:image/svg+xml;utf-8,${encodeURIComponent(svg)}` };
}

export default function CampoMap({
  lotes,
  capturas,
  finca,
}: {
  lotes: Lote[];
  capturas: Captura[];
  finca: Finca | null;
}) {
  if (!KEY) {
    return (
      <div className="flex h-full items-center justify-center bg-[#081726] p-4 text-center text-sm text-slate-400">
        Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para mostrar el mapa.
      </div>
    );
  }

  // Centrado en la finca elegida; sin filtro, una vista amplia de Colombia.
  const center = finca
    ? { lat: finca.lat, lng: finca.lng }
    : { lat: 4.55, lng: -74.3 };
  const zoom = finca ? 14 : 6;

  // Solo las capturas recientes con posición, para no saturar el mapa.
  const conPos = capturas.filter((c) => c.lat != null && c.lng != null).slice(0, 40);

  return (
    <APIProvider apiKey={KEY}>
      <Map
        // Remontar al cambiar de finca es más simple y robusto que controlar
        // la cámara: evita pelear con el gesto del usuario.
        key={finca?.codigo ?? "todas"}
        defaultCenter={center}
        defaultZoom={zoom}
        gestureHandling="greedy"
        disableDefaultUI={false}
        clickableIcons={false}
        mapTypeId="hybrid"
        style={{ width: "100%", height: "100%" }}
      >
        {lotes.map((l) => (
          <Marker
            key={`lote-${l.id}`}
            position={{ lat: l.lat, lng: l.lng }}
            title={`${l.codigo} · ${l.nombre}${l.hectareas ? ` · ${l.hectareas} ha` : ""}`}
            icon={icono("#94a3b8", 4)}
            zIndex={1}
          />
        ))}
        {conPos.map((c) => (
          <Marker
            key={`cap-${c.id}`}
            position={{ lat: c.lat!, lng: c.lng! }}
            title={`${TIPO[c.tipo]?.label ?? c.tipo} · ${c.lote_codigo}${c.parcela_codigo} · ${c.valor ?? ""} ${c.unidad ?? ""}`}
            icon={icono(TIPO[c.tipo]?.color ?? "#94a3b8", 7)}
            zIndex={10}
          />
        ))}
      </Map>
    </APIProvider>
  );
}
