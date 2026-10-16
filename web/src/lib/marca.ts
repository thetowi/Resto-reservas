// Datos del cliente de esta instancia (hoy: Barrancas). El producto es
// "capax" (ver components/MarcaCapax.tsx); el cliente se muestra debajo de
// la marca y en los reportes. Se puede cambiar por variable de entorno al
// instalar capax para otro restaurante u hotel, sin tocar el código.
export const NOMBRE_CLIENTE = process.env.NEXT_PUBLIC_CLIENTE_NOMBRE ?? "Barrancas";
export const RUBRO_CLIENTE = process.env.NEXT_PUBLIC_CLIENTE_RUBRO ?? "Restaurant";
export const SUBTITULO_CLIENTE = `${NOMBRE_CLIENTE} · ${RUBRO_CLIENTE}`;

// Para el link publico de reservas (/reservar), que ve el cliente final.
// Todos opcionales: si no estan, la pagina simplemente no muestra ese boton.
export const NOMBRE_PUBLICO = process.env.NEXT_PUBLIC_CLIENTE_NOMBRE_PUBLICO ?? `Hotel ${NOMBRE_CLIENTE}`;
// Numero de WhatsApp del restaurante en formato internacional, solo digitos
// (ej. 5491155555555), para "Escribinos por WhatsApp".
export const WHATSAPP_CLIENTE = process.env.NEXT_PUBLIC_CLIENTE_WHATSAPP ?? "";
// Link de Google Maps del lugar, para "Cómo llegar".
export const MAPS_CLIENTE = process.env.NEXT_PUBLIC_CLIENTE_MAPS_URL ?? "";
// Link a la politica de privacidad del cliente.
export const PRIVACIDAD_CLIENTE = process.env.NEXT_PUBLIC_CLIENTE_PRIVACIDAD_URL ?? "";

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
