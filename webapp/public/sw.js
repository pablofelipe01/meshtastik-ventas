// Service worker mínimo: habilita la instalación de la PWA.
// No cachea datos (los mensajes/nodos siempre se piden en vivo a Supabase).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
// Passthrough: dejamos que el navegador maneje las peticiones normalmente.
self.addEventListener("fetch", () => {});
