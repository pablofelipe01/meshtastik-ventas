# Módulo Campo — captura agroindustrial sobre la mesh

> **Estado:** completo y probado por radio real de punta a punta.
> Documento técnico. Para **demostrarlo** ante un cliente ver [`DEMO.md`](DEMO.md);
> para **montar una unidad nueva** ver [`REPLICAR.md`](REPLICAR.md).

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

> Una cámara en el potrero hace la inferencia **localmente** y manda por LoRa
> solo el resultado — *"117 cabezas, confianza 0,93"*, unos 20 bytes.
> **El video nunca viaja; solo el dato.** Por eso funciona donde no hay ni señal
> ni ancho de banda.

En el catálogo, el nodo `Inv7` (`!4bf18b6e`) está registrado como
**dispositivo** `CAM-01 Manga de Aforo`, no como persona.

### Lo que convierte un número en una respuesta

`campo_lotes.hato_esperado` dice cuántas cabezas debería haber. El gateway compara
y guarda `faltan` en los datos de la captura, de modo que el panel no dice
*"hay 117 cabezas"* sino **"faltan 3 reses en L1"** — y el operario recibe el
acuse `✓ GAN L1P2 117 cabezas ⚠ faltan 3`.

Ese es el argumento del módulo: robo, extravío o un animal apartado por
enfermedad. Hoy el ganadero se entera días después.

### La cámara simulada — desde la app (lo normal)

En la pestaña **Campo**, al elegir *Ganado* aparece **«Simular conteo de
cámara»**. Pide cuántas reses faltan (0 = hato completo), genera un conteo
realista y lo manda por la mesh.

**Es la forma correcta de simularla**: el teléfono está conectado a un nodo que
sí está en el campo, así que el dato **cruza la malla de verdad** hasta el
Central. Una cámara enchufada al gateway no simularía nada — una cámara de
potrero está lejos por definición.

La trama lleva una marca final `cam`:

```
@ag|GAN|L1|P2|117|0.93|cam
```

El gateway la atribuye a la **cámara de esa finca** (el operario de tipo
`dispositivo`), aunque la haya emitido el nodo de una persona. En el panel se lee
*«CAM-01 Manga de Aforo · 117 cabezas · faltan 3»*, que es la historia limpia, y
en los datos quedan `simulado: true` y el nodo que realmente la envió — para no
confundirla nunca con la de una cámara real.

### La cámara simulada — desde el gateway (`gateway/camara_ganado.py`)

Para desarrollo, o si algún día dedicas un nodo a hacer de cámara. Dos modos:

```bash
# Por RADIO: el nodo de la cámara va enchufado por USB y el paquete viaja de
# verdad por LoRa hasta el Central.
python camara_ganado.py --lora --puerto /dev/ttyACM1 --lote L1 --parcela P2

# DIRECTO: sin radio, pero por la misma ruta interna del gateway (validación,
# cliente, alerta, cola y espejo). Para desarrollar y para demos sin ocupar nodo.
python camara_ganado.py --directo --lote L1 --parcela P2

# El momento que vende
python camara_ganado.py --directo --lote L1 --parcela P2 --faltan 3

# Vigilancia continua cada 2 minutos
python camara_ganado.py --directo --lote L1 --parcela P2 --intervalo 120 --veces 0
```

La simulación **no cuenta perfecto**, a propósito: la confianza varía y el error
crece cuando baja, igual que con polvo, sombra o animales cruzándose. En una
prueba real con confianza 0,89 contó 122 donde había 120, y con 0,99 acertó
exacto. Un contador que siempre acierta no es creíble — y tampoco enseña que la
confianza importa.

> En modo `--lora`, el nodo enchufado debe ser el que está registrado como la
> cámara. Si no, el gateway responde *"sin operario registrado"*: es correcto,
> porque el nodo es la identidad.

---

## Esquema (Supabase, proyecto `mesh-ventas`)

