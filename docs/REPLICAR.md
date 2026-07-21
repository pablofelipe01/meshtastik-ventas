# Replicar una unidad para un cliente

> Manual para montar una unidad nueva a la medida de un cliente.
> El guion para demostrarla es [`DEMO.md`](DEMO.md); el detalle técnico del
> módulo agro es [`CAMPO.md`](CAMPO.md).

Una unidad son cuatro piezas, y solo una cambia mucho por cliente:

| Pieza | ¿Cambia por cliente? |
|---|---|
| **Hardware** (Pi + radios) | No — es la misma receta |
| **Software del gateway** | No — se copia tal cual, cambia el `.env` |
| **Nube** (Supabase + Airtable) | Sí — proyecto nuevo por cliente (ver aviso abajo) |
| **Catálogo** (fincas, lotes, operarios) | **Sí — esto es el trabajo a la medida** |

Si tienes prisa: casi todo se copia, y el 80 % del trabajo real está en
[el catálogo](#5-el-catálogo--esto-es-lo-hecho-a-la-medida).

---

## ⚠️ Antes de vender: el aislamiento entre clientes

**Hoy el sistema no separa clientes.** Las políticas RLS de las tablas `campo_*`
dan lectura a **cualquier usuario autenticado**, sobre **todos** los datos. Si
metes dos clientes en el mismo proyecto de Supabase, **cada uno vería los datos
del otro**.

Para un cliente real, elige una de estas dos:

- **Un proyecto de Supabase por cliente** (recomendado para los primeros).
  Aislamiento total, cero código nuevo, cuesta un proyecto más. Es lo que
  describe este manual.
- **Multi-cliente en un solo proyecto.** Requiere trabajo que **todavía no está
  hecho**: una tabla `clientes`, una columna `cliente_id` en cada tabla `campo_*`
  y políticas RLS que filtren por el cliente del usuario. No lo improvises el día
  antes de entregar.

---

## 1. Inventario de hardware

| Pieza | Qué usamos | Notas |
|---|---|---|
| Gateway | Raspberry Pi 4 o 5 | Con fuente propia; la Pi5 pide más corriente |
| Nodo central | Seeed **Wio Tracker L1** | Va por USB al gateway. **Otro firmware y otro bootloader** que los T1000-E |
| Nodos móviles | Seeed **T1000-E** | Uno por persona o vehículo. GPS y batería propios |
| Cable USB | **De datos**, corto y firme | El fallo más común y más tonto. Ver [trampas](#trampas-conocidas) |
| Salida a internet | Hotspot celular o Starlink | Solo el gateway lo necesita, **nunca** los teléfonos |

Cuenta un nodo de repuesto. En una demo, tener un nodo de más vale más que
tenerlo todo perfecto.

---

## 2. La malla

Cada cliente lleva **su propio canal privado**. Nunca reutilices el canal de
otro cliente ni el público de Meshtastic.

```bash
# Generar un canal nuevo con PSK aleatorio AES256 en el nodo Central
meshtastic --port /dev/ttyACM0 --ch-set name "<NombreCliente>" --ch-index 0
meshtastic --port /dev/ttyACM0 --ch-set psk random --ch-index 0
meshtastic --port /dev/ttyACM0 --set lora.region US
meshtastic --port /dev/ttyACM0 --set device.role CLIENT

# Sacar la URL del canal — ESTA ES LA LLAVE DE LA MALLA
meshtastic --port /dev/ttyACM0 --info | grep "^Complete URL"
```

Guarda esa URL en un archivo con permisos `600` **fuera del repositorio**. Quien
la tenga entra a la malla del cliente.

Aplícala a cada nodo móvil:

```bash
meshtastic --port <puerto-del-nodo> --seturl "$(cat canal-<cliente>.url)"
meshtastic --port <puerto-del-nodo> --set-owner "Nodo 1"
```

Anota el **número de nodo** de cada equipo (`!hex` y decimal). Lo vas a necesitar
para el catálogo de operarios: **el número de nodo es la identidad real** y no
cambia aunque renombres o reflashees el equipo.

> Un ejemplo completo de composición de malla está en
> [`../mesh-inverse.md`](../mesh-inverse.md).

---

## 3. El gateway

### Copiar el software

```bash
ssh <usuario>@<host-nuevo>
mkdir -p ~/mesh-portatil && cd ~/mesh-portatil
# copia gateway/ desde el repo o desde una unidad que ya funcione
python3 -m venv gateway/.venv
gateway/.venv/bin/pip install -r gateway/requirements.txt
```

Archivos del gateway (ninguno cambia por cliente):

| Archivo | Qué hace |
|---|---|
| `gateway.py` | Proceso principal: escucha la mesh y reparte a los módulos |
| `campo.py` | Captura agro (`@ag\|…`), catálogo (`@agcat`), espejo a Airtable |
| `bridge.py` | Puente mesh↔Supabase (chat con la familia, sincronía de nodos) |
| `claude_mesh.py` | `@claude`: consulta a la API de Anthropic |
| `mailer.py` | Envío de correos por SMTP desde la mesh |

### `.env` (aquí sí cambia todo)

Copia `gateway/.env.example` a `.env`, rellena y deja permisos `600`.
Lo mínimo para el módulo Campo:

```
MESH_SERIAL_PORT=            # vacío = autodetectar
ANTHROPIC_API_KEY=…
SUPABASE_URL=…               # del proyecto del cliente
SUPABASE_SERVICE_KEY=…
AIRTABLE_TOKEN=…             # PAT acotado SOLO a la base del cliente
AIRTABLE_BASE_ID=…
AIRTABLE_TABLE_ID=…
```

> El token de Airtable debe tener **solo** los permisos
> `data.records:read`, `data.records:write`, `schema.bases:read`, y acceso
> **únicamente a la base de ese cliente**. Un token con acceso total llega a
> todas tus bases.

### Servicio

`/etc/systemd/system/mesh-portatil-gateway.service` con `User=<usuario>`,
`EnvironmentFile=` apuntando al `.env`, `ExecStart=<venv>/bin/python gateway.py`
y `Restart=always`. Luego:

```bash
sudo systemctl enable --now mesh-portatil-gateway
sudo journalctl -u mesh-portatil-gateway -f
```

Debe aparecer:

```
✅ Conexión mesh establecida. Nodo local: !xxxxxxxx
🌱 catálogo: N fincas, N lotes, N parcelas, N operarios
🪞 Espejo Airtable activo
```

### Red — no lo dejes para el final

- La unidad lleva **pantalla y teclado**, así que la red se puede unir en el
  sitio (y NetworkManager la guarda para la próxima). Aun así, deja preguardada
  una red de respaldo con `autoconnect` y prioridad baja. Si es un hotspot
  celular, en **2,4 GHz**: la Pi no ve 6 GHz.
- Si usas Tailscale, **comprueba el DNS después de instalarlo**
  (ver [trampas](#trampas-conocidas)).
- Apagado sin contraseña por SSH: un archivo en `/etc/sudoers.d/` con NOPASSWD
  para `poweroff`/`reboot`.

---

## 4. La nube

### Supabase

Crea un **proyecto nuevo para el cliente** y aplica las migraciones del módulo
Campo en este orden:

1. Esquema `campo_*` (tablas, índices y RLS)
2. Catálogo del cliente (ver la sección siguiente)
3. Vista `campo_jornal_dia`
4. **Realtime** — el que más se olvida:

```sql
alter publication supabase_realtime add table campo_capturas;
```

> **Sin este paso el panel en vivo no se actualiza solo**, que es justamente lo
> que se demuestra. No da ningún error: simplemente no pasa nada.

Si el cliente además va a usar el chat con la familia, replica también `nodes`,
`messages`, `contacts` y `node_contacts`.

### Airtable

Crea una base y una tabla con estos campos (los nombres deben coincidir
exactamente con los que escribe `campo.py`):

`Tipo` (selección) · `Finca` (selección) · `Lote` · `Parcela` ·
`Cultivo` (selección) · `Operario` · `Nodo` · `Valor` (número) · `Unidad` ·
`Plaga` (selección) · `Severidad` (valoración 1-5) · `Confianza` (porcentaje) ·
`Lat` · `Lng` · `Capturado` (fecha-hora) · `Recibido` (fecha-hora) ·
`Supabase ID` (número) · `Trama`

Borra los campos por defecto (`Notes`, `Assignee`, `Status`, `Attachments`) y las
tres filas vacías que Airtable crea sola.

`campo.py` escribe con `typecast`, así que las opciones de las listas que falten
se crean solas — pero es más limpio dejarlas puestas de antemano.

### Webapp

Despliega `webapp/` en Vercel con *Root Directory* `webapp` y estas variables:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY   # restringida por referrer al dominio del cliente
SUPABASE_SERVICE_KEY              # solo servidor, para /api/*
```

Crea los usuarios del cliente en Supabase Auth y su fila en `contacts`
(con `is_admin` solo para quien deba generar o borrar datos de demostración).

---

## 5. El catálogo — esto es lo hecho a la medida

**Aquí está el trabajo real.** Todo lo anterior se copia; esto se levanta con el
cliente delante.

### Qué preguntarle al cliente

1. **¿Cuántas fincas y cómo se llaman?** Municipio y departamento (para el mapa).
2. **¿Cómo llaman a sus divisiones?** Lote, suerte, tablón, potrero, paño… Usa
   **su palabra**, no la tuya. Va en el nombre que ve el operario.
3. **Coordenadas de cada lote.** Con el GPS del celular en el centro de cada uno
   basta. Sin esto, el mapa no vende.
4. **¿Qué cultivan en cada lote?**
5. **¿Qué plagas les preocupan de verdad?** No metas nueve si solo persiguen dos.
6. **¿Quién captura y con qué equipo?** Nombre ↔ número de nodo.
7. **¿Cuánto pagan por kilo?** Va en `tarifa_kg` y alimenta la liquidación.
8. **¿Qué medirían primero?** Su respuesta decide qué tipos de captura activas.

### Sembrarlo

```sql
-- 1. Cultivos y plagas: deja SOLO los que el cliente maneja
insert into campo_cultivos (codigo, nombre, unidad_cosecha) values
  ('CAF','Café','kg cereza');

insert into campo_plagas (codigo, nombre, nombre_cientifico, cultivo) values
  ('BRC','Broca del café','Hypothenemus hampei','CAF');

-- 2. Fincas (coordenadas reales)
insert into campo_fincas (codigo, nombre, municipio, departamento, lat, lng, altitud_msnm, hectareas)
values ('XXX','<Nombre>','<Municipio>','<Depto>', 0.0000, 0.0000, 0, 0);

-- 3. Lotes: el código es único DENTRO de la finca, no globalmente
insert into campo_lotes (finca_codigo, codigo, nombre, cultivo, hectareas, lat, lng)
values ('XXX','L1','<Nombre del lote>','CAF', 0.0, 0.0000, 0.0000);

-- 4. Parcelas
insert into campo_parcelas (lote_id, codigo, nombre, lat, lng)
select l.id, 'P1', '<Nombre>', 0.0000, 0.0000
from campo_lotes l where l.finca_codigo='XXX' and l.codigo='L1';

-- 5. Operarios: nodo ↔ persona. LO MÁS IMPORTANTE.
insert into campo_operarios (node_num, node_id, nombre, tipo, finca_codigo, tarifa_kg)
values (0000000000,'!xxxxxxxx','<Nombre>','persona','XXX', 900);
```

### Reglas que no puedes romper

- **El número de nodo debe ser el real.** Si no coincide, el gateway responde
  *"sin operario registrado"* y esa persona no puede capturar nada.
- **Cada operario pertenece a una finca.** Por eso en la trama basta con `L1`:
  el gateway resuelve la finca desde el operario. Un operario sin finca no
  funciona.
- **Los códigos de lote son únicos por finca**, no globales. Dos fincas pueden
  tener su `L1` cada una, y así es como debe ser.
- Una cámara de conteo se registra como operario con `tipo='dispositivo'` y sin
  tarifa.

Después de sembrar, el gateway recoge el catálogo solo en 5 minutos, o al
instante si reinicias el servicio. La app lo pide con `@agcat`.

---

## 6. La app

Un único cambio de código por cliente: el **nodo del gateway** por defecto en
`lib/services/meshtastic_service.dart`:

```dart
static const int defaultGatewayNodeId = 0x40883c41; // el Central del cliente
```

Actualiza también los textos de ejemplo en `lib/screens/settings_screen.dart`.
Después:

```bash
flutter build apk --release
```

> **Los teléfonos que ya tenían la app conservan el nodo del gateway en sus
> preferencias.** El valor por defecto solo aplica a instalaciones limpias. En
> una actualización hay que cambiarlo a mano en Ajustes, o reinstalar.

Si el cliente quiere su marca, toca `pubspec.yaml` (nombre), el icono en
`android/app/src/main/res/` y el título en `lib/main.dart`.

---

## 7. Lista de verificación de entrega

- [ ] Los nodos se ven entre sí en la malla (`meshtastic --nodes` desde el Central)
- [ ] `/dev/ttyACM0` presente y estable **10 minutos seguidos**
- [ ] Servicio `enabled` (arranca solo al encender) y `active`
- [ ] La Pi resuelve dominios: `getent hosts api.anthropic.com`
- [ ] `campo_capturas` está en la publicación de Realtime
- [ ] Catálogo cargado: el log dice cuántas fincas, lotes, parcelas y operarios
- [ ] La app descarga el catálogo por `@agcat` **por radio real**
- [ ] Una captura llega a Supabase **y** a Airtable
- [ ] El panel `/campo` se actualiza **solo**, sin recargar la página
- [ ] El simulador muestra números coherentes con las tarifas del cliente
- [ ] Prueba de cola: apaga la radio, captura, enciéndela → el dato sale solo
- [ ] Prueba de reinicio: apaga la Pi, enciéndela, y todo vuelve sin tocar nada

---

## Trampas conocidas

Todas estas nos costaron tiempo de verdad. Léelas antes, no después.

| Trampa | Cómo se manifiesta | Solución |
|---|---|---|
| **Cable USB de solo carga** | No aparece `/dev/ttyACM*`, sin ningún error | Cable **de datos**, asentado firme. El conector del Wio Tracker es flojo; prueba otro puerto |
| **Radio conectada después de arrancar** | El gateway arranca pero nunca toma la radio | `sudo systemctl restart mesh-portatil-gateway` |
| **Tailscale se apodera del DNS** | Ping por IP funciona, pero nada resuelve por nombre | `sudo tailscale set --accept-dns=false`. Pasa cuando Tailscale hereda un `resolv.conf` vacío y se queda sin resolvedor upstream |
| **Falta Realtime** | Todo funciona pero el panel no se actualiza solo | `alter publication supabase_realtime add table campo_capturas;` |
| **Escuchar `*` en Realtime** | La página se recarga en bucle | Suscríbete solo a `INSERT`: el espejo de Airtable hace `PATCH` a cada fila |
| **Nodo sin operario** | *"sin operario registrado"* | Registra el nodo en `campo_operarios`, o usa otro nodo |
| **Gateway sin internet en el sitio** | Todo bien en la oficina, el panel no se actualiza en campo | La unidad lleva pantalla y teclado: conéctate a la red del sitio allí mismo (queda guardada). Si usas hotspot celular, ponlo en **2,4 GHz** — la Pi no ve 6 GHz. Comprueba con `getent hosts api.anthropic.com` |
| **Colores de gráficos a ojo** | Un daltónico no distingue dos series | Revalida la paleta con el verificador; ver la nota en `webapp/lib/campoTypes.ts` |
| **Datos de demo mezclados** | La próxima demo enseña cifras falsas | Bórralos al terminar desde `/campo/analisis` |

---

## Lo que todavía no está hecho

Sé honesto con el cliente sobre esto; ninguno es difícil, pero ninguno está.

- **Aislamiento entre clientes** en una sola base (ver el aviso del principio).
- **Catálogo editable desde la webapp**: hoy se siembra con SQL.
- **Alta de operarios desde la interfaz**: hoy es SQL.
- **Conteo por cámara real**: la arquitectura está lista y el nodo se registra
  como dispositivo, pero la inferencia no está implementada.
- **Histórico más allá de lo que cabe en pantalla**: el panel carga las últimas
  capturas, sin paginación ni exportación.
