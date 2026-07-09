"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Message, Node, nodeName, Status } from "@/lib/types";
import { hhmm } from "@/lib/format";

const SENDER_KEY = "mesh_family_sender";
const MAX_BYTES = 200; // cabe en un paquete mesh (el gateway fragmenta si excede)

function statusLabel(s: Status): string {
  switch (s) {
    case "pending":
      return "⏳ enviando…";
    case "sent":
      return "✓ en la mesh";
    case "delivered":
      return "✓✓ entregado";
    case "failed":
      return "✗ no se pudo enviar";
  }
}

function byteLen(s: string): number {
  return new TextEncoder().encode(s).length;
}

export default function NodeChat({
  params,
}: {
  params: Promise<{ nodeNum: string }>;
}) {
  const { nodeNum: nodeNumStr } = use(params);
  const nodeNum = Number(nodeNumStr);

  const [node, setNode] = useState<Node | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sender, setSender] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Nombre de quien escribe (persistido en el navegador).
  useEffect(() => {
    setSender(localStorage.getItem(SENDER_KEY) ?? "");
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      const [{ data: n }, { data: msgs }] = await Promise.all([
        supabase.from("nodes").select("*").eq("node_num", nodeNum).maybeSingle(),
        supabase
          .from("messages")
          .select("*")
          .eq("node_num", nodeNum)
          .order("created_at", { ascending: true }),
      ]);
      if (!active) return;
      setNode((n as Node) ?? null);
      setMessages((msgs as Message[]) ?? []);
    }
    load();

    const ch = supabase
      .channel(`msgs-${nodeNum}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `node_num=eq.${nodeNum}`,
        },
        (payload) => {
          setMessages((prev) => {
            if (payload.eventType === "INSERT") {
              const m = payload.new as Message;
              if (prev.some((x) => x.id === m.id)) return prev;
              return [...prev, m];
            }
            if (payload.eventType === "UPDATE") {
              const m = payload.new as Message;
              return prev.map((x) => (x.id === m.id ? m : x));
            }
            if (payload.eventType === "DELETE") {
              const old = payload.old as Message;
              return prev.filter((x) => x.id !== old.id);
            }
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [nodeNum]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const body = text.trim();
    const who = sender.trim();
    if (!body || sending) return;
    if (who) localStorage.setItem(SENDER_KEY, who);
    setSending(true);
    const { data, error } = await supabase
      .from("messages")
      .insert({
        node_num: nodeNum,
        direction: "to_field",
        text: body,
        sender_name: who || "Familia",
        status: "pending",
      })
      .select()
      .single();
    setSending(false);
    if (!error && data) {
      setText("");
      setMessages((prev) =>
        prev.some((x) => x.id === (data as Message).id)
          ? prev
          : [...prev, data as Message],
      );
    }
  }

  const bytes = byteLen(text);
  const tooLong = bytes > MAX_BYTES;
  const title = node ? nodeName(node) : `Nodo ${nodeNum}`;

  return (
    <main className="mx-auto flex h-dvh max-w-2xl flex-col bg-slate-100">
      <header className="flex items-center gap-3 bg-blue-700 px-3 py-3 text-white shadow">
        <Link href="/" className="text-xl leading-none" aria-label="Volver">
          ‹
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold leading-tight">
            {title}
          </h1>
          <p className="truncate text-xs text-blue-100">
            {node?.lat != null ? "📍 con ubicación" : "📻 nodo mesh"}
            {node?.battery != null ? ` · 🔋 ${node.battery}%` : ""}
          </p>
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="mt-10 text-center text-sm text-slate-400">
            Aún no hay mensajes. Escribe el primero 👇
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.direction === "to_field";
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-[15px] shadow-sm ${
                    mine
                      ? "rounded-br-sm bg-blue-600 text-white"
                      : "rounded-bl-sm bg-white text-slate-900"
                  }`}
                >
                  {!mine && (
                    <p className="mb-0.5 text-xs font-semibold text-blue-700">
                      {m.sender_name || title}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  <p
                    className={`mt-1 text-right text-[10px] ${
                      mine ? "text-blue-100" : "text-slate-400"
                    }`}
                  >
                    {hhmm(m.created_at)}
                    {mine ? ` · ${statusLabel(m.status)}` : ""}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-200 bg-white p-2">
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="text-xs text-slate-400">Tu nombre:</span>
          <input
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            placeholder="p. ej. Mamá"
            className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm outline-none focus:border-blue-400"
          />
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Escribe un mensaje…"
            className={`max-h-32 flex-1 resize-none rounded-2xl border px-3 py-2 text-[15px] outline-none ${
              tooLong ? "border-red-400 bg-red-50" : "border-slate-200"
            }`}
          />
          <button
            onClick={send}
            disabled={!text.trim() || tooLong || sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white disabled:bg-slate-300"
            aria-label="Enviar"
          >
            {sending ? "…" : "➤"}
          </button>
        </div>
        {bytes > 0 && (
          <p
            className={`px-1 pt-1 text-right text-[11px] ${
              tooLong ? "font-semibold text-red-500" : "text-slate-400"
            }`}
          >
            {bytes}/{MAX_BYTES} bytes
          </p>
        )}
      </div>
    </main>
  );
}
