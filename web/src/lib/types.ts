export type Turno = "almuerzo" | "cena";

// admin: administra mesas/plano y cuentas de login, y ve los reportes.
// staff: carga reservas, lista de espera, y ve el plano en modo lectura.
export type Rol = "admin" | "staff";

// Un salón del restaurante (Restaurant, Bar, Aqua Bar, etc): una sección con
// sus propias mesas, plano y reservas independientes. Ver el selector en
// SalonSelector.tsx y la administración en /admin/salones.
export interface Salon {
  id: number;
  nombre: string;
  orden: number;
}

// después
export interface Mesa {
  id: number;
  codigo: string;
  capacidad: number;
  mesaPadreId: number | null;
  orden: number;
  posX: number | null;
  posY: number | null;
  salonId: number;
  // true = mesa hija temporal creada por una división "por turno" (ver
  // MesasPanel.tsx). false = mesa estructural del plano permanente, la
  // que se administra desde /admin/mesas.
  esTemporal: boolean;
}

export interface Meta {
  mesas: Mesa[];
  // Lista completa de salones (no depende del que esté elegido en
  // pantalla): alimenta el selector de salón en todas las pantallas.
  salones: Salon[];
}

export interface Reserva {
  id: number;
  fecha: string;
  turno: Turno;
  orden: number;
  hora: string | null;
  mesaIds: number[];
  mesaCodigos: string[];
  pax: number | null;
  nombre: string | null;
  habTel: string | null;
  comentarios: string | null;
  asistio: boolean;
  pidioMesa: boolean;
  updatedAt: string;
}

// Una entrada en la lista de espera (gente sin reserva, esperando mesa).
// Orden = orden de llegada: la app siempre la muestra ordenada por este
// campo, así que el primero en llegar aparece primero.
export interface Espera {
  id: number;
  fecha: string;
  turno: Turno;
  orden: number;
  nombre: string | null;
  habTel: string | null;
  pax: number | null;
  // Se tilda cuando ya se la sentó en una mesa: sigue en la lista (no se
  // pierde el dato de que esperó), pero se muestra distinto porque ya no
  // está esperando.
  ubicada: boolean;
  createdAt: string;
}

export interface TurnoData {
  fecha: string;
  turno: Turno;
  // A qué salón pertenece este turno (ver Salon arriba): cada salón tiene su
  // propia lista de reservas/mesas ocupadas independiente.
  salonId: number;
  reservas: Reserva[];
  totalPax: number;
  totalAsistio: number;
  mesasOcupadas: number[];
  // Subconjunto de mesasOcupadas cuya reserva tiene "Pidió mesa" tildado:
  // se resaltan distinto en el panel de mesas (referencia visual de que esa
  // mesa fue pedida puntualmente, para no reasignarla por error).
  mesasPedidas: number[];
  // Mesas marcadas como ocupadas por un walk-in (ver toggleWalkIn en api.ts):
  // a propósito NUNCA se solapa con mesasOcupadas ni genera una fila en
  // `reservas` — un walk-in no es una reserva, solo pinta la mesa de otro
  // color en el panel.
  mesasWalkIn: number[];
  // Si este turno esta cerrado para este salon: no se pueden cargar
  // reservas nuevas ni editar las existentes hasta reabrirlo (ver
  // ShiftSection.tsx). motivoCierre es el texto opcional cargado al cerrarlo.
  // después
  estaCerrado: boolean;
  motivoCierre: string | null;
  // Mesas que ve ESTE turno puntual: si hubo una división por turno, acá
  // aparecen las dos mitades temporales en vez de la mesa base entera.
  // Reemplaza a la lista global de Meta.mesas para pintar el panel
  // "Mesas disponibles" (ver MesasPanel.tsx / page.tsx).
  mesas: Mesa[];
}

// Elemento de referencia del plano visual (no es una mesa): un cartel de
// texto libre para marcar cosas como "Cocina", "Ventana", "Bodega", "Isla",
// "Mueble", etc. Se arrastra y redimensiona igual que una mesa.
export interface ElementoPlano {
  id: number;
  etiqueta: string;
  posX: number;
  posY: number;
  ancho: number;
  alto: number;
  // A qué salón pertenece este cartel (ver Salon arriba): el plano de cada
  // salón tiene sus propios carteles de referencia.
  salonId: number;
}

export interface Dia {
  fecha: string;
  almuerzo: TurnoData;
  cena: TurnoData;
}

export interface LoginResponse {
  token: string;
  usuarioId: number;
  nombre: string;
  rol: Rol;
  debeCambiarPassword: boolean;
}

// Cuenta de login (solo la administra un Admin, /admin/usuarios): quién
// puede entrar a la app y con qué rol.
export interface UsuarioCuenta {
  id: number;
  nombre: string;
  username: string;
  rol: Rol;
  activo: boolean;
  orden: number;
}

export interface ReporteDia {
  fecha: string;
  turno: Turno;
  cantidadReservas: number;
  totalPax: number;
  totalAsistio: number;
  porcentajeAsistencia: number;
}

export interface ReporteMensual {
  anio: number;
  mes: number;
  totalReservas: number;
  totalPax: number;
  totalAsistio: number;
  porcentajeAsistencia: number;
  porDiaYTurno: ReporteDia[];
}
