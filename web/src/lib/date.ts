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
