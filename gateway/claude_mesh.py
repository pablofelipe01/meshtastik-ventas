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
import threading
import time

import mailer  # envío de correos (herramienta enviar_correo); no-op si no está configurado

# ---------- Configuración (todo por .env) ----------
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6").strip()
# Con búsqueda web el modelo necesita margen para generar consultas + leer
# resultados + escribir la respuesta; la longitud FINAL la limita el system prompt.
CLAUDE_MAX_TOKENS = int(os.getenv("CLAUDE_MAX_TOKENS", "1024"))
CLAUDE_TIMEOUT_SECONDS = float(os.getenv("CLAUDE_TIMEOUT", "60"))
CLAUDE_SYSTEM_PROMPT = os.getenv(
    "CLAUDE_SYSTEM_PROMPT",
    "Eres un asistente general útil que responde por una red de radio de texto "
    "(Meshtastic/LoRa) en zonas sin internet. Puedes responder sobre CUALQUIER "
    "tema. Cuando la pregunta dependa de datos actuales (noticias, precios, clima, "
    "eventos, resultados deportivos), usa la búsqueda web. Responde SIEMPRE en "
    "español, de forma breve, completa y directa, en menos de 350 caracteres. "
    "Termina siempre con punto final.",
)

# ---------- Búsqueda web (herramienta del lado del servidor de Anthropic) ----------
# Deja que Claude busque en internet (el gateway tiene conexión). Cuesta aparte
# (~$10/1000 búsquedas). Apágala con CLAUDE_WEB_SEARCH=false.
CLAUDE_WEB_SEARCH = os.getenv("CLAUDE_WEB_SEARCH", "true").strip().lower() in (
    "1", "true", "yes", "si", "sí",
)
# Máximo de búsquedas por consulta (control de costo).
CLAUDE_WEB_SEARCH_MAX_USES = int(os.getenv("CLAUDE_WEB_SEARCH_MAX_USES", "5"))
# Variante de la herramienta: la avanzada (filtra resultados) exige Sonnet/Opus;
# la básica funciona en Haiku. Autoseleccionamos según el modelo.
_WEB_SEARCH_ADVANCED_MODELS = ("sonnet", "opus")


def _web_search_tool():
    """Devuelve la definición de la herramienta de búsqueda web, o None si está
    desactivada."""
    if not CLAUDE_WEB_SEARCH:
        return None
    advanced = any(m in CLAUDE_MODEL for m in _WEB_SEARCH_ADVANCED_MODELS)
    tool_type = "web_search_20260209" if advanced else "web_search_20250305"
    return {
        "type": tool_type,
        "name": "web_search",
        "max_uses": CLAUDE_WEB_SEARCH_MAX_USES,
    }


# ---------- Memoria de conversación por nodo ----------
# Cada nodo (teléfono) tiene su propio hilo. Se guarda SOLO el texto (no los
# resultados de búsqueda web, que quedan viejos y son enormes). El hilo se
# olvida tras CLAUDE_MEMORY_TTL_MIN minutos de inactividad, o al llegar a
# CLAUDE_MEMORY_MAX_TURNS intercambios (ventana deslizante).
CLAUDE_MEMORY = os.getenv("CLAUDE_MEMORY", "true").strip().lower() in (
    "1", "true", "yes", "si", "sí",
)
CLAUDE_MEMORY_TTL_MIN = float(os.getenv("CLAUDE_MEMORY_TTL_MIN", "5"))
CLAUDE_MEMORY_MAX_TURNS = int(os.getenv("CLAUDE_MEMORY_MAX_TURNS", "8"))
# Palabras que reinician el hilo: "@claude nuevo", "@claude reset", etc.
_RESET_WORDS = {"nuevo", "reset", "reiniciar", "borrar", "olvida", "olvidar"}

# node_num -> {"messages": [ {role, content}, ... ], "last": epoch_seconds}
_conversations = {}
_conv_lock = threading.Lock()


def _reset_conversation(node_num) -> None:
    with _conv_lock:
        _conversations.pop(node_num, None)


def _get_history(node_num) -> list:
    """Historial vigente del nodo (lista de mensajes), o [] si no hay o expiró."""
    if not CLAUDE_MEMORY:
        return []
    ttl = CLAUDE_MEMORY_TTL_MIN * 60
    now = time.time()
    with _conv_lock:
        entry = _conversations.get(node_num)
        if entry is None:
            return []
        if now - entry["last"] > ttl:
            _conversations.pop(node_num, None)  # expiró
            return []
        return list(entry["messages"])


def _remember(node_num, user_text: str, assistant_text: str) -> None:
    """Añade el intercambio al hilo del nodo y recorta a la ventana de turnos."""
    if not CLAUDE_MEMORY:
        return
    max_msgs = CLAUDE_MEMORY_MAX_TURNS * 2  # cada turno = user + assistant
    with _conv_lock:
        entry = _conversations.get(node_num) or {"messages": [], "last": 0.0}
        entry["messages"].append({"role": "user", "content": user_text})
        entry["messages"].append({"role": "assistant", "content": assistant_text})
        if len(entry["messages"]) > max_msgs:
            entry["messages"] = entry["messages"][-max_msgs:]
        entry["last"] = time.time()
        _conversations[node_num] = entry


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


