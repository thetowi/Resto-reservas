// Datos del cliente de esta instancia (hoy: Barrancas). El producto es
// "capax" (ver components/MarcaCapax.tsx); el cliente se muestra debajo de
// la marca y en los reportes. Se puede cambiar por variable de entorno al
// instalar capax para otro restaurante u hotel, sin tocar el código.
export const NOMBRE_CLIENTE = process.env.NEXT_PUBLIC_CLIENTE_NOMBRE ?? "Barrancas";
export const RUBRO_CLIENTE = process.env.NEXT_PUBLIC_CLIENTE_RUBRO ?? "Restaurant";
export const SUBTITULO_CLIENTE = `${NOMBRE_CLIENTE} · ${RUBRO_CLIENTE}`;

// Para el link publico de reservas (/reservar), que ve el cliente final.
// Todos opcionales: si no estan, la pagina simplemente no muestra ese boton.
// Por defecto "Restaurant Barrancas" (rubro + nombre); se puede pisar por env.
export const NOMBRE_PUBLICO = process.env.NEXT_PUBLIC_CLIENTE_NOMBRE_PUBLICO ?? `${RUBRO_CLIENTE} ${NOMBRE_CLIENTE}`;
// Numero de WhatsApp del restaurante en formato internacional, solo digitos
// (ej. 5491155555555), para "Escribinos por WhatsApp".
export const WHATSAPP_CLIENTE = process.env.NEXT_PUBLIC_CLIENTE_WHATSAPP ?? "";
// "Cómo llegar" (ver lib/mapas.ts): el cliente elige con qué app abrirlo.
// Alcanza con la direccion; los links de cada app son opcionales y, si
// estan, pisan al que se arma con la direccion.
export const DIRECCION_CLIENTE = process.env.NEXT_PUBLIC_CLIENTE_DIRECCION ?? "";
// Link de Google Maps del lugar (ej. el de "Compartir" de la ficha).
export const MAPS_CLIENTE = process.env.NEXT_PUBLIC_CLIENTE_MAPS_URL ?? "";
// Link de Apple Maps ("Compartir" en Mapas del iPhone o la Mac).
export const MAPS_APPLE_CLIENTE = process.env.NEXT_PUBLIC_CLIENTE_MAPS_APPLE_URL ?? "";
// Link de Waze.
export const WAZE_CLIENTE = process.env.NEXT_PUBLIC_CLIENTE_WAZE_URL ?? "";
// Link a la politica de privacidad del cliente.
export const PRIVACIDAD_CLIENTE = process.env.NEXT_PUBLIC_CLIENTE_PRIVACIDAD_URL ?? "";

// Logo del cliente para el link publico (/reservar). Son archivos de
// public/cliente/ (para otro restaurante se reemplazan esos archivos, o se
// apunta a otra carpeta con NEXT_PUBLIC_CLIENTE_LOGOS):
//   logo-oscuro.svg        logo completo para fondo oscuro (portada negra)
//   logo-barra.svg         version horizontal chica, para fondo claro
//   logo-barra-oscuro.svg  version horizontal chica, para fondo oscuro (Onix)
//   logo.svg               logo completo para fondo claro (reserva)
// Si un archivo no carga, la pagina muestra el nombre en texto.
const CARPETA_LOGOS = (process.env.NEXT_PUBLIC_CLIENTE_LOGOS ?? "/cliente").replace(/\/$/, "");
export const LOGOS_CLIENTE = {
  portada: `${CARPETA_LOGOS}/logo-oscuro.svg`,
  barra: `${CARPETA_LOGOS}/logo-barra.svg`,
  barraOscuro: `${CARPETA_LOGOS}/logo-barra-oscuro.svg`,
};

// Animación de entrada del logo: se ve en el login y, si se abre la app con
// la sesión ya iniciada, una sola vez por pestaña (no cada vez que se vuelve
// a la pantalla principal). Se recuerda en sessionStorage.
const CLAVE_INTRO = "capax-intro-vista";

export function marcarIntroMarcaVista() {
  try {
    sessionStorage.setItem(CLAVE_INTRO, "1");
  } catch {
    // sin sessionStorage (modo privado estricto, etc.): no pasa nada
  }
}

// Si el logo ya se animó en esta pestaña. Solo lee (no marca), así el doble
// montaje de React en desarrollo no lo da por visto antes de tiempo; quien
// lo muestra llama después a marcarIntroMarcaVista().
export function introMarcaVista(): boolean {
  try {
    return sessionStorage.getItem(CLAVE_INTRO) !== null;
  } catch {
    return true;
  }
}
