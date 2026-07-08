# Gateway Mesh Portátil — `@claude`

Servicio Python que corre en una Raspberry Pi conectada por USB a un nodo
Meshtastic. Escucha **todo** el tráfico de texto de la red mesh (LoRa) y, cuando
alguien escribe `@claude <pregunta>`, consulta a la API de Anthropic (con
búsqueda web) y responde **por DM** a quien preguntó — fragmentando si la
respuesta no cabe en un paquete.

La gracia: los teléfonos **no necesitan internet ni celular**. Solo el gateway
tiene conexión. Un nodo a ~20 km puede preguntarle a Claude cualquier cosa y
recibir la respuesta con un par de saltos de la mesh.

```
App/Nodo ──BLE/LoRa──► Nodo mesh ──LoRa (multi-hop)──► Nodo gateway ──USB──► Pi (gateway.py) ──WiFi──► Claude API
```

- **Nodo del gateway (este proyecto):** `!9ea1ff28` / `nodeNum 2661416744` (Heltec V3).
- **Host de referencia:** `ssh pfac@pi5-meshportatil`, código en `~/mesh-portatil/gateway/`.

---

## Protocolo `@claude`

Un solo comando de texto plano, enviado a **cualquier canal o por DM** al gateway:

```
@claude <pregunta>
```

- **Detección:** case-insensitive; el texto debe empezar por `@claude`.
- **Respuesta:** el gateway responde **siempre por DM** al nodo que preguntó
  (aunque haya preguntado en un canal grupal), con `wantAck=True`.
- **Prefijo:** las respuestas empiezan con `Claude: `.
- **Fragmentación:** si la respuesta supera ~200 bytes se parte en varios
  paquetes con prefijo `[i/n]` (ej. `[1/2] Claude: ...`, `[2/2] ...`). La app
  las reensambla por orden.
- **Concurrencia:** cada consulta corre en su propio hilo; el gateway sigue
  recibiendo tráfico mientras Claude responde.

### Ejemplos

| Mensaje en la mesh | Respuesta (DM al que preguntó) |
| --- | --- |
| `@claude ¿capital de Argentina?` | `Claude: La capital de Argentina es Buenos Aires...` |
| `@claude precio del bitcoin hoy` | `Claude: BTC ≈ $62,128 USD (-2.40% hoy), según Yahoo Finance...` (usa búsqueda web) |
| `@claude` (vacío) | `Claude: escribe tu pregunta después de @claude.` |
| `@claude ...` (sin API key) | `Claude: no configurado (falta ANTHROPIC_API_KEY).` |

### Conocimiento general vs. tiempo real

- **Conocimiento general** (historia, matemáticas, agronomía, traducciones…):
  respuesta directa del modelo, ~2-3 s, sin costo de búsqueda.
- **Datos actuales** (noticias, precios, clima, resultados): Claude usa la
  **búsqueda web** (el gateway tiene internet), ~15-20 s, con costo por búsqueda.

### Chat entre nodos

El chat normal entre nodos lo transporta la **mesh nativa de Meshtastic**; el
gateway no interviene, solo lo **registra** en sus logs (líneas `💬`). Únicamente
los mensajes que empiezan por `@claude` disparan una respuesta.

---

## Variables de entorno (`.env`)

Copia `.env.example` a `.env` y rellena. **`.env` no se commitea** (contiene la
API key). El gateway lo carga con `python-dotenv`.

