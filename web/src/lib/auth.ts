import type { Rol } from "./types";

const TOKEN_KEY = "barrancas_token";
const NOMBRE_KEY = "barrancas_nombre";
const ROL_KEY = "barrancas_rol";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getNombre(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(NOMBRE_KEY);
}

export function getRol(): Rol | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ROL_KEY) as Rol | null;
}

export function esAdmin(): boolean {
  return getRol() === "admin";
}

export function setSesion(token: string, nombre: string, rol: Rol) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(NOMBRE_KEY, nombre);
  window.localStorage.setItem(ROL_KEY, rol);
}

export function cerrarSesion() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(NOMBRE_KEY);
  window.localStorage.removeItem(ROL_KEY);
}

export function haySesion(): boolean {
  return !!getToken();
}
