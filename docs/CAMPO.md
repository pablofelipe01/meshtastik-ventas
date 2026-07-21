# Módulo Campo — captura agroindustrial sobre la mesh

> **Estado:** Fases 1 y 2 completas (catálogo, esquema, gateway y espejo Airtable,
> probados de punta a punta). Fases 3–5 pendientes.

## El problema que resuelve

En una finca, el operario toma datos donde **no hay señal**: conteo de frutos, peso
para el jornal, un foco de plaga. Hoy eso termina en un papel, o en una app que
guarda y solo sincroniza cuando encuentra cobertura. El que decide ve la
información **horas o días después**.

Este módulo la entrega **en segundos**: el operario captura → sale por LoRa al
gateway → el gateway la valida y la sube → una webapp la muestra en vivo.

```
📱 Operario (sin señal)  ──LoRa──►  🏠 Central  ──USB──►  Gateway (Pi4)
                                                            │
                                              ┌─────────────┴─────────────┐
                                              ▼                           ▼
                                        Supabase (verdad)          Airtable (espejo)
                                              │
                                              ▼
                                     Webapp en vivo (mapa + feed)
```

---

## El protocolo (lo que viaja por radio)

La mesh es angosta: **~200 bytes por paquete** y con límites de ciclo de trabajo.
Por eso no viaja JSON ni formularios, sino **códigos**. Toda trama va bajo 60 bytes.

```
@ag|FRJ|L1|P2|47           frutos rojos: lote 1, parcela 2, 47 frutos
@ag|JOR|L1|P2|38.5         jornal: 38,5 kg
@ag|PLG|L3|P1|BRC|3        plaga broca, severidad 3
@ag|CEN|L2|P4|CAF|1250     censo: café, 1.250 kg
@ag|GAN|L5|P1|127|0.94     ganado: 127 cabezas, confianza 0,94
```

Tres decisiones de diseño que hacen que esto quepa:

| Decisión | Por qué |
|---|---|
| **El nodo identifica al operario** | No viaja *quién* capturó: la radio ya lo dice. `campo_operarios.node_num` lo resuelve. Es lo que permite liquidar el jornal sin mandar cédulas por el aire. |
| **El operario está anclado a su finca** | Por eso `L1` basta: los códigos de lote son únicos *dentro de* la finca, no globalmente. El gateway resuelve finca ← operario ← nodo. |
| **El gateway valida y expande** | Comprueba que el lote/parcela exista antes de insertar, y rellena nombres, cultivo y coordenadas desde el catálogo. |

El gateway responde un **ACK corto** por la mesh (`✓ L1P2 47`) para que el
operario vea confirmado que el dato llegó.

### Códigos

**Tipos de captura:** `FRJ` frutos rojos · `JOR` jornal por peso · `PLG` plaga ·
`CEN` censo de producción · `GAN` conteo de ganado.

**Cultivos:** `CAF` café · `CAC` cacao · `PLA` plátano · `PAL` palma · `GAN` ganadería.

**Plagas:** `BRC` broca · `ROY` roya · `MIN` minador · `MON` monilia ·
`ESC` escoba de bruja · `SIG` sigatoka negra · `PCG` pudrición del cogollo ·
`PIC` picudo · `GAR` garrapata.

---

## Conteo de ganado por cámara

Hoy **simulado**, pero la arquitectura es la real y es la parte más vendedora:

> Una cámara en la manga de aforo hace la inferencia **localmente** y manda por
> LoRa solo el resultado — *"127 cabezas, confianza 0.94"*, unos 20 bytes.
> **El video nunca viaja; solo el dato.** Por eso funciona donde no hay ni señal
> ni ancho de banda.

En el catálogo, el nodo `Inv7` (`!4bf18b6e`) está registrado como
**dispositivo** `CAM-01 Manga de Aforo`, no como persona.

---

## Esquema (Supabase, proyecto `mesh-ventas`)

Todas las tablas llevan prefijo `campo_` para quedar aisladas del módulo de chat
(`nodes`, `messages`, `contacts`).

| Tabla | Rol |
|---|---|
| `campo_cultivos` | Catálogo de cultivos y su unidad de cosecha. |
| `campo_plagas` | Catálogo de plagas/enfermedades con nombre científico. |
| `campo_fincas` | Finca: ubicación, altitud, hectáreas. |
| `campo_lotes` | Lote dentro de la finca (`L1`…), con cultivo y coordenadas. |
| `campo_parcelas` | Parcela dentro del lote (`P1`…), con coordenadas. |
| `campo_operarios` | Mapea **nodo de radio → persona/dispositivo**, su finca y su tarifa por kg. |
| `campo_capturas` | El hecho: cada dato capturado en campo. |
| `campo_jornal_dia` (vista) | Liquidación: kg y pago por operario y día. |

En `campo_capturas` hay dos marcas de tiempo distintas a propósito:

- `capturado_at` — cuándo lo tomó el operario (puede venir de la cola offline).
- `recibido_at` — cuándo llegó al gateway.

