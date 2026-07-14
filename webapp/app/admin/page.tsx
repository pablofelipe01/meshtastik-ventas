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
type EmailContact = { id: number; alias: string; email: string; name: string | null };
type Lead = {
  id: number;
  created_at: string;
  name: string;
  company: string | null;
  email: string | null;
  message: string;
  source: string | null;
  handled: boolean;
};

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
  const [emailContacts, setEmailContacts] = useState<EmailContact[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // Formulario libreta de correos
  const [eAlias, setEAlias] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [eName, setEName] = useState("");
  const [eError, setEError] = useState<string | null>(null);

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
      setEmailContacts(d.emailContacts ?? []);
      setLeads(d.leads ?? []);
    }
    setLoading(false);
  }, []);

  async function toggleLeadHandled(id: number, handled: boolean) {
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, handled } : l)),
    );
    await authedFetch(`/api/admin/leads?id=${id}`, {
      method: "PATCH",
      body: JSON.stringify({ handled }),
    });
  }

  async function deleteLead(id: number) {
    if (!confirm("¿Eliminar esta solicitud de contacto?")) return;
    await authedFetch(`/api/admin/leads?id=${id}`, { method: "DELETE" });
    setLeads((prev) => prev.filter((l) => l.id !== id));
  }

  async function addEmailContact(e: React.FormEvent) {
    e.preventDefault();
    setEError(null);
    const r = await authedFetch("/api/admin/email-contacts", {
      method: "POST",
      body: JSON.stringify({ alias: eAlias, email: eEmail, name: eName }),
    });
    const d = await r.json();
    if (!r.ok) {
      setEError(d.error ?? "Error al guardar.");
      return;
    }
    setEAlias("");
    setEEmail("");
    setEName("");
    load();
  }

  async function deleteEmailContact(id: number) {
    await authedFetch(`/api/admin/email-contacts?id=${id}`, { method: "DELETE" });
    load();
  }

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
        <h2 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-600">
          Solicitudes de contacto ({leads.length})
          {leads.some((l) => !l.handled) && (
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
              {leads.filter((l) => !l.handled).length} sin atender
            </span>
          )}
        </h2>
        {loading ? (
          <p className="text-sm text-slate-400">Cargando…</p>
        ) : leads.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no hay solicitudes.</p>
        ) : (
          <ul className="space-y-2">
            {leads.map((l) => (
              <li
                key={l.id}
                className={`rounded-xl border p-3 shadow-sm ${
                  l.handled
                    ? "border-slate-200 bg-white"
                    : "border-orange-200 bg-orange-50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {l.name}
                      {l.company && (
                        <span className="text-slate-500"> · {l.company}</span>
                      )}
                    </p>
                    {l.email && (
                      <a
                        href={`mailto:${l.email}`}
                        className="text-xs text-blue-600 underline"
                      >
                        {l.email}
                      </a>
                    )}
                  </div>
                  <span className="whitespace-nowrap text-xs text-slate-400">
                    {new Date(l.created_at).toLocaleString("es", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {l.message}
                </p>
                <div className="mt-3 flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5 text-slate-600">
                    <input
                      type="checkbox"
                      checked={l.handled}
                      onChange={(e) =>
                        toggleLeadHandled(l.id, e.target.checked)
                      }
                    />
                    Atendido
                  </label>
                  <button
                    onClick={() => deleteLead(l.id)}
                    className="text-red-600"
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

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

      <section className="px-4 pb-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-600">
          Libreta de correos (para enviar por @claude desde la mesh)
        </h2>
        <form
          onSubmit={addEmailContact}
          className="mb-3 flex flex-col gap-2 rounded-xl bg-white p-4 shadow-sm sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <label className="text-xs text-slate-500">Alias (una palabra)</label>
            <input
              required
              value={eAlias}
              onChange={(e) => setEAlias(e.target.value)}
              placeholder="juan"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex-[2]">
            <label className="text-xs text-slate-500">Email</label>
            <input
              required
              type="email"
              value={eEmail}
              onChange={(e) => setEEmail(e.target.value)}
              placeholder="juan@ejemplo.com"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-500">Nombre (opcional)</label>
            <input
              value={eName}
              onChange={(e) => setEName(e.target.value)}
              placeholder="Juan Pérez"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white"
          >
            Agregar
          </button>
        </form>
        {eError && <p className="mb-2 text-sm text-red-600">{eError}</p>}
        {emailContacts.length > 0 && (
          <ul className="space-y-2">
            {emailContacts.map((ec) => (
              <li
                key={ec.id}
                className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    <span className="font-mono text-blue-700">{ec.alias}</span>
                    {ec.name ? ` · ${ec.name}` : ""}
                  </p>
                  <p className="truncate text-xs text-slate-500">{ec.email}</p>
                </div>
                <button
                  onClick={() => deleteEmailContact(ec.id)}
                  className="text-xs text-red-600"
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
