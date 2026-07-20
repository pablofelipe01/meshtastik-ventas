# App Flutter — Mesh Chat

Cliente de chat sobre red **Meshtastic (LoRa)** para Android/iOS. Se conecta por
**Bluetooth (BLE)** al nodo Meshtastic del teléfono y habla con los demás nodos
de la malla. Su función estrella: preguntarle a **Claude** cualquier cosa
escribiendo normal — la app manda la consulta al gateway por radio y muestra la
respuesta, **sin usar internet ni datos del teléfono**.

```
App (este proyecto) ──BLE──► Nodo del teléfono ──LoRa (multi-hop)──► Nodo gateway ──► Pi ──► Claude
```

El proyecto Flutter vive en la **raíz del repo**. El gateway (Python) está en
`gateway/` — ver [`gateway/README.md`](../gateway/README.md).

---

## Las 3 pestañas

### 🤖 Claude
Conversación dedicada con la IA, estilo WhatsApp.
- Escribes tu pregunta **normal**; la app le antepone `@claude ` y la manda como
  **DM al nodo del gateway**.
- Las respuestas del gateway (que llegan por DM, a veces partidas en `[1/2]`,
  `[2/2]`) se **reensamblan** en una sola burbuja y se les quita el prefijo
  `Claude:` para que se lean limpias.
- Muestra el estado de entrega y una barra si estás sin conexión.

### 💬 Chat
Chat entre nodos de la malla.
- Selector de destino: **Canal 0 (Primary)** o **DM** a cualquier nodo visible.
- Burbujas con nombre del remitente, hora, separadores por día, estado de
  entrega (✓/✓✓) y contador de bytes (la mesh limita ~200 bytes por paquete).

### ⚙️ Ajustes
- Estado de la conexión BLE (conectado / conectando / error).
- Nodo BLE conectado y tu Node ID.
- **Nodo del gateway** (editable): el `!hex` al que se mandan los `@claude`.
  Por defecto `!40883c41`.
- Cambiar / olvidar el nodo BLE (vuelve a la pantalla de selección).

---

## Estructura del código

```
├── lib/
│   ├── main.dart                      # arranque, selección de dispositivo BLE, tabs
│   ├── models/
│   │   └── chat_models.dart           # ChatMessage, MeshNode, ChatDestination, enums
│   ├── services/
│   │   ├── meshtastic_service.dart    # ★ núcleo: BLE + envío/recepción + nodos + no-leídos
│   │   └── foreground_connection.dart # servicio en 1er plano (mantiene BLE viva)
│   ├── screens/
│   │   ├── claude_screen.dart         # pestaña Claude (auto-prefijo + reensamblado)
│   │   ├── chat_screen.dart           # pestaña Chat (canales + DMs)
│   │   └── settings_screen.dart       # pestaña Ajustes
│   └── widgets/
│       └── delivery_indicator.dart    # ícono de estado de entrega
├── packages/
│   └── meshtastic_flutter/            # paquete BLE + protobuf de Meshtastic (local)
├── assets/icon/                       # ícono de la app (icon.png, icon_foreground.png)
└── android/ · ios/                    # config nativa
```

- **`meshtastic_service.dart`** (`ChangeNotifier`) es el corazón: escanea y se
  conecta por BLE, mantiene keepalive + auto-reconexión, envía texto
  (`sendChatMessage(text, {channel, destinationId})`), recibe paquetes
  (`_handlePacket` → construye `ChatMessage`, distingue DM de broadcast, procesa
  ACK de entrega), mantiene el catálogo de nodos y el conteo de no-leídos, y
  persiste el dispositivo BLE y el nodo gateway en `shared_preferences`.
- **`packages/meshtastic_flutter`** habla el protocolo BLE real de Meshtastic
  (basado en `flutter_blue_plus` + protobuf). Se reusa tal cual.

---

## Compilar el APK (Android)

Requisitos: Flutter 3.38+ y el SDK de Android.

