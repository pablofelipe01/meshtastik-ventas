# Malla Inverse — composición

## Canal

| | |
|---|---|
| Nombre | **`Inverse`** |
| Índice | 0 (primario) |
| Cifrado | PSK aleatorio **AES256** (32 bytes) — canal privado, **no** el público de Meshtastic |
| Región | US |
| Zona horaria | Colombia · `<-05>5` |

La clave está en **`canal-inverse.url`** (misma carpeta, permisos `600`). Es la
URL del canal: aplicarla a un equipo lo mete a la malla.

```bash
meshtastic --port <puerto> --seturl "$(cat canal-inverse.url)"
```

> ⚠️ Ese archivo **es la llave de la malla**. Quien lo tenga entra. No subirlo a
> ningún repositorio ni compartirlo.

---

## Nodos — 8 en total

| Nodo | Nick | ID | Nº de nodo | Hardware | Tipo |
|---|---|---|---|---|---|
| **Central** | `CTRL` | `!40883c41` | 1082670145 | Seeed **Wio Tracker L1** | 🏠 Fijo |
| Inverse 1 | `Inv1` | `!7c1a5974` | 2082101620 | Seeed T1000-E | 🎒 Móvil |
| Inverse 2 | `Inv2` | `!a8656e83` | 2825219715 | Seeed T1000-E | 🎒 Móvil |
| Inverse 3 | `Inv3` | `!4587bb47` | 1166523207 | Seeed T1000-E | 🎒 Móvil |
| Inverse 4 | `Inv4` | `!8f73e4ed` | 2406737133 | Seeed T1000-E | 🎒 Móvil |
| Inverse 5 | `Inv5` | `!4190dee3` | 1100013283 | Seeed T1000-E | 🎒 Móvil |
| Inverse 6 | `Inv6` | `!455250c3` | 1163022531 | Seeed T1000-E | 🎒 Móvil |
| Inverse 7 | `Inv7` | `!4bf18b6e` | 1274121070 | Seeed T1000-E | 🎒 Móvil |

Los 8 comparten: firmware `2.7.26.54e0d8d`, rol `CLIENT`, GPS habilitado
(`position.gps_mode: 1`), región US, tz Colombia.

**ID hex y nº decimal son el mismo valor** en dos notaciones (`!40883c41` =
1082670145). La CLI y la app muestran el hex; `myNodeNum` muestra el decimal.

El número de nodo **no cambia** aunque se renombre, reflashee o cambie de canal
el equipo. Es la identidad real — el nombre no lo es.

---

## Los dos tipos

### 🎒 Inverse 1–7 · móviles
Los siete T1000-E son las unidades que se mueven: van encima de la persona o el
vehículo, con su propia batería y GPS activo, reportando posición a la malla.
Son intercambiables entre sí — misma configuración y mismo rol; el número solo
sirve para distinguirlos.

### 🏠 Central · fijo, en el gateway
Se conecta **por USB al gateway** (`pi4-meshportatil-show`) y se queda ahí,
alimentado permanentemente. Es el punto por donde la malla llega al mundo: los
Inverse hablan por LoRa con Central, y Central entrega los datos al gateway.

Es **otro hardware** que el resto: un Seeed **Wio Tracker L1**, no un T1000-E.
Eso importa al flashearlo — usa otro firmware y otro método de bootloader
(→ [`flashear-wio-tracker-l1.md`](flashear-wio-tracker-l1.md)).

```
   🎒 Inv1  🎒 Inv2  🎒 Inv3  🎒 Inv4  🎒 Inv5  🎒 Inv6  🎒 Inv7
        \      |      |       |       |      |      /
         \     |      |    LoRa 📡    |      |     /
          \    |      |       |       |      |    /
                    🏠 Central (CTRL)
                           │ USB
                           ▼
                  pi4-meshportatil-show   ← gateway
```

---

## Revisar la malla

Desde Central, que es el nodo siempre encendido:

```bash
meshtastic --port /dev/ttyACM0 --nodes     # en el gateway (Linux)
meshtastic --port /dev/cu.usbmodem1101 --nodes   # en el Mac
```

Deben aparecer los 8. Si falta alguno, **no significa necesariamente que esté
mal**: el anuncio espontáneo (`nodeinfo`) tarda. Para forzarlo, mandar un paquete
desde ese nodo y revisar Central 30 s después:

```bash
meshtastic --port <puerto-del-nodo> --sendtext "prueba"
```
