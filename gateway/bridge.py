"""
bridge.py — Puente mesh ↔ internet (familia) vía Supabase.

Tres funciones sobre la base de datos Supabase (tablas `nodes` y `messages`):

  1. Campo → familia: cuando un nodo manda un DM al gateway que NO es "@claude",
     se guarda como mensaje `from_field` (la PWA lo muestra en tiempo real).
  2. Sincronización de nodos: cada N segundos vuelca el catálogo de nodos del
     radio (nombre, batería, GPS) a la tabla `nodes` → alimenta el mapa.
  3. Familia → campo: un hilo sondea los mensajes `to_field` pendientes y los
     envía por la mesh como DM al nodo (fragmentando), marcándolos `sent`.

El gateway se conecta SALIENTE a Supabase (la Pi nunca se expone). Si un mensaje
llega mientras la Pi está caída, queda `pending` en Supabase y se entrega cuando
el gateway vuelve.

Config por .env:
  SUPABASE_URL, SUPABASE_SERVICE_KEY   (requeridas para activar el puente)
  BRIDGE_POLL_SECONDS (def 4)          intervalo del sondeo de salientes
  BRIDGE_NODE_SYNC_SECONDS (def 45)    intervalo de sincronización de nodos
"""
import logging
import os
import threading
import time
from datetime import datetime, timezone

import requests

from claude_mesh import _chunk_for_mesh, send_text

log = logging.getLogger("bridge")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
BRIDGE_POLL_SECONDS = float(os.getenv("BRIDGE_POLL_SECONDS", "4"))
BRIDGE_NODE_SYNC_SECONDS = float(os.getenv("BRIDGE_NODE_SYNC_SECONDS", "45"))
_HTTP_TIMEOUT = 15

# El puente se activa solo si hay URL + service key.
ENABLED = bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)


def _headers(extra=None):
    h = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _node_hex(node_num) -> str:
    try:
        return f"!{int(node_num) & 0xFFFFFFFF:08x}"
    except (TypeError, ValueError):
        return str(node_num)


# ---------- Escrituras REST (PostgREST) ----------
def _rest(method, path, **kw):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    return requests.request(method, url, timeout=_HTTP_TIMEOUT, **kw)


def _upsert_nodes(rows: list) -> None:
    """Upsert por clave primaria (node_num)."""
    if not rows:
        return
    # PostgREST rechaza dos filas con la misma PK en un mismo upsert; deduplica
    # por node_num quedándose con la última (más reciente).
    dedup = {}
    for row in rows:
        dedup[row["node_num"]] = row
    # PostgREST también exige que todas las filas de un batch tengan las MISMAS
    # claves (PGRST102). Como unos nodos traen GPS y otros no, agrupamos por
    # conjunto de claves y enviamos cada grupo por separado (nunca null a la
    # posición, para no borrar una posición conocida).
    groups = {}
    for row in dedup.values():
        groups.setdefault(tuple(sorted(row.keys())), []).append(row)
    for payload in groups.values():
        r = _rest("POST", "nodes", json=payload,
                  headers=_headers({"Prefer": "resolution=merge-duplicates"}))
        if r.status_code >= 400:
            log.error("nodes upsert %s: %s", r.status_code, r.text[:400])
        r.raise_for_status()


def _ensure_node(node_num: int, node_id: str, name: str) -> None:
    """Garantiza que exista la fila del nodo (para la FK de messages)."""
    _upsert_nodes([{
        "node_num": node_num,
        "node_id": node_id,
        "long_name": name,
        "last_seen": _now_iso(),
    }])


# ---------- 1. Campo → familia ----------
def handle_field_message(from_num: int, text: str, node_name: str) -> None:
    """Guarda un DM de un nodo (que no es @claude) como mensaje from_field."""
    if not ENABLED:
        return
    try:
        _ensure_node(from_num, _node_hex(from_num), node_name)
        r = _rest("POST", "messages", json={
            "node_num": from_num,
            "direction": "from_field",
            "text": text,
            "sender_name": node_name,
            "status": "delivered",
            "delivered_at": _now_iso(),
        }, headers=_headers())
        r.raise_for_status()
        log.info("📥 campo→familia de %s: %s", _node_hex(from_num), text)
    except Exception as e:
        log.error("✗ bridge from_field: %s", e)


