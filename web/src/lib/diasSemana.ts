// Días de la semana en que abre un turno de un salón, como máscara de bits
// (igual que en la API, ver Models/Salon.cs): lunes = 1, martes = 2, ...
// domingo = 64. 127 = todos los días.

export const TODOS_LOS_DIAS = 127;

// En orden de lunes a domingo (índice 0 = lunes).
export const DIAS_SEMANA = [
  { corto: "L", largo: "Lunes" },
  { corto: "M", largo: "Martes" },
  { corto: "X", largo: "Miércoles" },
  { corto: "J", largo: "Jueves" },
  { corto: "V", largo: "Viernes" },
  { corto: "S", largo: "Sábado" },
  { corto: "D", largo: "Domingo" },
] as const;

const PLURAL = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

export function abreElDia(dias: number, indice: number): boolean {
  return (dias & (1 << indice)) !== 0;
}

export function alternarDia(dias: number, indice: number): number {
  return dias ^ (1 << indice);
}

// «Solo viernes y sábados», «Todos menos los lunes», etc.
export function resumenDias(dias: number): string {
  const abre = PLURAL.filter((_, i) => abreElDia(dias, i));
  const cierra = PLURAL.filter((_, i) => !abreElDia(dias, i));
  const lista = (xs: string[]) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
  if (abre.length === 0) return "Ningún día";
  if (cierra.length === 0) return "Todos los días";
  if (cierra.length <= 2) return `Todos menos los ${lista(cierra)}`;
  return `Solo ${lista(abre)}`;
}
