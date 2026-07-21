"use client";

import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export type PuntoRef = {
  clave: string;
  lat: number;
  lng: number;
  titulo: string;
};

function icono(color: string, r: number): { url: string } {
  const d = (r + 2) * 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}">` +
    `<circle cx="${d / 2}" cy="${d / 2}" r="${r}" fill="${color}" ` +
    `stroke="#0b1f33" stroke-width="2"/></svg>`;
  return { url: `data:image/svg+xml;utf-8,${encodeURIComponent(svg)}` };
}

/**
 * Mapa satelital para marcar dónde está un lote o una parcela.
 *
 * Teclear latitud y longitud a mano es donde más errores se cometen; aquí se
 * marca viendo el terreno real. Los puntos de referencia (los otros lotes de la
 * finca) se dibujan en gris para no perder el contexto.
 */
export default function SelectorMapa({
  lat,
  lng,
  centro,
  referencias = [],
  onElegir,
  altura = "260px",
}: {
  lat: number | null;
  lng: number | null;
  centro: { lat: number; lng: number };
  referencias?: PuntoRef[];
  onElegir: (lat: number, lng: number) => void;
  altura?: string;
}) {
  if (!KEY) {
    return (
      <div className="flex items-center justify-center rounded-xl bg-[#081726] p-4 text-center text-xs text-slate-400"
           style={{ height: altura }}>
        Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para mostrar el mapa.
      </div>
    );
  }

  const hayPunto = lat != null && lng != null;
  const centrado = hayPunto ? { lat: lat!, lng: lng! } : centro;

  return (
    <div className="overflow-hidden rounded-xl" style={{ height: altura }}>
      <APIProvider apiKey={KEY}>
        <Map
          defaultCenter={centrado}
          defaultZoom={hayPunto ? 17 : 15}
          gestureHandling="greedy"
          disableDefaultUI={false}
          clickableIcons={false}
          mapTypeId="hybrid"
          style={{ width: "100%", height: "100%" }}
          onClick={(e) => {
            const ll = e.detail.latLng;
            if (ll) onElegir(ll.lat, ll.lng);
          }}
        >
          {referencias.map((r) => (
            <Marker
              key={r.clave}
              position={{ lat: r.lat, lng: r.lng }}
              title={r.titulo}
              icon={icono("#94a3b8", 4)}
              clickable={false}
              zIndex={1}
            />
          ))}
          {hayPunto && (
            <Marker
              position={{ lat: lat!, lng: lng! }}
              icon={icono("#93d02c", 8)}
              zIndex={10}
            />
          )}
        </Map>
      </APIProvider>
    </div>
  );
}