# ---------- 2. Sincronización de nodos (mapa) ----------
def _sync_nodes_once(interface, my_num) -> None:
    nodes = getattr(interface, "nodes", None) or {}
    rows = []
    for node_id, n in nodes.items():
        num = n.get("num")
        if num is None:
            continue
        user = n.get("user") or {}
        pos = n.get("position") or {}
        dm = n.get("deviceMetrics") or {}
        last_heard = n.get("lastHeard")
        row = {
            "node_num": num,
            "node_id": user.get("id") or node_id,
            "long_name": user.get("longName"),
            "short_name": user.get("shortName"),
            "battery": dm.get("batteryLevel"),
            "is_gateway": (my_num is not None and num == my_num),
            "last_seen": (
                datetime.fromtimestamp(last_heard, timezone.utc).isoformat()
                if last_heard else _now_iso()
            ),
        }
        lat, lng = pos.get("latitude"), pos.get("longitude")
        if lat is not None and lng is not None:
            row["lat"] = lat
            row["lng"] = lng
            row["altitude"] = pos.get("altitude")
            row["last_position_at"] = _now_iso()
        rows.append(row)
    if rows:
        _upsert_nodes(rows)
        log.debug("🗺️  sincronizados %d nodos", len(rows))


def node_sync_loop(conn_holder, my_num_getter, stop_event) -> None:
    if not ENABLED:
        return
    while not stop_event.is_set():
        try:
            iface = conn_holder.get()
            if iface is not None:
                _sync_nodes_once(iface, my_num_getter())
        except Exception as e:
            log.error("✗ bridge node_sync: %s", e)
        stop_event.wait(BRIDGE_NODE_SYNC_SECONDS)


# ---------- 3. Familia → campo (poller de salientes) ----------
def _fetch_pending() -> list:
    r = _rest(
        "GET",
        "messages?direction=eq.to_field&status=eq.pending&order=created_at.asc",
        headers=_headers(),
    )
    r.raise_for_status()
    return r.json()


def _mark(msg_id: str, status: str) -> None:
    body = {"status": status}
    if status == "sent":
        body["delivered_at"] = _now_iso()
    r = _rest("PATCH", f"messages?id=eq.{msg_id}", json=body, headers=_headers())
    r.raise_for_status()


def _deliver_to_field(interface, msg) -> None:
    node_num = msg["node_num"]
    sender = (msg.get("sender_name") or "Familia").strip()
    # Prefijo para que el trabajador sepa quién le escribe.
    body = f"{sender}: {msg['text']}"
    chunks = _chunk_for_mesh(body)
    total = len(chunks)
    for i, chunk in enumerate(chunks, 1):
        out = chunk if total == 1 else f"[{i}/{total}] {chunk}"
        send_text(interface, node_num, out)
    _mark(msg["id"], "sent")
    log.info("📤 familia→campo a %s: %s", _node_hex(node_num), msg["text"])


def outbound_loop(conn_holder, stop_event) -> None:
    if not ENABLED:
        return
    while not stop_event.is_set():
        try:
            iface = conn_holder.get()
            if iface is not None:
                for msg in _fetch_pending():
                    try:
                        _deliver_to_field(iface, msg)
                    except Exception as e:
                        log.error("✗ bridge entrega %s: %s", msg.get("id"), e)
                        try:
                            _mark(msg["id"], "failed")
                        except Exception:
                            pass
        except Exception as e:
            log.error("✗ bridge outbound: %s", e)
        stop_event.wait(BRIDGE_POLL_SECONDS)


def start(conn_holder, my_num_getter, stop_event) -> None:
    """Arranca los hilos del puente (si está configurado)."""
    if not ENABLED:
        log.info("🌉 Puente Supabase desactivado (falta SUPABASE_URL/SERVICE_KEY).")
        return
    log.info("🌉 Puente Supabase activo → %s", SUPABASE_URL)
    threading.Thread(
        target=node_sync_loop, args=(conn_holder, my_num_getter, stop_event),
        daemon=True,
    ).start()
    threading.Thread(
        target=outbound_loop, args=(conn_holder, stop_event),
        daemon=True,
    ).start()