```bash
flutter pub get
flutter build apk --release
# → build/app/outputs/flutter-apk/app-release.apk  (~47 MB)
```

Para depurar en un teléfono conectado por USB (con depuración USB activada):

```bash
flutter run                 # modo debug con hot-reload
# o instala el release directamente:
flutter install --release
```

> Los `.apk` están en `.gitignore` (se regeneran). Si quieres versionarlos,
> copia el resultado a `versiones/` (ver §Versionado).

### Ícono de la app
El ícono (burbuja de chat + robot, azul) se genera con
[`flutter_launcher_icons`](https://pub.dev/packages/flutter_launcher_icons)
desde `assets/icon/`. Para regenerarlo tras cambiar el arte:

```bash
dart run flutter_launcher_icons
```

La configuración está en `pubspec.yaml` bajo `flutter_launcher_icons`.

---

## Permisos (Android)

Declarados en `android/app/src/main/AndroidManifest.xml`:

- **Bluetooth:** `BLUETOOTH_SCAN` (con `neverForLocation`), `BLUETOOTH_CONNECT`,
  y `BLUETOOTH` / `BLUETOOTH_ADMIN` (compatibilidad).
- **Ubicación:** `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` — Android la
  exige para escanear BLE en versiones antiguas.
- **Servicio en primer plano:** `FOREGROUND_SERVICE_CONNECTED_DEVICE` — mantiene
  la conexión BLE viva con la pantalla apagada (evita que Android suspenda la app
  y mate el Bluetooth). Implementado en `foreground_connection.dart` con
  `flutter_foreground_task`.

La app pide los permisos en tiempo de ejecución en la primera pantalla; si se
niegan, ofrece abrir la configuración del sistema.

---

## Primer uso

1. Enciende el nodo Meshtastic del teléfono y empareja/activa su Bluetooth.
2. Abre **Mesh Chat** → concede los permisos de Bluetooth/ubicación.
3. En **Seleccionar dispositivo**, elige tu nodo BLE. Queda guardado para
   próximos arranques (reconexión automática).
4. Ve a la pestaña **Claude** y escribe una pregunta. Si el gateway está en
   línea, la respuesta llega en segundos.
5. Si tu gateway usa otro nodo, cámbialo en **Ajustes → Nodo del gateway**.

---

## Dependencias clave (`pubspec.yaml`)

| Paquete | Para qué |
| --- | --- |
| `meshtastic_flutter` (local) | Protocolo BLE + protobuf de Meshtastic |
| `shared_preferences` | Persistir nodo BLE guardado y nodo gateway |
| `permission_handler` | Permisos de Bluetooth / ubicación / notificaciones |
| `flutter_foreground_task` | Servicio en 1er plano para mantener BLE viva |
| `flutter_launcher_icons` (dev) | Generar los íconos de launcher |

---

## Versionado

La versión está en `pubspec.yaml` (`version: 2.0.0+2`) y se muestra en Ajustes.
Para publicar una versión nueva: sube el `version`, compila el release, y guarda
el APK con nombre versionado (p. ej. `versiones/Mesh-Chat-v3.apk`).

---

## Problemas comunes

- **No aparece ningún dispositivo al escanear** → verifica que el Bluetooth del
  teléfono esté encendido, que concediste los permisos, y que el nodo esté
  encendido y no emparejado a otra app (Meshtastic oficial) al mismo tiempo.
- **Claude no responde** → confirma en Ajustes que el **nodo del gateway** es el
  correcto, que hay ruta de malla al gateway, y que el servicio del gateway está
  activo (`gateway/README.md`).
- **Se desconecta con la pantalla apagada** → asegúrate de haber aceptado el
  permiso de notificaciones (Android 13+); el servicio en primer plano necesita
  mostrar su notificación para no ser suspendido.
- **Respuestas de Claude cortadas** → normal si son largas; llegan en varios
  paquetes `[i/n]` y la pestaña Claude los reensambla al recibirlos todos.
