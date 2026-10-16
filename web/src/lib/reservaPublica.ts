// Cliente del link publico de reservas (/api/publico, sin login — ver
// ReservasPublicasController en la API). Va aparte de lib/api.ts a proposito:
// esos pedidos mandan el token del staff y ante un 401 redirigen a /login,
// cosas que no tienen sentido para un cliente final.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5238";

export type TurnoPublico = "almuerzo" | "merienda" | "cena";
export type EstadoDia = "ok" | "pocos" | "lleno" | "bloqueado";
export type EstadoHorario = "disponible" | "pocas" | "sin_lugar";

export interface SalonPublico {
  id: number;
  nombre: string;
  permiteMerienda: boolean;
  // Si una reserva de menos de limitePaxConfirmaSola personas se confirma al
  // instante en este salon (si no, queda como solicitud).
  confirmaSola: boolean;
}

export interface ConfigPublica {
  salones: SalonPublico[];
  horarios: Record<TurnoPublico, string[]>;
  limitePaxConfirmaSola: number;
  paxMaximo: number;
  diasAdelante: number;
  hoy: string;
}

export interface DiaPublico {
  fecha: string;
  estado: EstadoDia;
  // Solo en "bloqueado" (fecha sin reservas web, ej. Nochebuena): titulo y
  // mensaje que cargo el restaurante, para el aviso con el boton de WhatsApp.
  motivo?: string | null;
  mensaje?: string | null;
}

export interface HorarioPublico {
  hora: string;
  estado: EstadoHorario;
}

export interface TurnoDisponible {
  turno: TurnoPublico;
  cerrado: boolean;
  horarios: HorarioPublico[];
  // Turno cerrado para la web por una fecha especial: se reserva por WhatsApp.
  porWhatsApp?: boolean;
}

export interface SalonDisponible {
  salonId: number;
  hayLugar: boolean;
  turnos: TurnoDisponible[];
}

export interface DisponibilidadPublica {
  fecha: string;
  bloqueada: boolean;
  salones: SalonDisponible[];
  motivo?: string | null;
  mensaje?: string | null;
}

export interface PedidoReserva {
  fecha: string;
  salonId: number;
  turno: TurnoPublico;
  hora: string;
  pax: number;
  nombre: string;
  telefono: string;
  habitacion: string | null;
  ocasion: string | null;
  comentarios: string | null;
  aceptaPrivacidad: boolean;
  // Campo trampa (honeypot): siempre vacio en el formulario real.
  sitio: string;
}

export interface ReservaCreada {
  estado: "confirmada" | "pendiente";
  codigo: string;
  fecha: string;
  hora: string;
  turno: TurnoPublico;
  salon: string;
  pax: number;
}

export class ErrorReserva extends Error {
  status: number;
  constructor(status: number, mensaje: string) {
    super(mensaje);
    this.status = status;
  }
}

async function pedir<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/publico${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ErrorReserva(0, "No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.");
  }
  if (res.status === 429) {
    throw new ErrorReserva(429, "Hiciste muchos intentos seguidos. Esperá un rato y volvé a probar.");
  }
  if (!res.ok) {
    let mensaje = "Algo salió mal. Intentá de nuevo en un momento.";
    try {
      const body = await res.json();
      if (body?.error) mensaje = body.error;
    } catch {
      // sin cuerpo JSON: queda el mensaje generico
    }
    throw new ErrorReserva(res.status, mensaje);
  }
  return res.json() as Promise<T>;
}

export const getConfigPublica = () => pedir<ConfigPublica>("/config");

export const getDiasPublicos = (pax: number, cantidad = 14) =>
  pedir<DiaPublico[]>(`/dias?pax=${pax}&cantidad=${cantidad}`);

export const getDisponibilidad = (fecha: string, pax: number) =>
  pedir<DisponibilidadPublica>(`/disponibilidad?fecha=${fecha}&pax=${pax}`);

export const crearReservaPublica = (pedido: PedidoReserva) =>
  pedir<ReservaCreada>("/reservas", { method: "POST", body: JSON.stringify(pedido) });
