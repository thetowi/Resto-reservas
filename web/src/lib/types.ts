// "merienda" es un turno intermedio (16:00 a 18:00, cada 30 min) pensado
// para el lobby bar: solo aparece como opción elegible en los salones que
// lo tienen habilitado (ver Salon.permiteMerienda más abajo).
export type Turno = "almuerzo" | "cena" | "merienda";

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
  // Si este salón ofrece el turno Merienda (ver el comentario de Turno más
  // arriba) — pensado para el lobby bar, no para el salón principal.
  permiteMerienda: boolean;
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
  // Forma visual en el mapa del salón (ver PlanoSalon.tsx): se elige a mano
  // por mesa, no depende de la capacidad. Una mesa cuadrada de 4 pax se
  // dibuja como dos cuadrados de 2 pax pegados (así son las mesas reales del
  // salón), el resto de las cuadradas y todas las redondas se dibujan como
  // una sola forma.
  forma: "redonda" | "cuadrada";
  // Si está "fijada" en el mapa del salón (ver PlanoSalon.tsx): bloquea el
  // arrastre, para que no se mueva por un click accidental en medio del
  // servicio. Se activa/desactiva desde el mismo selector donde se elige
  // la forma.
  fijada: boolean;
  // Rotación del dibujo de la mesa (mesa + sillitas) en el plano visual, en
  // grados absolutos: 0/90/180/270 (ver PlanoSalon.tsx, botón "Rotar" en el
  // mismo selector donde se elige forma/fijada). No afecta el ancho/alto ni
  // el "hitbox" de arrastre de la mesa, solo cómo se ve dibujada — útil para
  // acomodarla visualmente contra una pared o en un rincón.
  rotacion: number;
  // Solo viene seteado (no null) cuando esta mesa tiene un renombre por
  // turno activo (ver renombrarMesaPorTurno en api.ts): ahí codigo ya es el
  // número nuevo a mostrar, y codigoOriginal guarda el número real de
  // /admin/mesas, para poder ofrecer "volver a llamarla codigoOriginal".
  codigoOriginal: string | null;
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
  // Se tildó cuando la reserva ya vino, comió y se fue (ver ReservaRow.tsx,
  // checkbox "Se fue"): a partir de ahí sus mesas (mesaIds/mesaCodigos, acá
  // arriba) dejan de contar como ocupadas para el panel de mesas y el plano
  // — quedan libres para un walk-in u otra reserva — pero NO se borran de
  // la fila: siguen mostrando en qué mesa(s) estuvo sentada esta reserva
  // (historial), solo que atenuadas. Independiente de "asistio": no se
  // auto-tildan ni destildan entre sí.
  retirada: boolean;
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
  // null para los salones que no ofrecen Merienda (ver Salon.permiteMerienda):
  // el backend ni siquiera calcula ese turno para ellos.
  merienda: TurnoData | null;
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
