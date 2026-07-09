"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Node, nodeName } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import NodesMap from "@/components/NodesMap";

export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase
      .from("nodes")
      .select("*")
      .eq("is_gateway", false)
      .order("last_seen", { ascending: false, nullsFirst: false });
    setNodes((data as Node[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("nodes-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nodes" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="flex items-center gap-2 bg-blue-700 px-4 py-3 text-white shadow">
        <span className="text-lg">📡</span>
        <div>
          <h1 className="text-base font-semibold leading-tight">Mesh Familia</h1>
          <p className="text-xs text-blue-100">
            Escribe a los nodos en campo · sin internet allá
          </p>
        </div>
      </header>

      <div className="h-[38dvh] w-full bg-slate-200">
        <NodesMap nodes={nodes} />
      </div>

      <section className="flex-1 p-3">
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Nodos ({nodes.length})
        </h2>

        {loading ? (
          <p className="p-4 text-center text-sm text-slate-400">Cargando…</p>
        ) : nodes.length === 0 ? (
          <p className="p-4 text-center text-sm text-slate-400">
            No hay nodos todavía. Aparecerán cuando el gateway los vea en la mesh.
          </p>
        ) : (
          <ul className="space-y-2">
            {nodes.map((n) => (
              <li key={n.node_num}>
                <Link
                  href={`/node/${n.node_num}`}
                  className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm active:bg-slate-50"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                    {n.lat != null ? "📍" : "📻"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{nodeName(n)}</p>
                    <p className="truncate text-xs text-slate-500">
                      Visto {timeAgo(n.last_seen)}
                      {n.battery != null ? ` · 🔋 ${n.battery}%` : ""}
                    </p>
                  </div>
                  <span className="text-slate-300">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
