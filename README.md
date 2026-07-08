# meshtastik-ventas

App **Mesh Chat** + **gateway** sobre red Meshtastic (LoRa): chat entre nodos y
consultas a Claude por radio, **sin necesidad de internet/celular en el teléfono**.
El único nodo con internet es el gateway (una Raspberry Pi).

```
App Flutter ──BLE──► Nodo mesh ──LoRa──► Nodo gateway ──USB──► Gateway Pi ──WiFi──► Claude
```

## Componentes

### App Flutter (`lib/`, `packages/`)
Cliente de chat Meshtastic con 3 pestañas:
- **Claude** — escribe normal; la app envía `@claude <texto>` como DM al gateway
  y muestra la respuesta (reensamblando los fragmentos que la mesh parte).
- **Chat** — chat entre nodos: canal Primary + DMs a cualquier nodo.
- **Ajustes** — nodo BLE, estado de conexión, nodo del gateway, reset.

Reusa el paquete local `packages/meshtastic_flutter` (BLE + protobuf).

Compilar APK:
```bash
flutter pub get
flutter build apk --release
```

### Gateway (`gateway/`)
Servicio Python que corre en la Pi. Escucha la mesh, registra el chat y, cuando
detecta `@claude`, consulta a la API de Anthropic y responde por DM.

```bash
cd gateway
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # rellena ANTHROPIC_API_KEY
python gateway.py --simulate   # prueba sin radio
```

Despliegue como servicio systemd: ver `gateway/mesh-portatil-gateway.service`.

## Seguridad
`gateway/.env` (con la API key) está en `.gitignore` y **no se commitea**. Los
`.apk` tampoco (se regeneran).

## Arquitectura
Ver `ESQUELETO_APP_MESH_GATEWAY.md` para el patrón completo.
