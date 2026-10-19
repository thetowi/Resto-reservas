"use client";

import { bajaPush, getClavePush, suscribirPush } from "./api";
import { esAppInstalada, nombreDispositivo } from "./auth";

// Avisos de reservas web en este dispositivo (notificaciones push del
// navegador, mockup capax-avisos-y-recordarme). El service worker
// (public/sw.js) recibe el aviso aunque capax esté cerrado y al tocarlo abre
// la pantalla que corresponde. En iPhone/iPad solo anda con capax agregado a
// la pantalla de inicio y abierto desde ese ícono.

export type EstadoAvisos = "cargando" | "no-soportado" | "ios-instalar" | "bloqueado" | "apagado" | "prendido";

export function esIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function soportaPush(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

async function suscripcionActual(): Promise<PushSubscription | null> {
  if (!soportaPush()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function endpointLocal(): Promise<string | null> {
  try {
    return (await suscripcionActual())?.endpoint ?? null;
  } catch {
    return null;
  }
}

export async function estadoAvisos(): Promise<EstadoAvisos> {
  if (!soportaPush()) return esIOS() && !esAppInstalada() ? "ios-instalar" : "no-soportado";
  if (Notification.permission === "denied") return "bloqueado";
  const sub = await suscripcionActual().catch(() => null);
  return sub && Notification.permission === "granted" ? "prendido" : "apagado";
}

function claveABytes(base64url: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64url.length % 4)) % 4);
  const bin = atob((base64url + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function enviarAlServidor(sub: PushSubscription) {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("Suscripción incompleta");
  await suscribirPush(json.endpoint, json.keys.p256dh, json.keys.auth, nombreDispositivo());
}

// Si el navegador no contesta (sin servicio de avisos, modo ahorro, etc.),
// no se deja el interruptor trabado.
function conTiempo<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    const t = setTimeout(() => rechazar(new Error("El navegador no respondió")), ms);
    promesa.then(
      (v) => {
        clearTimeout(t);
        resolver(v);
      },
      (e) => {
        clearTimeout(t);
        rechazar(e);
      },
    );
  });
}

/** Pide permiso (si hace falta), suscribe este navegador y lo avisa al servidor. */
export async function activarAvisos(): Promise<EstadoAvisos> {
  if (!soportaPush()) return estadoAvisos();
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return permiso === "denied" ? "bloqueado" : "apagado";
  return conTiempo(suscribir(), 20_000);
}

async function suscribir(): Promise<EstadoAvisos> {
  await registrarServiceWorker();
  const reg = await navigator.serviceWorker.ready;
  const { clave } = await getClavePush();
  const opciones = { userVisibleOnly: true, applicationServerKey: claveABytes(clave) };
  let sub = await reg.pushManager.getSubscription();
  try {
    sub ??= await reg.pushManager.subscribe(opciones);
  } catch {
    // Quedó una suscripción con otra clave: se rehace.
    await sub?.unsubscribe();
    sub = await reg.pushManager.subscribe(opciones);
  }
  await enviarAlServidor(sub);
  return "prendido";
}

export async function desactivarAvisos(): Promise<EstadoAvisos> {
  const sub = await suscripcionActual().catch(() => null);
  if (sub) {
    await bajaPush(sub.endpoint);
    await sub.unsubscribe().catch(() => false);
  }
  return estadoAvisos();
}

/**
 * Al abrir capax: si este navegador ya tenía los avisos, se le vuelve a
 * avisar al servidor (por si entró otra persona o cambió la sesión).
 */
export async function sincronizarAvisos() {
  try {
    if (!soportaPush() || Notification.permission !== "granted") return;
    await registrarServiceWorker();
    const sub = await suscripcionActual();
    if (sub) await enviarAlServidor(sub);
  } catch {
    // sin conexión o la API todavía sin los avisos: se reintenta la próxima vez
  }
}

/** Al salir: este navegador deja de recibir avisos (el servidor ya se enteró por /api/auth/salir). */
export async function apagarAvisosLocal() {
  const sub = await suscripcionActual().catch(() => null);
  await sub?.unsubscribe().catch(() => false);
}
