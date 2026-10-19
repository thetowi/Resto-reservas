const DIAS = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function parseISO(fechaISO: string): Date {
  const [y, m, d] = fechaISO.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(fechaISO: string, delta: number): string {
  const dt = parseISO(fechaISO);
  dt.setDate(dt.getDate() + delta);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatFechaLarga(fechaISO: string): string {
  const dt = parseISO(fechaISO);
  const dia = DIAS[dt.getDay()];
  const mes = MESES[dt.getMonth()];
  return `${dia} · ${String(dt.getDate()).padStart(2, "0")} de ${mes} de ${dt.getFullYear()}`;
}

// Para el encabezado del panel (components/DateNav.tsx): "Lunes", 19,
// "octubre", 2026, con tildes (DIAS de arriba va en mayusculas sin tilde
// porque es lo que usa formatFechaLarga en la impresion).
const DIAS_TITULO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function partesFecha(fechaISO: string) {
  const dt = parseISO(fechaISO);
  return { diaSemana: DIAS_TITULO[dt.getDay()], dia: dt.getDate(), mes: MESES[dt.getMonth()], anio: dt.getFullYear() };
}

export function nombreMes(mes: number) {
  return MESES[mes - 1];
}

// Dias de "desde" a "hasta" (negativo si hasta es antes).
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((parseISO(hasta).getTime() - parseISO(desde).getTime()) / 86_400_000);
}

// "Mañana", "Ayer", "En 4 días", "Hace 3 días" (null si es hoy).
export function textoRelativo(fechaISO: string, hoyISO: string): string | null {
  const n = diasEntre(hoyISO, fechaISO);
  if (n === 0) return null;
  if (n === 1) return "Mañana";
  if (n === -1) return "Ayer";
  return n > 0 ? `En ${n} días` : `Hace ${-n} días`;
}
