# Próximos pasos

Estado a la fecha: **MVP funcionando en producción y probado en campo.**

## ✅ Qué hay hoy (MVP)

- **Gateway** (Raspberry Pi portátil) con:
  - `@claude` por radio (Sonnet 4.6 + búsqueda web + memoria por nodo).
  - **Puente familia↔campo** vía Supabase, **mensajería dirigida persona↔persona**
    (`@contactos`, `@fam|id|texto`, entrega `FAM|id|nombre|texto`).
  - **Cola local (outbox)** persistente: ningún mensaje del campo se pierde si el
    internet se cae; se reintenta hasta escribirlo en Supabase.
  - Autoconexión al hotspot del celular + apagado por SSH (unidad portátil).
- **App Flutter "Mesh Chat" v4** (Claude · Familia · Chat · Ajustes): pestaña
  Familia con lista de contactos y chat dirigido por persona.
- **PWA "Mesh Familia"** en Vercel con **login (Supabase Auth)**: cada familiar
  ve solo sus nodos y mensajes (RLS). Mapa GPS + chat en tiempo real.
- Seguridad: RLS por usuario, sin acceso anónimo.

---

## 🔜 Próximos pasos

### 1. Email

> _(Por detallar.)_

Ideas / opciones a decidir cuando lo abordemos:
- **Notificaciones por email a la familia** cuando llega un mensaje del campo
  (para no depender de tener la PWA abierta — útil en emergencias). Se puede
  disparar con una Supabase Edge Function + un proveedor de email (Resend,
  Postmark, SendGrid) al insertarse un `from_field`.
- **Recuperación/cambio de clave por email** para los usuarios de la PWA.
- **Alta de familiares por invitación por email** (en vez de crear el usuario a
  mano en el dashboard).

### 2. Tablas de Airtable

> _(Pablo lo explica en su momento — placeholder para no olvidarlo.)_

Pendiente de definir qué datos van en Airtable y cómo se integran con el gateway
o con Supabase (posible sincronización, catálogos, o backend alterno para ciertos
flujos). El gateway ya soporta el patrón Airtable (ver `ESQUELETO_APP_MESH_GATEWAY.md`).

---

## 💡 Otras mejoras posibles (backlog, sin prioridad)

- **Notificaciones push** en la PWA (además de email) para avisos en tiempo real.
- **Estado "entregado" real** (ACK de la mesh) en los mensajes `to_field`.
- **Persistir la memoria de `@claude`** en disco/Supabase (hoy vive en RAM).
- **Afinar timeouts del gateway** para menos ruido en logs sobre conexiones
  flojas del celular.
- **Panel de administración** en la PWA para crear contactos y asignarlos a
  nodos (hoy se hace directo en Supabase).
- **Versionado de APKs** con script (`scripts/release_apk.sh`).
