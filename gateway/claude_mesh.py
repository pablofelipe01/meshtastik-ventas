"""
claude_mesh.py — Integración "@claude" para el gateway mesh portátil.

Detecta consultas "@claude <pregunta>" que llegan por la red Meshtastic, las
resuelve con la API de Anthropic y devuelve la respuesta por DM a quien preguntó
(fragmentada si no cabe en un paquete mesh).

USO desde gateway.py
--------------------
    import threading
    from claude_mesh import handle_claude, is_claude_query

    # dentro de on_receive, tras decodificar el texto:
    if is_claude_query(text):
        threading.Thread(
            target=handle_claude,
            args=(interface, from_num, text),
            daemon=True,
        ).start()
        return   # no cae al dispatcher del protocolo pipe

Requisitos del entorno:
  - `interface.sendText(...)` estilo Meshtastic.
  - ANTHROPIC_API_KEY en el .env (si falta, @claude queda inactivo y avisa).
"""
import logging
import os

# ---------- Configuración (todo por .env) ----------
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-haiku-4-5").strip()
CLAUDE_MAX_TOKENS = int(os.getenv("CLAUDE_MAX_TOKENS", "160"))
CLAUDE_TIMEOUT_SECONDS = float(os.getenv("CLAUDE_TIMEOUT", "30"))
CLAUDE_SYSTEM_PROMPT = os.getenv(
    "CLAUDE_SYSTEM_PROMPT",
    "Eres un asistente para una red de radio de texto (Meshtastic/LoRa) en zonas "
    "sin internet. Respondes SIEMPRE en español, de forma breve, completa y "
    "directa, en menos de 350 caracteres. Termina siempre con punto final.",
)
# Tope de bytes útiles por paquete Meshtastic (~237 real). Margen para "[i/n] ".
_MESH_CHUNK_BYTES = 200

try:
    import anthropic
    _anthropic_client = (
        anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None
    )
except ImportError:  # el SDK anthropic es opcional; sin él, @claude queda inactivo
    anthropic = None  # type: ignore[assignment]
    _anthropic_client = None

log = logging.getLogger("claude-mesh")


def _node_hex(node_num) -> str:
    try:
        return f"!{int(node_num) & 0xFFFFFFFF:08x}"
    except (TypeError, ValueError):
        return str(node_num)


def is_claude_query(text: str) -> bool:
    """True si el texto es una consulta "@claude ..." (case-insensitive)."""
    return text.strip().lower().startswith("@claude")


def send_text(interface, destination_node, text: str) -> None:
    """Envía un texto como DM a un nodo.

    wantAck=True hace que el stack Meshtastic reintente si el destino no acusa
    recibo dentro del timeout.
    """
    try:
        interface.sendText(text, destinationId=destination_node, wantAck=True)
        log.info("📤 → %s: %s", _node_hex(destination_node), text)
    except Exception as e:
        log.error("✗ Error enviando a %s: %s", _node_hex(destination_node), e)


def _chunk_for_mesh(text: str, limit: int = _MESH_CHUNK_BYTES) -> list:
    """Parte un texto en trozos que caben en un paquete Meshtastic.

    Meshtastic no fragmenta automáticamente: un texto que excede el tope del
    paquete se rechaza/trunca. Cortamos por palabra y, si una palabra sola no
    cabe, la partimos por bytes sin romper caracteres multibyte.
    """
    chunks = []
    current = ""
    for word in text.split():
        candidate = word if not current else current + " " + word
        if len(candidate.encode("utf-8")) <= limit:
            current = candidate
            continue
        if current:
            chunks.append(current)
            current = ""
        while len(word.encode("utf-8")) > limit:
            cut = word[:limit]
            while len(cut.encode("utf-8")) > limit:
                cut = cut[:-1]
            chunks.append(cut)
            word = word[len(cut):]
        current = word
    if current:
        chunks.append(current)
    return chunks or [""]


def handle_claude(interface, from_num, text: str) -> None:
    """Responde una consulta libre "@claude <pregunta>" con la API de Anthropic.

    Lánzalo en un hilo aparte desde on_receive para no bloquear la recepción de
    otros paquetes mientras la API responde.
    """
    # Quitar el prefijo "@claude" (case-insensitive) y espacios.
    query = text.strip()[len("@claude"):].strip()
    if not query:
        send_text(interface, from_num, "Claude: escribe tu pregunta después de @claude.")
        return
    if _anthropic_client is None:
        send_text(interface, from_num, "Claude: no configurado (falta ANTHROPIC_API_KEY).")
        return

    log.info("🤖 Consulta Claude de %s: %s", _node_hex(from_num), query)
    try:
        resp = _anthropic_client.with_options(
            timeout=CLAUDE_TIMEOUT_SECONDS
        ).messages.create(
            model=CLAUDE_MODEL,
            max_tokens=CLAUDE_MAX_TOKENS,
            system=CLAUDE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": query}],
        )
        answer = next(
            (b.text for b in resp.content if b.type == "text"), ""
        ).strip()
    except Exception as e:
        log.error("✗ Error consultando Claude: %s", e)
        send_text(interface, from_num, "Claude: error al consultar. Intenta de nuevo.")
        return

    if not answer:
        send_text(interface, from_num, "Claude: sin respuesta.")
        return

    chunks = _chunk_for_mesh("Claude: " + answer)
    total = len(chunks)
    for i, chunk in enumerate(chunks, 1):
        out = chunk if total == 1 else f"[{i}/{total}] {chunk}"
        send_text(interface, from_num, out)
