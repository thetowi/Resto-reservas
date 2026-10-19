import type { Rol } from "./types";

const TOKEN_KEY = "barrancas_token";
const NOMBRE_KEY = "barrancas_nombre";
const ROL_KEY = "barrancas_rol";
// «Recordarme» (ver api/Services/SesionService.cs): la llave con la que este
// dispositivo pide tokens nuevos sin volver a escribir la contraseña, y el
// número de su sesión (para marcar «Este dispositivo»).
const LLAVE_KEY = "barrancas_llave";
const SESION_KEY = "barrancas_sesion";

function leer(clave: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return leer(TOKEN_KEY);
}

export function getNombre(): string | null {
  return leer(NOMBRE_KEY);
}

export function getRol(): Rol | null {
  return leer(ROL_KEY) as Rol | null;
}

export function getLlave(): string | null {
  return leer(LLAVE_KEY);
}

export function getSesionId(): number | null {
  const v = Number(leer(SESION_KEY));
  return Number.isInteger(v) && v > 0 ? v : null;
}

export function esAdmin(): boolean {
  return getRol() === "admin";
}

// Al entrar: sin «Recordarme» (llave null) se borra la llave que hubiera de antes.
export function setSesion(token: string, nombre: string, rol: Rol, llave: string | null = null, sesionId: number | null = null) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(NOMBRE_KEY, nombre);
  window.localStorage.setItem(ROL_KEY, rol);
  if (llave) {
    window.localStorage.setItem(LLAVE_KEY, llave);
    window.localStorage.setItem(SESION_KEY, String(sesionId ?? ""));
  } else {
    window.localStorage.removeItem(LLAVE_KEY);
    window.localStorage.removeItem(SESION_KEY);
  }
}

// Token renovado con la llave: no toca la llave.
export function setToken(token: string, nombre: string, rol: Rol) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(NOMBRE_KEY, nombre);
  window.localStorage.setItem(ROL_KEY, rol);
}

export function cerrarSesion() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(NOMBRE_KEY);
  window.localStorage.removeItem(ROL_KEY);
  window.localStorage.removeItem(LLAVE_KEY);
  window.localStorage.removeItem(SESION_KEY);
}

export function haySesion(): boolean {
  return !!getToken();
}

// Nombre de este dispositivo para «Mis dispositivos»: navegador + sistema, y
// «(app)» si se abrió desde el ícono de la pantalla de inicio.
export function nombreDispositivo(): string {
  if (typeof navigator === "undefined") return "Dispositivo";
  const ua = navigator.userAgent;
  const so = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  const nav = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /Firefox|FxiOS/.test(ua)
        ? "Firefox"
        : /Chrome|CriOS/.test(ua)
          ? "Chrome"
          : /Safari/.test(ua)
            ? "Safari"
            : "Navegador";
  const app = esAppInstalada() ? " (app)" : "";
  return so ? `${nav} en ${so}${app}` : `${nav}${app}`;
}

export function esAppInstalada(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
}
