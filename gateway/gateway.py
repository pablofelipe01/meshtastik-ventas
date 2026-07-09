#!/usr/bin/env python3
"""
gateway.py — Gateway mesh portátil (chat entre nodos + "@claude").

Escucha TODO el tráfico de texto de la red Meshtastic conectada por serial:
  - Registra cada mensaje (chat entre nodos) para observabilidad.
  - Cuando detecta "@claude <pregunta>" en cualquier mensaje (canal o DM),
    resuelve la consulta con la API de Anthropic y responde por DM a quien
    preguntó (fragmentando si la respuesta no cabe en un paquete mesh).

La mesh nativa de Meshtastic ya transporta el chat entre nodos; este gateway es
un participante especial ("bot Claude") que además responde consultas de IA.

Config por .env (ver .env.example). Ejecutar como servicio systemd en la Pi.
Desarrollo sin radio:  python gateway.py --simulate
"""
import argparse
import logging
import os
import sys
import threading
import time
import traceback

from dotenv import load_dotenv

load_dotenv()

# ---------- Config ----------
SERIAL_PORT = os.getenv("MESH_SERIAL_PORT", "").strip()  # vacío = autodetectar
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").strip().upper()
BROADCAST_NUM = 0xFFFFFFFF  # destino "^all" en Meshtastic
CLAUDE_JOIN_TIMEOUT = 40  # solo simulador: espera a hilos de Claude al salir

# ---------- Logging ----------
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("gateway")

# claude_mesh comparte su propio logger; lo alineamos al mismo nivel.
from claude_mesh import handle_claude, is_claude_query  # noqa: E402
import bridge  # noqa: E402  puente mesh↔internet (Supabase); no-op si no está configurado


def _node_hex(node_num) -> str:
    try:
        return f"!{int(node_num) & 0xFFFFFFFF:08x}"
    except (TypeError, ValueError):
        return str(node_num)


# ---------- Interface holder (para que los hilos lean siempre el vivo) ----------
class _InterfaceHolder:
    def __init__(self):
        self._lock = threading.Lock()
        self._iface = None

    def set(self, iface):
        with self._lock:
            self._iface = iface

    def get(self):
        with self._lock:
            return self._iface


_conn = _InterfaceHolder()
_connection_lost = threading.Event()
_stop = threading.Event()


# ---------- Callback de recepción ----------
def on_receive(packet, interface):
    """Callback de pub.subscribe('meshtastic.receive', ...)."""
    try:
        decoded = packet.get("decoded") or {}
        if decoded.get("portnum") != "TEXT_MESSAGE_APP":
            return
        text = decoded.get("text")
        if not text:
            return

        from_num = packet.get("from")
        to_num = packet.get("to")
        my_num = interface.localNode.nodeNum if interface.localNode else None
        is_dm = my_num is not None and to_num == my_num
        destino = "DM" if is_dm else "canal"

        # Registro de chat: todo el tráfico de texto que ve el gateway.
        log.info("💬 [%s] %s → %s: %s",
                 destino, _node_hex(from_num), _node_hex(to_num), text)

        # No respondernos a nosotros mismos.
        if my_num is not None and from_num == my_num:
            return

        # @claude en cualquier lado (canal o DM) → responder por DM al que preguntó.
        if is_claude_query(text):
            threading.Thread(
                target=handle_claude,
                args=(_conn.get() or interface, from_num, text),
                daemon=True,
            ).start()
            return

        # Puente familia↔campo (solo DMs al gateway; broadcast = chat entre nodos).
        if is_dm and bridge.ENABLED:
            node_name = _node_name(interface, from_num)
            stripped = text.strip()

            # "@contactos" → responder la lista de contactos del nodo.
            if stripped.lower() == "@contactos":
                threading.Thread(
                    target=bridge.send_contacts,
                    args=(_conn.get() or interface, from_num),
                    daemon=True,
                ).start()
                return

            # "@fam|<contactId>|<texto>" → mensaje dirigido a un familiar.
            if stripped.lower().startswith("@fam|"):
                parts = stripped.split("|", 2)  # ["@fam", id, texto...]
                if len(parts) == 3 and parts[1].isdigit():
                    contact_id = int(parts[1])
                    body = parts[2]
                    threading.Thread(
                        target=bridge.handle_field_directed,
                        args=(from_num, contact_id, body, node_name),
                        daemon=True,
                    ).start()
                    return
                # formato inválido → ignora (o cae a legacy abajo)

            # Cualquier otro DM (texto plano) → familia sin dirigir (legacy).
            threading.Thread(
                target=bridge.handle_field_message,
                args=(from_num, text, node_name),
                daemon=True,
            ).start()
            return
    except Exception:
        log.error("Excepción en on_receive:\n%s", traceback.format_exc())


