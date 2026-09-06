import type { Turno } from "./types";

// Antes de las 16hs se considera "Almuerzo", de ahi en mas "Cena". Regla
// unica compartida por la pantalla principal (app/page.tsx) y el plano
// (app/plano/page.tsx), para que las dos sigan siempre el mismo horario de
// corte sin poder desincronizarse entre sí.
export function turnoPorDefecto(): Turno {
  return new Date().getHours() < 16 ? "almuerzo" : "cena";
}