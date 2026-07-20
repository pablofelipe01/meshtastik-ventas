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

- **Nodo del gateway (este proyecto):** `!40883c41` / `nodeNum 1082670145` (Central, Seeed Wio Tracker L1).
- **Host de referencia:** `ssh pfac@pi4-meshportatil-show`, código en `~/mesh-portatil/gateway/`. (La `pi5-meshportatil` / Heltec `!9ea1ff28` queda de respaldo.)

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

### Memoria de conversación

Cada nodo mantiene su **propio hilo**, así los seguimientos funcionan:

```
@claude ¿partidos de mañana del mundial?   → Francia vs Marruecos...
@claude ¿y el viernes?                      → (entiende el contexto) España vs Bélgica...
@claude nuevo                               → borra el hilo y empieza de cero
```

- **Por nodo:** el hilo de cada teléfono es independiente.
- **TTL:** se olvida tras `CLAUDE_MEMORY_TTL_MIN` minutos de inactividad (default 5) — evita enganchar un seguimiento a una charla vieja.
- **Ventana:** guarda los últimos `CLAUDE_MEMORY_MAX_TURNS` intercambios (default 8); al llegar al tope descarta el más viejo.
- **Solo texto:** no guarda resultados de búsqueda web (quedan viejos); en un seguimiento Claude vuelve a buscar si hace falta.
- **Reinicio manual:** `@claude nuevo` (también `reset`, `reiniciar`, `borrar`, `olvida`).
- La memoria vive en RAM del gateway (se pierde al reiniciar el servicio) y es barata (~2-3K tokens por consulta con historial).

### Chat entre nodos

El chat normal entre nodos lo transporta la **mesh nativa de Meshtastic**; el
gateway no interviene, solo lo **registra** en sus logs (líneas `💬`). Únicamente
los mensajes que empiezan por `@claude` (o el protocolo `@fam`/`@contactos`)
disparan acción del gateway.

---

## Puente familia↔campo (mensajería dirigida)

Si el gateway tiene configurado Supabase (ver variables abajo), sirve de puente
entre los nodos de campo (sin internet) y sus familiares (en internet, vía la PWA
`webapp/`). Mensajería **dirigida persona↔persona** con privacidad por usuario.

### Protocolo por la mesh (app Flutter ↔ gateway, por DM)

| Mensaje del app → gateway | Acción |
| --- | --- |
| `@contactos` | El gateway responde `CONTACTOS\|<id>:<nombre>\|...` con los familiares asignados a ese nodo (desde Supabase). |
| `@fam\|<id>\|<texto>` | Mensaje dirigido del campo a un familiar (id de contacto). Se guarda en Supabase como `from_field` con `contact_id`. |
| texto plano (DM, sin prefijo) | Legacy: mensaje a familia sin dirigir (`contact_id` nulo). |

| Mensaje del gateway → app | Significado |
| --- | --- |
| `FAM\|<id>\|<nombre>\|<texto>` | Mensaje de un familiar hacia el nodo (fragmentado con `[i/n]` si es largo). El app lo agrupa por contacto. |

### Cola local (outbox) — sin pérdida de mensajes

Los mensajes del campo (`from_field`) **no se escriben directo** a Supabase: se
**encolan** en `outbox.json` (persistente en la Pi) y un hilo los reintenta hasta
escribirlos. Así, si el internet del gateway se cae (típico con el hotspot del
celular), ningún mensaje se pierde — se entregan cuando vuelve la conexión, y
sobreviven reinicios/apagones. Es simétrico al sentido familia→campo (que se
encola en Supabase y el gateway reintenta la entrega por la mesh).

### Sincronización de nodos (mapa)

Cada `BRIDGE_NODE_SYNC_SECONDS` el gateway vuelca el catálogo de nodos del radio
(nombre, batería, **GPS**) a la tabla `nodes` de Supabase → alimenta el mapa de
la PWA.

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
| `CLAUDE_MEMORY` | `true` | Activa/desactiva la memoria de conversación por nodo. `false` = cada `@claude` es independiente. |
| `CLAUDE_MEMORY_TTL_MIN` | `5` | Minutos de inactividad tras los que se olvida el hilo de un nodo. |
| `CLAUDE_MEMORY_MAX_TURNS` | `8` | Máximo de intercambios (pregunta+respuesta) que se recuerdan por nodo. |
| `SUPABASE_URL` | *(vacío)* | URL del proyecto Supabase. **Activa el puente familia↔campo** junto con la service key. |
| `SUPABASE_SERVICE_KEY` | *(vacío)* | Clave `service_role` de Supabase (secreta; ignora RLS). Requerida para el puente. |
| `BRIDGE_POLL_SECONDS` | `4` | Intervalo del poller de salientes (familia→campo) y del reintento del outbox. |
| `BRIDGE_NODE_SYNC_SECONDS` | `45` | Intervalo de sincronización de nodos+GPS a Supabase. |

> **Costo:** además de los tokens del modelo, cada búsqueda web se factura aparte
> (~$0.01/búsqueda). Baja `CLAUDE_WEB_SEARCH_MAX_USES` o pon `CLAUDE_WEB_SEARCH=false`
> para acotar el gasto.
>
> **Puente:** sin `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` el puente familia↔campo
> queda desactivado (el gateway solo hace chat + `@claude`).

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
