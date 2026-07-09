"use client";

import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import { useRouter } from "next/navigation";
import { Node, nodeName } from "@/lib/types";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export default function NodesMap({ nodes }: { nodes: Node[] }) {
  const router = useRouter();
  const withPos = nodes.filter((n) => n.lat != null && n.lng != null);

  if (!KEY) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-200 p-4 text-center text-sm text-slate-500">
        Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para mostrar el mapa.
      </div>
    );
  }

  const center = withPos.length
    ? { lat: avg(withPos.map((n) => n.lat!)), lng: avg(withPos.map((n) => n.lng!)) }
    : { lat: 2.5716, lng: -72.6417 }; // San José del Guaviare (aprox)

  return (
    <APIProvider apiKey={KEY}>
      <Map
        defaultCenter={center}
        defaultZoom={withPos.length ? 9 : 6}
        gestureHandling="greedy"
        disableDefaultUI={false}
        clickableIcons={false}
        style={{ width: "100%", height: "100%" }}
      >
        {withPos.map((n) => (
          <Marker
            key={n.node_num}
            position={{ lat: n.lat!, lng: n.lng! }}
            title={nodeName(n)}
            onClick={() => router.push(`/node/${n.node_num}`)}
          />
        ))}
      </Map>
    </APIProvider>
  );
}
