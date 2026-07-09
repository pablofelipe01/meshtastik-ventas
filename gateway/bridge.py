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
import json
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


# ---------- 1. Campo → familia (con cola local persistente) ----------
# Los mensajes del campo se ESCRIBEN en Supabase con reintentos. Si el internet
# del gateway está caído, quedan en una cola local (archivo JSON) y se reenvían
# cuando vuelve la conexión — así ningún mensaje se pierde (sobrevive reinicios).
_OUTBOX_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "outbox.json")
_outbox = []               # [{id, node_num, contact_id, text, sender_name, ts}]
_outbox_seq = 0
_outbox_lock = threading.Lock()


def _load_outbox() -> None:
    global _outbox, _outbox_seq
    try:
        with open(_OUTBOX_PATH) as f:
            _outbox = json.load(f)
        _outbox_seq = max((it.get("id", 0) for it in _outbox), default=0)
        if _outbox:
            log.info("📤 outbox: %d mensajes pendientes de sesiones previas",
                     len(_outbox))
    except FileNotFoundError:
        _outbox = []
    except Exception as e:
        log.error("✗ outbox load: %s", e)
        _outbox = []


def _save_outbox() -> None:
    try:
        tmp = _OUTBOX_PATH + ".tmp"
        with open(tmp, "w") as f:
            json.dump(_outbox, f)
        os.replace(tmp, _OUTBOX_PATH)
    except Exception as e:
        log.error("✗ outbox save: %s", e)


def _enqueue_from_field(node_num: int, contact_id, text: str,
                        node_name: str) -> None:
    global _outbox_seq
    with _outbox_lock:
        _outbox_seq += 1
        _outbox.append({
            "id": _outbox_seq,
            "node_num": node_num,
            "contact_id": contact_id,
            "text": text,
            "sender_name": node_name,
            "ts": _now_iso(),
        })
        _save_outbox()


def _flush_outbox_once() -> None:
    """Intenta escribir en Supabase los mensajes de campo pendientes. Se detiene
    al primer fallo (probablemente sin internet) y reintenta el resto luego."""
    with _outbox_lock:
        items = list(_outbox)
    if not items:
        return
    sent = set()
    for it in items:
        try:
            _ensure_node(it["node_num"], _node_hex(it["node_num"]),
                         it["sender_name"])
            payload = {
                "node_num": it["node_num"],
                "direction": "from_field",
                "text": it["text"],
                "sender_name": it["sender_name"],
                "status": "delivered",
                "delivered_at": _now_iso(),
            }
            if it.get("contact_id") is not None:
                payload["contact_id"] = it["contact_id"]
            r = _rest("POST", "messages", json=payload, headers=_headers())
            r.raise_for_status()
            sent.add(it["id"])
            log.info("📥 campo→familia → Supabase (contacto %s): %s",
                     it.get("contact_id"), it["text"])
        except Exception:
            break  # sin internet: conserva TODO y reintenta el próximo ciclo
    if sent:
        with _outbox_lock:
            _outbox[:] = [x for x in _outbox if x["id"] not in sent]
            _save_outbox()


def handle_field_message(from_num: int, text: str, node_name: str) -> None:
    """Encola un DM de un nodo (que no es @claude) como mensaje from_field."""
    if not ENABLED:
        return
    _enqueue_from_field(from_num, None, text, node_name)
    log.info("📥 (encolado) campo→familia de %s: %s", _node_hex(from_num), text)


def _sanitize_token(s: str) -> str:
    """Quita separadores del protocolo (| y :) de nombres para la mesh."""
    return (s or "").replace("|", " ").replace(":", " ").strip()


def _send_fragmented(interface, node_num: int, body: str) -> None:
    """Envía un texto por la mesh, fragmentando con [i/n] si no cabe."""
    chunks = _chunk_for_mesh(body)
    total = len(chunks)
    for i, chunk in enumerate(chunks, 1):
        out = chunk if total == 1 else f"[{i}/{total}] {chunk}"
        send_text(interface, node_num, out)


# ---------- Mensajería dirigida: contactos ----------
def get_node_contacts(node_num: int) -> list:
    """Contactos (familiares) asignados a un nodo: [{id, name}]."""
    r = _rest(
        "GET",
        f"node_contacts?node_num=eq.{node_num}&select=contacts(id,name)",
        headers=_headers(),
    )
    r.raise_for_status()
    out = []
    for row in r.json():
        c = row.get("contacts") or {}
        if c.get("id") is not None:
            out.append({"id": c["id"], "name": c.get("name") or ""})
    return out


def send_contacts(interface, node_num: int) -> None:
    """Responde por la mesh la lista de contactos del nodo:
    CONTACTOS|<id>:<nombre>|<id>:<nombre>|..."""
    if not ENABLED:
        return
    try:
        contacts = get_node_contacts(node_num)
        if not contacts:
            send_text(interface, node_num, "CONTACTOS|")
            log.info("📇 contactos → %s: (ninguno)", _node_hex(node_num))
            return
        body = "CONTACTOS|" + "|".join(
            f"{c['id']}:{_sanitize_token(c['name'])}" for c in contacts
        )
        _send_fragmented(interface, node_num, body)
        log.info("📇 contactos → %s: %d", _node_hex(node_num), len(contacts))
    except Exception as e:
        log.error("✗ bridge contactos: %s", e)


def handle_field_directed(from_num: int, contact_id: int, text: str,
                          node_name: str) -> None:
    """Encola un mensaje dirigido del campo a un familiar (from_field con
    contact_id). Formato de entrada del app: @fam|<contactId>|<texto>."""
    if not ENABLED:
        return
    _enqueue_from_field(from_num, contact_id, text, node_name)
    log.info("📥 (encolado) campo→contacto %s de %s: %s",
             contact_id, _node_hex(from_num), text)


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
    sender = _sanitize_token(msg.get("sender_name") or "Familia")
    cid = msg.get("contact_id")
    if cid is not None:
        # Dirigido: la app enruta por contact_id → FAM|<id>|<nombre>|<texto>
        body = f"FAM|{cid}|{sender}|{msg['text']}"
    else:
        # Legacy sin contacto: prefijo con el nombre.
        body = f"{sender}: {msg['text']}"
    _send_fragmented(interface, node_num, body)
    _mark(msg["id"], "sent")
    log.info("📤 familia→campo a %s (contacto %s): %s",
             _node_hex(node_num), cid, msg["text"])


def outbound_loop(conn_holder, stop_event) -> None:
    if not ENABLED:
        return
    while not stop_event.is_set():
        # 1. Reintentar mensajes de campo pendientes de escribir en Supabase.
        try:
            _flush_outbox_once()
        except Exception as e:
            log.error("✗ bridge flush outbox: %s", e)
        # 2. Entregar por la mesh los mensajes de familia pendientes.
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
    _load_outbox()
    threading.Thread(
        target=node_sync_loop, args=(conn_holder, my_num_getter, stop_event),
        daemon=True,
    ).start()
    threading.Thread(
        target=outbound_loop, args=(conn_holder, stop_event),
        daemon=True,
    ).start()