Todas las tablas llevan prefijo `campo_` para quedar aisladas del módulo de chat
(`nodes`, `messages`, `contacts`).

| Tabla | Rol |
|---|---|
| `campo_clientes` | Cada cliente. Toda tabla de datos lleva su `cliente_id`. |
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

**RLS (multi-cliente):** cada usuario lee **solo las filas de su cliente**; el
personal de Trama (`contacts.es_super`) las ve todas. Lo impone Postgres, no la
aplicación. El gateway escribe con `service_role` —que salta RLS— y por eso
estampa él mismo el `cliente_id` desde `CAMPO_CLIENTE_ID`.
Ver [`REPLICAR.md`](REPLICAR.md) para dar de alta un cliente y comprobar el
aislamiento.

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

## La app (pestaña **Campo**)

Formularios guiados: el operario **elige de listas, nunca teclea códigos**. Elige
tipo → lote → parcela → valor, y envía. En plagas, la plaga sale de una lista y
la severidad de un selector 1–5.

**El catálogo llega por la mesh, no por internet.** La app manda `@agcat`, el
gateway responde con los lotes y parcelas de *su* finca, y la app lo guarda en el
teléfono. A partir de ahí la captura funciona sin ninguna señal — que es
exactamente lo que se le promete al cliente.

```
→ @agcat
← AGCAT|ESP|La Esperanza|L1:El Alto:CAF:P1,P2,P3|L2:La Cañada:CAF:P1,P2,P3|…
← AGPLG|BRC:Broca|ESC:Escoba|GAR:Garrapata|…
```

Cada mensaje cabe en **un solo paquete LoRa** (sin fragmentar).

**Cola offline en el teléfono.** Si no hay malla, la captura se guarda y sale
sola al reconectar; el número de pendientes aparece en la pestaña. La captura
guarda su hora real y viaja con el sufijo `t<epoch>`, de modo que el panel puede
mostrar la demora verdadera. Nada se pierde por estar fuera de cobertura.

Archivos: `lib/models/campo_models.dart`, `lib/screens/campo_screen.dart` y la
sección Campo de `lib/services/meshtastic_service.dart`.

---

## El panel en vivo (`/campo` en la webapp)

Figura principal con las capturas del día, mapa satelital (lotes en gris,
capturas en color), fila de indicadores (jornal en kg, pago del día, focos de
plaga, último conteo de ganado), leyenda y feed que **destella** cuando entra un
dato nuevo. Filtro por finca que recentra el mapa.

Dos cosas que no son obvias y conviene no romper:

- `campo_capturas` está en la publicación de **Realtime**. Sin eso, la vista en
  vivo no se actualiza sola — y es el punto entero de la demo.
- El canal escucha **solo `INSERT`**. El espejo a Airtable hace `PATCH` sobre
  cada fila; con `*` la página se recargaría en bucle.

**Los colores de los cinco tipos están validados**, no elegidos a ojo: la primera
versión tenía lima y naranja con ΔE 2,2 bajo deuteranopía (indistinguibles). Se
corrigió separándolos de posiciones adyacentes. Si cambias un color, **vuelve a
validar** — ver la nota en `webapp/lib/campoTypes.ts`.

---

## Probado por radio real

El 2026-07-21, con la unidad armada:

```
15:48:42  [DM] !a8656e83 → !40883c41 : @ag|FRJ|L3|P3|790|t1784666920
15:48:42  captura de Luz Marina Ospina
15:48:45  → Supabase  → Airtable
```

**5 segundos** desde que el operario pulsa "Registrar" en un teléfono sin señal
celular hasta que el dato está en la base y en Airtable. Esa cifra ya no es una
promesa: es una medición, y el panel de análisis la calcula sola.

## Lo que falta

- Cultivos y plagas se editan por SQL; fincas, lotes, parcelas y operarios ya se
  gestionan desde `/campo/catalogo`.
- La inferencia real de la cámara de conteo de ganado (la arquitectura está
  lista; el nodo ya se registra como dispositivo).