def _extract_text(content) -> str:
    """Une los bloques de texto de la respuesta (ignora bloques de herramienta)."""
    parts = []
    for b in content:
        if getattr(b, "type", None) == "text":
            parts.append(b.text)
    return "".join(parts).strip()


# Herramienta cliente: Claude la invoca y el gateway la ejecuta (envía el correo).
_EMAIL_TOOL = {
    "name": "enviar_correo",
    "description": (
        "Envía un correo electrónico (email) a un destinatario. Úsala cuando el "
        "usuario pida mandar o enviar un correo/email a alguien. El destinatario "
        "puede ser un alias de la libreta (una sola palabra, p. ej. 'juan' o "
        "'mama') o una dirección de correo completa. Redacta un cuerpo apropiado "
        "y completo a partir de lo que pidió el usuario."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "destinatario": {
                "type": "string",
                "description": "Alias de la libreta (una palabra) o email completo.",
            },
            "asunto": {"type": "string", "description": "Asunto breve del correo."},
            "cuerpo": {"type": "string", "description": "Cuerpo del correo."},
        },
        "required": ["destinatario", "cuerpo"],
    },
}


def _run_tool(block):
    """Ejecuta una herramienta cliente que pidió Claude. Devuelve el texto
    resultado para el tool_result."""
    if block.name == "enviar_correo":
        inp = block.input or {}
        out = mailer.send_email(
            inp.get("destinatario", ""), inp.get("asunto", ""), inp.get("cuerpo", ""))
        log.info("✉️  enviar_correo(%s): %s", inp.get("destinatario"), out)
        return out
    return "Herramienta desconocida."


def _ask_claude(query: str, history: list = None) -> str:
    """Llama a la API de Anthropic (búsqueda web + herramienta de correo si están
    activas) y devuelve el texto final. `history` es el hilo previo del nodo.
    Maneja `pause_turn` (server tools) y `tool_use` (correo) en un bucle."""
    client = _anthropic_client.with_options(timeout=CLAUDE_TIMEOUT_SECONDS)
    tools = []
    ws = _web_search_tool()
    if ws is not None:
        tools.append(ws)
    if mailer.ENABLED:
        tools.append(_EMAIL_TOOL)

    kwargs = {
        "model": CLAUDE_MODEL,
        "max_tokens": CLAUDE_MAX_TOKENS,
        "system": CLAUDE_SYSTEM_PROMPT,
    }
    if tools:
        kwargs["tools"] = tools

    messages = list(history or []) + [{"role": "user", "content": query}]
    for _ in range(6):
        resp = client.messages.create(messages=messages, **kwargs)
        if resp.stop_reason == "pause_turn":
            # Server tool (búsqueda web) llegó a su límite interno: se reanuda.
            messages.append({"role": "assistant", "content": resp.content})
            continue
        if resp.stop_reason == "tool_use":
            # Herramienta cliente (correo): la ejecutamos y devolvemos el result.
            messages.append({"role": "assistant", "content": resp.content})
            results = []
            for block in resp.content:
                if getattr(block, "type", None) == "tool_use":
                    results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": _run_tool(block),
                    })
            if results:
                messages.append({"role": "user", "content": results})
                continue
            return _extract_text(resp.content)
        return _extract_text(resp.content)
    return _extract_text(resp.content)


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

    # Comando de reinicio del hilo: "@claude nuevo" / "reset" / ...
    if query.lower().strip(" .!?¿¡") in _RESET_WORDS:
        _reset_conversation(from_num)
        log.info("🧹 Hilo reiniciado por %s", _node_hex(from_num))
        send_text(interface, from_num, "Claude: listo, empecé una conversación nueva.")
        return

    if _anthropic_client is None:
        send_text(interface, from_num, "Claude: no configurado (falta ANTHROPIC_API_KEY).")
        return

    history = _get_history(from_num)
    log.info("🤖 Consulta Claude de %s (%d turnos previos): %s",
             _node_hex(from_num), len(history) // 2, query)
    try:
        answer = _ask_claude(query, history)
    except Exception as e:
        log.error("✗ Error consultando Claude: %s", e)
        send_text(interface, from_num, "Claude: error al consultar. Intenta de nuevo.")
        return

    if not answer:
        send_text(interface, from_num, "Claude: sin respuesta.")
        return

    _remember(from_num, query, answer)
    chunks = _chunk_for_mesh("Claude: " + answer)
    total = len(chunks)
    for i, chunk in enumerate(chunks, 1):
        out = chunk if total == 1 else f"[{i}/{total}] {chunk}"
        send_text(interface, from_num, out)