| Variable | Default | Descripción |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | **Requerida.** Clave de la API de Anthropic (`sk-ant-...`). Sin ella, `@claude` avisa que no está configurado. |
| `MESH_SERIAL_PORT` | *(vacío)* | Puerto serial del radio. Vacío = autodetección (recomendado; sobrevive a que el SO reasigne `ttyUSB0`→`ttyUSB1`). |
| `LOG_LEVEL` | `INFO` | Nivel de log: `DEBUG` \| `INFO` \| `WARNING` \| `ERROR`. |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | Modelo de Anthropic. Sonnet/Opus habilitan la búsqueda web avanzada (`web_search_20260209`); Haiku usa la básica (`web_search_20250305`). |
| `CLAUDE_MAX_TOKENS` | `1024` | Tope de tokens de salida. Debe dar margen para que el modelo genere las búsquedas + lea resultados + escriba la respuesta. La longitud **final** la limita el `CLAUDE_SYSTEM_PROMPT`, no este número. |
| `CLAUDE_TIMEOUT` | `60` | Segundos de timeout de la llamada a la API (la búsqueda web añade latencia). |
| `CLAUDE_SYSTEM_PROMPT` | *(asistente general)* | Personalidad y reglas de Claude. El default lo define como asistente general que responde cualquier tema, en español, breve (<350 chars), terminando con punto. Cámbialo para adaptar tono/dominio. |
| `CLAUDE_WEB_SEARCH` | `true` | Activa/desactiva la búsqueda web. `false` = solo conocimiento del modelo (sin costo de búsqueda, sin datos en tiempo real). |
| `CLAUDE_WEB_SEARCH_MAX_USES` | `5` | Máximo de búsquedas por consulta (control de costo). Cada búsqueda cuesta ~$10 USD por 1.000. |

> **Costo:** además de los tokens del modelo, cada búsqueda web se factura aparte
> (~$0.01/búsqueda). Baja `CLAUDE_WEB_SEARCH_MAX_USES` o pon `CLAUDE_WEB_SEARCH=false`
> para acotar el gasto.

---

## Puesta en marcha

```bash
cd gateway
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # rellena ANTHROPIC_API_KEY
```

### Modo simulador (sin radio)

Prueba los handlers leyendo mensajes de stdin, sin hardware:

```bash
printf "@claude ¿cuánto es 2+2?\n" | python gateway.py --simulate
```

### En vivo (con el radio conectado)

```bash
python gateway.py            # autodetecta el radio en /dev/ttyUSB*
```

---

## Despliegue como servicio (systemd)

Archivo `mesh-portatil-gateway.service` (ya incluido):

```bash
sudo cp mesh-portatil-gateway.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mesh-portatil-gateway
sudo journalctl -u mesh-portatil-gateway -f      # logs en vivo
```

`Restart=always` + reconexión interna del radio → el gateway aguanta solo en
campo (revive tras crashes y reconecta si el USB se cae).

---

## Estructura del código

```
gateway/
├── gateway.py                    # escucha la mesh, enruta, reconecta; modo --simulate
├── claude_mesh.py                # detección @claude, llamada a la API + búsqueda web, fragmentación
├── requirements.txt              # meshtastic, anthropic, python-dotenv
├── .env.example                  # plantilla de variables (esta sí se commitea)
├── .env                          # secretos reales (NO se commitea)
└── mesh-portatil-gateway.service # unidad systemd
```

- **`gateway.py`** — `on_receive` filtra texto, registra el chat (`💬`), detecta
  `@claude` (canal o DM) y lanza el hilo; bootstrap con reconexión resiliente
  (`_InterfaceHolder` con lock) y modo simulador.
- **`claude_mesh.py`** — `is_claude_query`, `handle_claude`, `_ask_claude`
  (arma la petición con la herramienta de búsqueda web y maneja `pause_turn`),
  `_chunk_for_mesh` (fragmenta por bytes UTF-8 sin romper caracteres) y
  `send_text`.

---

## Errores y trampas conocidas

- **Respuesta no cabe en un paquete** → se fragmenta (`[i/n]`) y la app reensambla.
- **El puerto serial cambia tras reconectar** → deja `MESH_SERIAL_PORT` vacío para autodetección.
- **`max_tokens` muy bajo con búsqueda web** → la búsqueda + respuesta no caben; mantener ≥ 512 (default 1024).
- **Latencia alta en preguntas actuales** → es normal: Claude busca, lee y resume (~15-20 s).
- **Costo inesperado** → revisa `CLAUDE_WEB_SEARCH_MAX_USES`; cada búsqueda se factura.
