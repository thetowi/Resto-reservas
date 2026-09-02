import { getToken, cerrarSesion } from "./auth";
import type {
  Dia,
  ElementoPlano,
  Espera,
  LoginResponse,
  Mesa,
  Meta,
  ReporteMensual,
  Salon,
  Turno,
  TurnoData,
  UsuarioCuenta,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5238";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    cerrarSesion();
    // Redireccion "dura" a proposito: este modulo no es un componente y no
    // tiene acceso al router de Next; forzamos una recarga completa a
    // /login para garantizar que no quede ningun estado viejo en memoria.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, "Sesión expirada");
  }

  if (!res.ok) {
    let mensaje = `Error ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) mensaje = body.error;
    } catch {
      // el body no era JSON, nos quedamos con el mensaje generico
    }
    throw new ApiError(res.status, mensaje);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function login(username: string, password: string) {
  return request<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function cambiarPassword(passwordActual: string, passwordNueva: string) {
  return request<void>("/api/auth/cambiar-password", {
    method: "POST",
    body: JSON.stringify({ passwordActual, passwordNueva }),
  });
}

export function getMeta() {
  return request<Meta>("/api/meta");
}

export function getDia(fecha: string, salonId: number) {
  return request<Dia>(`/api/dias/${fecha}?salonId=${salonId}`);
}

export function crearReserva(fecha: string, turno: Turno, salonId: number, hora?: string) {
  return request<TurnoData>("/api/reservas", {
    method: "POST",
    body: JSON.stringify({ fecha, turno, salonId, hora: hora ?? null }),
  });
}
export type ActualizarReservaPayload = Partial<{
  hora: string;
  // Reemplaza el conjunto completo de mesas de la reserva. [] = "sin mesas".
  mesaIds: number[];
  pax: number | null;
  nombre: string;
  habTel: string;
  comentarios: string;
  asistio: boolean;
  pidioMesa: boolean;
}>;

export function patchReserva(id: number, payload: ActualizarReservaPayload) {
  return request<TurnoData>(`/api/reservas/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function borrarReserva(id: number) {
  return request<TurnoData>(`/api/reservas/${id}`, { method: "DELETE" });
}

// Togglea la marca de walk-in de una mesa desde el panel de mesas
// disponibles: si estaba libre la marca ocupada (sin crear ninguna fila de
// reserva); si ya estaba marcada, la libera. Ver MesasPanel.tsx.
export function toggleWalkIn(fecha: string, turno: Turno, mesaId: number) {
  return request<TurnoData>("/api/walkin/toggle", {
    method: "POST",
    body: JSON.stringify({ fecha, turno, mesaId }),
  });
}
// Cierra o reabre un turno puntual (fecha+turno+salon) para que no se
// tomen reservas nuevas — ver ShiftSection.tsx. Mismo patron toggle que
// toggleWalkIn: si no estaba cerrado, lo cierra (con el motivo, si vino);
// si ya estaba cerrado, lo reabre (el motivo se ignora en ese caso).
export function toggleCierre(fecha: string, turno: Turno, salonId: number, motivo?: string) {
  return request<TurnoData>("/api/cierres/toggle", {
    method: "POST",
    body: JSON.stringify({ fecha, turno, salonId, motivo: motivo ?? null }),
  });
}

// --- Administracion de mesas (/admin/mesas) ---

export function crearMesa(codigo: string, capacidad: number, salonId: number) {
  return request<Mesa[]>("/api/mesas", {
    method: "POST",
    body: JSON.stringify({ codigo, capacidad, salonId }),
  });
}

export function dividirMesa(mesaId: number, codigo: string, capacidad: number) {
  return request<Mesa[]>(`/api/mesas/${mesaId}/dividir`, {
    method: "POST",
    body: JSON.stringify({ codigo, capacidad }),
  });
}

// División rápida desde "Mesas disponibles" (ver MesasPanel.tsx): parte la
// mesa entera en dos mitades nuevas ("11a"/"11b"), sin pedir código ni
// capacidad — a diferencia de dividirMesa/admin/mesas, esta la puede usar
// cualquier rol (Admin o Staff), para no depender de que haya un Admin
// disponible durante el servicio.
export function dividirMesaRapido(mesaId: number) {
  return request<Mesa[]>(`/api/mesas/${mesaId}/dividir-en-dos`, { method: "POST" });
  
}


// División temporal desde "Mesas disponibles" (ver MesasPanel.tsx): a
// diferencia de dividirMesa/dividirMesaRapido (permanentes, definen el
// default del salón), esta división vale solo para fecha+turno — pide
// cuántos pax van a cada mitad.
export function dividirMesaPorTurno(fecha: string, turno: Turno, mesaId: number, paxA: number, paxB: number) {
  return request<void>(`/api/mesas/${mesaId}/dividir-turno`, {
    method: "POST",
    body: JSON.stringify({ fecha, turno, paxA, paxB }),
  });
}

// Deshace una división temporal (ver dividirMesaPorTurno): se pide con el
// Id de la mesa BASE, no de ninguna de las dos mitades.
export function unirMesaPorTurno(fecha: string, turno: Turno, mesaBaseId: number) {
  return request<void>(`/api/mesas/${mesaBaseId}/unir-turno`, {
    method: "POST",
    body: JSON.stringify({ fecha, turno }),
  });
}

export function patchMesa(
  mesaId: number,
  payload: Partial<{ codigo: string; capacidad: number; posX: number; posY: number }>,
) {
  return request<Mesa[]>(`/api/mesas/${mesaId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function borrarMesa(mesaId: number) {
  return request<Mesa[]>(`/api/mesas/${mesaId}`, { method: "DELETE" });
}

// --- Lista de espera ---

export function getEspera(fecha: string, turno: Turno, salonId: number) {
  return request<Espera[]>(`/api/espera/${fecha}/${turno}?salonId=${salonId}`);
}

export function crearEspera(
  fecha: string,
  turno: Turno,
  salonId: number,
  datos: { nombre?: string; habTel?: string; pax?: number },
) {
  return request<Espera[]>("/api/espera", {
    method: "POST",
    body: JSON.stringify({ fecha, turno, salonId, ...datos }),
  });
}

export function patchEspera(
  id: number,
  payload: Partial<{ nombre: string; habTel: string; pax: number | null; ubicada: boolean }>,
) {
  return request<Espera[]>(`/api/espera/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function borrarEspera(id: number) {
  return request<Espera[]>(`/api/espera/${id}`, { method: "DELETE" });
}

// --- Elementos de referencia del plano (ventana, cocina, bodega, etc.) ---

export function getElementosPlano() {
  return request<ElementoPlano[]>("/api/elementos-plano");
}

export function crearElementoPlano(etiqueta: string, posX: number, posY: number, salonId: number) {
  return request<ElementoPlano[]>("/api/elementos-plano", {
    method: "POST",
    body: JSON.stringify({ etiqueta, posX, posY, salonId }),
  });
}

export function patchElementoPlano(
  id: number,
  payload: Partial<{ etiqueta: string; posX: number; posY: number; ancho: number; alto: number }>,
) {
  return request<ElementoPlano[]>(`/api/elementos-plano/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function borrarElementoPlano(id: number) {
  return request<ElementoPlano[]>(`/api/elementos-plano/${id}`, { method: "DELETE" });
}

// --- Administracion de cuentas de login (/admin/usuarios, solo Admin) ---

export function getUsuarios() {
  return request<UsuarioCuenta[]>("/api/usuarios");
}

export function crearUsuario(nombre: string, username: string, password: string, rol: "admin" | "staff") {
  return request<UsuarioCuenta[]>("/api/usuarios", {
    method: "POST",
    body: JSON.stringify({ nombre, username, password, rol }),
  });
}

export function patchUsuario(
  id: number,
  payload: Partial<{ nombre: string; rol: "admin" | "staff"; activo: boolean; password: string }>,
) {
  return request<UsuarioCuenta[]>(`/api/usuarios/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// --- Reporte mensual de asistencia (/reportes, solo Admin) ---

// salonId es opcional: sin el, el reporte combina todos los salones; con el,
// se limita a uno solo (ver el selector de /reportes).
export function getReporteMensual(anio: number, mes: number, salonId?: number) {
  const query = salonId !== undefined ? `&salonId=${salonId}` : "";
  return request<ReporteMensual>(`/api/reportes/mensual?anio=${anio}&mes=${mes}${query}`);
}

// --- Salones (/admin/salones, solo Admin para crear/editar/borrar) ---

export function getSalones() {
  return request<Salon[]>("/api/salones");
}

export function crearSalon(nombre: string) {
  return request<Salon[]>("/api/salones", {
    method: "POST",
    body: JSON.stringify({ nombre }),
  });
}

export function patchSalon(id: number, payload: Partial<{ nombre: string; orden: number }>) {
  return request<Salon[]>(`/api/salones/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function borrarSalon(id: number) {
  return request<Salon[]>(`/api/salones/${id}`, { method: "DELETE" });
}

export { API_URL };