def _node_name(interface, node_num) -> str:
    """Nombre legible de un nodo desde el catálogo del radio, o su !hex."""
    try:
        for n in (getattr(interface, "nodes", None) or {}).values():
            if n.get("num") == node_num:
                user = n.get("user") or {}
                return user.get("longName") or user.get("shortName") or _node_hex(node_num)
    except Exception:
        pass
    return _node_hex(node_num)


def _my_num() -> int:
    iface = _conn.get()
    try:
        return iface.localNode.nodeNum if iface and iface.localNode else None
    except Exception:
        return None


def on_connection(interface, topic=None):
    my_num = interface.localNode.nodeNum if interface.localNode else None
    log.info("✅ Conexión mesh establecida. Nodo local: %s (%s)",
             _node_hex(my_num), my_num)


def on_connection_lost(interface, topic=None):
    log.warning("⚠️  Conexión mesh perdida.")
    _connection_lost.set()


# ---------- Bootstrap + reconexión ----------
def build_interface():
    """Crea el SerialInterface. Puerto vacío => autodetección de Meshtastic."""
    import meshtastic.serial_interface as si
    port = SERIAL_PORT or None
    log.info("🔌 Abriendo radio en %s ...", port or "autodetección")
    return si.SerialInterface(devPath=port)


def reconnect_interface(old_iface, should_stop):
    try:
        if old_iface is not None:
            old_iface.close()
    except Exception:
        pass
    delay = 5
    while not should_stop():
        try:
            iface = build_interface()
            log.info("🔄 Reconectado al radio.")
            return iface
        except Exception as e:
            log.error("Reintento de conexión falló: %s (espero %ss)", e, delay)
            time.sleep(delay)
            delay = min(delay * 2, 60)
    return None


def run_live():
    from pubsub import pub

    interface = build_interface()
    _conn.set(interface)
    pub.subscribe(on_receive, "meshtastic.receive")
    pub.subscribe(on_connection, "meshtastic.connection.established")
    pub.subscribe(on_connection_lost, "meshtastic.connection.lost")

    bridge.start(_conn, _my_num, _stop)

    log.info("🚀 Gateway en marcha. @claude activo. Ctrl-C para salir.")
    try:
        while not _stop.is_set():
            time.sleep(1)
            if _connection_lost.is_set():
                _connection_lost.clear()
                interface = reconnect_interface(interface, _stop.is_set)
                if interface is None:
                    break
                pub.subscribe(on_receive, "meshtastic.receive")
                _conn.set(interface)
    except KeyboardInterrupt:
        log.info("Saliendo por Ctrl-C.")
    finally:
        try:
            interface.close()
        except Exception:
            pass


# ---------- Modo simulador (sin radio) ----------
class _FakeNode:
    nodeNum = 0x00000000


class _FakeInterface:
    """Interface falso para probar handlers desde stdin sin hardware."""
    localNode = _FakeNode()

    def sendText(self, text, destinationId=None, wantAck=False, **kw):
        print(f"[SIM enviar → {_node_hex(destinationId)}] {text}")


def run_simulate():
    log.info("🧪 Modo simulador. Escribe mensajes (Ctrl-D para salir).")
    log.info("   Ej:  @claude ¿cuánto es 2+2?")
    iface = _FakeInterface()
    _conn.set(iface)
    for line in sys.stdin:
        text = line.rstrip("\n")
        if not text:
            continue
        packet = {
            "decoded": {"portnum": "TEXT_MESSAGE_APP", "text": text},
            "from": 0x12345678,
            "to": BROADCAST_NUM,
        }
        on_receive(packet, iface)
        time.sleep(0.2)  # deja que el hilo de Claude arranque
    # Espera a que terminen los hilos de Claude en vuelo antes de salir.
    for t in threading.enumerate():
        if t is not threading.current_thread() and t.daemon:
            t.join(timeout=CLAUDE_JOIN_TIMEOUT)


def main():
    ap = argparse.ArgumentParser(description="Gateway mesh portátil (@claude)")
    ap.add_argument("--simulate", action="store_true",
                    help="lee mensajes de stdin sin radio (desarrollo)")
    args = ap.parse_args()

    if args.simulate:
        run_simulate()
    else:
        run_live()


if __name__ == "__main__":
    main()
