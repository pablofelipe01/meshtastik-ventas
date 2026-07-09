"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

type AdminContact = {
  id: number;
  name: string;
  email: string;
  is_admin: boolean;
};
type AdminNode = { node_num: number; long_name: string | null; short_name: string | null };
type Assign = { node_num: number; contact_id: number };

async function authedFetch(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? "";
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
}

export default function AdminPage() {
  const { contact } = useAuth();
  const [contacts, setContacts] = useState<AdminContact[]>([]);
  const [nodes, setNodes] = useState<AdminNode[]>([]);
  const [assigns, setAssigns] = useState<Assign[]>([]);
  const [loading, setLoading] = useState(true);

  // Formulario
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selNodes, setSelNodes] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ msg: string; pw?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await authedFetch("/api/admin/data");
    if (r.ok) {
      const d = await r.json();
      setContacts(d.contacts);
      setNodes(d.nodes);
      setAssigns(d.assigns);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (contact?.is_admin) load();
    else setLoading(false);
  }, [contact, load]);

  if (!contact) return null;
  if (!contact.is_admin) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-slate-700">No tienes permisos de administrador.</p>
        <Link href="/" className="text-blue-600 underline">
          Volver
        </Link>
      </main>
    );
  }

  async function addFamily(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setResult(null);
    const r = await authedFetch("/api/admin/family", {
      method: "POST",
      body: JSON.stringify({ name, email, node_nums: selNodes }),
    });
    setSaving(false);
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Error al crear.");
      return;
    }
    setResult({
      msg: d.note ?? `Familiar "${d.contact.name}" creado.`,
      pw: d.tempPassword ?? undefined,
    });
    setName("");
    setEmail("");
    setSelNodes([]);
    load();
  }

  function toggleNode(n: number) {
    setSelNodes((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n],
    );
  }

  function nodesOf(contactId: number): string {
    const nums = assigns
      .filter((a) => a.contact_id === contactId)
      .map((a) => a.node_num);
    const names = nums.map(
      (num) =>
        nodes.find((n) => n.node_num === num)?.long_name ??
        `!${(num >>> 0).toString(16)}`,
    );
    return names.join(", ") || "—";
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="flex items-center gap-3 bg-slate-800 px-4 py-3 text-white shadow">
        <Link href="/" className="text-xl leading-none" aria-label="Volver">
          ‹
        </Link>
        <h1 className="flex-1 text-base font-semibold">Administración</h1>
      </header>

      <section className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-600">
          Agregar familiar
        </h2>
        <form
          onSubmit={addFamily}
          className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm"
        >
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre (p. ej. Mamá)"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500"
          />
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (será su usuario)"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500"
          />
          <div>
            <p className="mb-1 text-xs text-slate-500">Nodos que puede contactar:</p>
            <div className="flex flex-wrap gap-2">
              {nodes.length === 0 && (
                <span className="text-xs text-slate-400">
                  No hay nodos todavía.
                </span>
              )}
              {nodes.map((n) => (
                <label
                  key={n.node_num}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
                    selNodes.includes(n.node_num)
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-300 text-slate-600"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={selNodes.includes(n.node_num)}
                    onChange={() => toggleNode(n.node_num)}
                  />
                  {n.long_name ?? `!${(n.node_num >>> 0).toString(16)}`}
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:bg-slate-300"
          >
            {saving ? "Guardando…" : "Crear familiar"}
          </button>
        </form>

        {result && (
          <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm">
            <p className="text-green-800">{result.msg}</p>
            {result.pw && (
              <p className="mt-1 text-green-900">
                Clave temporal (dásela y que la cambie al entrar):{" "}
                <b className="font-mono">{result.pw}</b>
              </p>
            )}
          </div>
        )}
      </section>

      <section className="flex-1 px-4 pb-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-600">
          Familiares ({contacts.length})
        </h2>
        {loading ? (
          <p className="text-sm text-slate-400">Cargando…</p>
        ) : (
          <ul className="space-y-2">
            {contacts.map((c) => (
              <li key={c.id} className="rounded-xl bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  {c.is_admin && (
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                      admin
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">{c.email}</p>
                <p className="text-xs text-slate-500">Nodos: {nodesOf(c.id)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
