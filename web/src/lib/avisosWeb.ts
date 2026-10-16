// "Nuevas" del boton "Reservas web": se guarda, en este navegador, el
// CreadaEn de la ultima reserva web que se vio en /reservas-web (tal cual lo
// manda la API, asi no depende del reloj de la compu). El panel le pasa ese
// valor a GET /api/reservas-web/resumen y la API cuenta las que entraron
// despues. Cada equipo/navegador tiene su propio "visto".

const CLAVE = "capax-reservas-web-visto";

export function leerVistoWeb(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

// Solo avanza (nunca vuelve atras si llega un valor mas viejo).
export function guardarVistoWeb(creadaEn: string | null | undefined) {
  if (!creadaEn) return;
  try {
    const actual = localStorage.getItem(CLAVE);
    if (actual && Date.parse(actual) >= Date.parse(creadaEn)) return;
    localStorage.setItem(CLAVE, creadaEn);
  } catch {
    // sin almacenamiento (modo privado): las nuevas no se recuerdan
  }
}

export const esNuevaWeb = (creadaEn: string, visto: string | null) => !!visto && Date.parse(creadaEn) > Date.parse(visto);

// Texto del aviso: "2 nuevas · 1 para confirmar".
export function textoAvisosWeb(nuevas: number, aConfirmar: number) {
  const partes: string[] = [];
  if (nuevas > 0) partes.push(`${nuevas} ${nuevas === 1 ? "nueva" : "nuevas"}`);
  if (aConfirmar > 0) partes.push(`${aConfirmar} para confirmar`);
  return partes.join(" · ");
}