La diferencia entre ambas **es la métrica que vende el producto**: mide la demora
que el cliente sufre hoy y que aquí es de segundos.

**RLS:** lectura para usuarios autenticados; el gateway escribe con `service_role`.

---

## Catálogo sembrado (datos de demo, geografía real)

Dos fincas en pisos térmicos distintos, con coordenadas reales para que el mapa
sea creíble:

| Finca | Ubicación | Altitud | Cultivos | Lotes | Parcelas |
|---|---|---|---|---|---|
| **La Esperanza** (`ESP`) | Chinchiná, Caldas · 4.995 N, −75.628 W | 1.450 msnm | Café, plátano | 4 | 12 |
| **Santa Bárbara** (`STB`) | Puerto López, Meta · 4.112 N, −72.989 W | 190 msnm | Ganadería, cacao, palma | 5 | 11 |

Café en la montaña y ganado/palma en el llano: cubre el conteo de frutos rojos
*y* el conteo de ganado sin que nada se vea forzado.

**Operarios = los nodos reales de la malla Inverse.** `Inv1`–`Inv3` en La
Esperanza (tarifa 900 $/kg), `Inv4`–`Inv6` en Santa Bárbara (750 $/kg) e `Inv7`
como la cámara. Así la demo usa los equipos que van dentro de la unidad portátil.

> Los datos de fincas, lotes y operarios son **ficticios**; la geografía y las
> plagas son reales. Sustituirlos por los de un cliente es cambiar el catálogo,
> no el código.

---

## Espejo en Airtable

Base **Test-Mesh** (`appQIcPsHjhqJNlkm`), tabla **Mesh-1** (`tblA1nrzhMWXnat38`).

Supabase es la fuente de verdad (tiene Realtime, auth y la PWA ya hechos);
Airtable es el **espejo para el cliente**, que ve sus datos en una hoja familiar.
Campos creados: `Tipo`, `Finca`, `Lote`, `Parcela`, `Cultivo`, `Operario`,
`Nodo`, `Valor`, `Unidad`, `Plaga`, `Severidad`, `Confianza`, `Lat`, `Lng`,
`Capturado`, `Recibido`, `Supabase ID`, `Trama`.

`Supabase ID` es la clave para no duplicar al re-sincronizar.

> La tabla conserva los campos por defecto de Airtable (`Notes`, `Assignee`,
> `Status`, `Attachments`, `Attachment Summary`). No estorban; se pueden borrar
> a mano desde la interfaz.

**Token:** va en el `.env` del gateway como `AIRTABLE_TOKEN` (más
`AIRTABLE_BASE_ID` y `AIRTABLE_TABLE_ID`). No se commitea.

---

## Límites honestos

La mesh sirve para **eventos de datos** (decenas por hora), no para telemetría
continua. LoRa tiene ciclo de trabajo limitado y el canal es compartido con el
chat. Es exactamente el patrón del agro — el operario captura y sigue — pero
conviene tenerlo claro para no prometer de más en una demo.

---

---

## El gateway (`gateway/campo.py`)

Se activa solo si hay `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`. Al arrancar carga
el catálogo en memoria y levanta tres hilos:

| Hilo | Qué hace |
|---|---|
| `_flush_loop` | Escribe en Supabase la cola local (cada 5 s). |
| `_catalog_loop` | Refresca el catálogo en memoria (cada 5 min). |
| `_airtable_loop` | Sube a Airtable lo que aún no está espejado (cada 10 s). |

**Cola local (`campo_outbox.json`)** — igual que el puente de familia: la captura
se encola y se responde el ACK de inmediato; si el internet del gateway está
caído, se reintenta hasta escribir. Sobrevive reinicios, así que **ninguna
captura se pierde**.

**El espejo se maneja desde la base, no desde la cola:** el hilo busca capturas
con `airtable_synced_at is null`. Si Airtable falla, se reintenta solo, y nunca
se duplica (queda registrado `airtable_record_id`).

**Catálogo obstinado:** si un lote no aparece, fuerza un refresco (máx. una vez
cada 30 s) y reintenta antes de rechazar — así un lote recién creado funciona sin
reiniciar el gateway.

### Probar sin radio

```bash
cd ~/mesh-portatil/gateway
echo '@ag|FRJ|L1|P2|47' | .venv/bin/python gateway.py --simulate --como '!7c1a5974'
```

`--como` simula qué nodo envía — imprescindible aquí, porque el operario se
deduce del nodo. Acepta `!hex`, `0x…` o decimal.

### Respuestas al operario

```
✓ FRJ L1P2 47 frutos          captura aceptada
✗ lote L9 no existe en ESP    código equivocado
✗ severidad debe ser 1..5     valor fuera de rango
✗ nodo !deadbeef sin operario registrado
```

---

## Pendiente

| Fase | Qué falta |
|---|---|
| 3 | Pestaña **Campo** en la app Flutter: formularios, selector lote/parcela, cola offline. |
| 4 | Webapp: mapa de lotes, feed en vivo, KPIs y liquidación de jornal. |
| 5 | Guion de demo de ventas. |
