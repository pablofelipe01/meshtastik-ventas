# meshtastik-ventas

App **Mesh Chat** + **gateway** sobre red Meshtastic (LoRa): chat entre nodos y
consultas a Claude por radio, **sin necesidad de internet/celular en el teléfono**.
El único nodo con internet es el gateway (una Raspberry Pi).

```
App Flutter ──BLE──► Nodo mesh ──LoRa──► Nodo gateway ──USB──► Gateway Pi ──WiFi──► Claude
```

También incluye un **puente mesh↔internet**: alguien en campo (sin internet) chatea
con su familia por medio del gateway y una **PWA** (Next.js + Supabase + Google
Maps) en producción: **https://meshtastik-ventas.vercel.app** (código en
[`webapp/`](webapp/)). La familia ve los nodos en un mapa por GPS y les escribe;
los mensajes viajan por internet al gateway y por la mesh al nodo, y viceversa.

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

📖 **Documentación completa de la app:** [`docs/APP.md`](docs/APP.md) — pestañas,
estructura del código, permisos, ícono, primer uso y solución de problemas.

### Gateway (`gateway/`)
Servicio Python que corre en la Pi. Escucha la mesh, registra el chat y, cuando
detecta `@claude`, consulta a la API de Anthropic (con búsqueda web + memoria de
conversación) y responde por DM.

```bash
cd gateway
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # rellena ANTHROPIC_API_KEY
python gateway.py --simulate   # prueba sin radio
```

📖 **Documentación completa del gateway:** [`gateway/README.md`](gateway/README.md) —
protocolo `@claude`, búsqueda web, memoria, variables `.env` y despliegue systemd.

## Seguridad
`gateway/.env` (con la API key) está en `.gitignore` y **no se commitea**. Los
`.apk` tampoco (se regeneran).

## Arquitectura
Ver `ESQUELETO_APP_MESH_GATEWAY.md` para el patrón completo.
