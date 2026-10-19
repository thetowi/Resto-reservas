// Service worker de capax: solo para los avisos de reservas web (ver
// src/lib/push.ts y api/Services/PushService.cs). No guarda nada en caché
// ni intercepta pedidos: la app funciona igual que sin él.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = { body: event.data ? event.data.text() : "" };
  }
  const titulo = datos.title || "capax";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: datos.body || "",
      tag: datos.tag || undefined,
      renotify: !!datos.tag,
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      data: { url: datos.url || "/" },
    }),
  );
});

// Tocar el aviso: si capax ya está abierto se lo trae al frente y se lo
// lleva a la pantalla del aviso; si no, se abre ahí.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const abierta = ventanas.find((c) => new URL(c.url).origin === self.location.origin);
      if (abierta) {
        await abierta.focus();
        abierta.postMessage({ tipo: "capax:abrir", url: destino });
        return;
      }
      await self.clients.openWindow(destino);
    })(),
  );
});
