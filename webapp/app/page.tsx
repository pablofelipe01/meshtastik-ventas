"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Node, nodeName } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import NodesMap from "@/components/NodesMap";

export default function Home() {
  const { contact, signOut } = useAuth();
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
      <header className="app-header flex items-center gap-3 px-4 py-3 text-slate-100">
        <Image
          src="/trama-logo.png"
          alt="Trama"
          width={34}
          height={34}
          className="rounded-lg"
          priority
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold leading-tight">Trama</h1>
          <p className="truncate text-xs text-slate-400">
            {contact ? `Hola, ${contact.name}` : "Cargando…"}
          </p>
        </div>
        {contact?.is_admin && (
          <Link
            href="/admin"
            className="btn-ghost rounded-lg px-3 py-1.5 text-xs"
          >
            Admin
          </Link>
        )}
        <Link
          href="/cuenta"
          className="btn-ghost rounded-lg px-3 py-1.5 text-xs"
          aria-label="Mi cuenta"
        >
          ⚙️
        </Link>
        <button
          onClick={signOut}
          className="btn-ghost rounded-lg px-3 py-1.5 text-xs"
        >
          Salir
        </button>
      </header>

      <div className="h-[38dvh] w-full bg-[#081726]">
        <NodesMap nodes={nodes} />
      </div>

      <section className="flex-1 p-3">
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
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
                  className="card flex items-center gap-3 rounded-xl p-3 transition hover:bg-white/[0.06]"
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full text-lg"
                    style={{ backgroundColor: "#34c1cc22", color: "#34c1cc" }}
                  >
                    {n.lat != null ? "📍" : "📻"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-100">
                      {nodeName(n)}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      Visto {timeAgo(n.last_seen)}
                      {n.battery != null ? ` · 🔋 ${n.battery}%` : ""}
                    </p>
                  </div>
                  <span className="text-slate-500">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
