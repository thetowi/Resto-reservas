// Marca del producto: "capax" (capacidad + pax). Símbolo = una mesa
// redonda vista desde arriba con 8 sillas alrededor; las 5 en teal son las
// ocupadas, como un indicador de ocupación. Todo va como SVG en línea (sin
// imágenes ni fuentes extra): el wordmark es la palabra "capax" en Plus
// Jakarta Sans 800 itálica convertida a curvas, con la «x» en teal; así se
// ve igual en cualquier máquina y en la impresión. Los archivos sueltos (SVG/PNG para usar fuera de la app) están
// en public/marca/.
//
// El nombre del cliente (el restaurante u hotel que usa esta instancia) va
// aparte, en lib/marca.ts.
//
// Animación de entrada (prop "animado"): las letras se dibujan con un trazo
// y se rellenan, y a medida que se rellena cada letra se ocupa una silla en
// teal (5 letras, 5 sillas). Los keyframes están en globals.css (sección
// "Animación de entrada del logo capax"); acá solo se ponen las clases.

const NAVY = "#143d58";
const TEAL = "#32b49d";

// Sillas ocupadas (teal) y libres (atenuadas), en un viewBox de 48x48.
const SILLAS_OCUPADAS = ["M20.15 5.90A18.5 18.5 0 0 1 27.85 5.90", "M34.08 8.48A18.5 18.5 0 0 1 39.52 13.92", "M42.10 20.15A18.5 18.5 0 0 1 42.10 27.85", "M39.52 34.08A18.5 18.5 0 0 1 34.08 39.52", "M27.85 42.10A18.5 18.5 0 0 1 20.15 42.10"];
const SILLAS_LIBRES = ["M13.92 39.52A18.5 18.5 0 0 1 8.48 34.08", "M5.90 27.85A18.5 18.5 0 0 1 5.90 20.15", "M8.48 13.92A18.5 18.5 0 0 1 13.92 8.48"];

// Wordmark recortado a la caja de los glifos, una letra por path (para poder
// animarlas por separado): c, a, p, a en el color del texto y la x en teal.
// Escalado para que, con "size" igual, la altura de las minúsculas sea la
// misma que tenía la versión anterior.
const WORDMARK_LETRAS = [
  "M26.9 55.75Q19.17 55.75 13.06 52.32Q6.94 48.9 3.47 42.94Q0 36.97 0 29.44Q0 23.28 2.35 17.9Q4.69 12.52 8.8 8.51Q12.91 4.5 18.34 2.25Q23.77 0 30.03 0Q36.09 0 41.08 2.1Q46.06 4.21 49.49 7.92Q52.91 11.64 54.18 16.63L41.17 21.71Q40.1 17.7 37.07 15.45Q34.04 13.2 29.83 13.2Q25.43 13.2 22.15 15.45Q18.88 17.7 17.07 21.42Q15.26 25.14 15.26 29.44Q15.26 33.35 16.72 36.28Q18.19 39.22 20.88 40.88Q23.57 42.54 27.09 42.54Q31.69 42.54 35.11 40.1Q38.53 37.65 40.2 33.64L52.62 39.61Q50.76 44.3 46.99 47.97Q43.23 51.64 38.05 53.69Q32.86 55.75 26.9 55.75Z",
  "M73.94 55.75Q68.56 55.75 64.55 54.08Q60.54 52.42 58.34 49.15Q56.14 45.87 56.14 41.17Q56.14 35.89 58.83 32.23Q61.52 28.56 66.16 26.31Q70.81 24.06 76.68 23.18L92.42 20.73L92.62 19.36Q92.91 17.12 91.84 15.55Q90.76 13.99 88.8 13.11Q86.85 12.23 84.5 12.23Q80.3 12.23 76.97 14.52Q73.65 16.82 71.98 20.34L60.64 14.18Q62.69 9.68 66.41 6.55Q70.12 3.42 75.01 1.71Q79.9 0 85.38 0Q92.13 0 97.36 2.54Q102.59 5.09 105.38 9.58Q108.17 14.08 107.29 20.05L102.5 54.57H88.71L89.29 50.47Q88.61 50.95 88.02 51.44Q84.99 53.69 81.52 54.72Q78.05 55.75 73.94 55.75ZM90.96 31.59 78.73 33.84Q75.7 34.43 73.5 35.94Q71.3 37.46 71.3 40.29Q71.3 42.74 73.06 43.86Q74.82 44.99 77.56 44.99Q81.18 44.99 83.96 43.33Q86.75 41.66 88.56 38.93Q90.37 36.19 90.76 32.96Z",
  "M108.56 74.13 118.73 1.17H132.52L132.13 4.4Q133.89 3.03 136.04 2.05Q140.64 0 146.31 0Q153.75 0 159.52 3.47Q165.29 6.94 168.66 12.86Q172.03 18.78 172.03 26.21Q172.03 32.27 169.78 37.65Q167.54 43.03 163.57 47.09Q159.61 51.15 154.38 53.45Q149.15 55.75 143.08 55.75Q137.12 55.75 132.33 53.6Q129.29 52.32 127.14 50.37L123.92 74.13ZM141.52 42.54Q146.02 42.54 149.44 40.39Q152.86 38.24 154.82 34.52Q156.78 30.81 156.78 26.21Q156.78 22.4 155.21 19.46Q153.65 16.53 150.86 14.87Q148.07 13.2 144.26 13.2Q139.86 13.2 136.48 15.4Q133.11 17.6 131.25 21.32Q129.39 25.04 129.39 29.63Q129.39 33.45 130.91 36.38Q132.42 39.32 135.16 40.93Q137.9 42.54 141.52 42.54Z",
  "M192.77 55.75Q187.39 55.75 183.38 54.08Q179.37 52.42 177.17 49.15Q174.97 45.87 174.97 41.17Q174.97 35.89 177.66 32.23Q180.35 28.56 184.99 26.31Q189.64 24.06 195.51 23.18L211.25 20.73L211.45 19.36Q211.74 17.12 210.67 15.55Q209.59 13.99 207.63 13.11Q205.68 12.23 203.33 12.23Q199.13 12.23 195.8 14.52Q192.47 16.82 190.81 20.34L179.47 14.18Q181.52 9.68 185.24 6.55Q188.95 3.42 193.84 1.71Q198.73 0 204.21 0Q210.96 0 216.19 2.54Q221.42 5.09 224.21 9.58Q227 14.08 226.12 20.05L221.33 54.57H207.54L208.12 50.47Q207.44 50.95 206.85 51.44Q203.82 53.69 200.35 54.72Q196.88 55.75 192.77 55.75ZM209.79 31.59 197.56 33.84Q194.53 34.43 192.33 35.94Q190.13 37.46 190.13 40.29Q190.13 42.74 191.89 43.86Q193.65 44.99 196.39 44.99Q200.01 44.99 202.79 43.33Q205.58 41.66 207.39 38.93Q209.2 36.19 209.59 32.96Z",
  "M225.83 54.57 248.52 27.38 233.75 1.17H249.69L258 16.43L270.42 1.17H287.93L265.44 27.78L280.3 54.57H264.65L255.95 38.73L243.23 54.57Z",
];
const WORDMARK_ANCHO = 287.93;
const WORDMARK_ALTO = 74.13;

function Simbolo({ mesa, libres, opacidadLibres }: { mesa: string; libres: string; opacidadLibres: number }) {
  // s1..s5 = sillas ocupadas (de arriba, en el sentido del reloj), s6..s8 =
  // libres: las clases solo las usa la animación de entrada.
  return (
    <>
      <g fill="none" strokeWidth={5.2} strokeLinecap="round">
        {SILLAS_OCUPADAS.map((d, i) => (
          <path key={d} d={d} stroke={TEAL} pathLength={100} className={`capax-silla capax-ocupada capax-s${i + 1}`} />
        ))}
        {SILLAS_LIBRES.map((d, i) => (
          <path
            key={d}
            d={d}
            stroke={libres}
            strokeOpacity={opacidadLibres}
            pathLength={100}
            className={`capax-silla capax-s${i + 6}`}
          />
        ))}
      </g>
      <circle cx="24" cy="24" r="9.5" fill={mesa} className="capax-mesa" />
    </>
  );
}

// Versión ícono de app: tile navy con el símbolo en blanco. Hoy la app usa
// el símbolo suelto (SimboloCapax); esta queda para usos tipo tienda de apps.
export function IconoCapax({ size = 42, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      role="img"
      aria-label="capax"
    >
      <rect width="48" height="48" rx="11.3" fill={NAVY} />
      <g transform="translate(9.12 9.12) scale(0.62)">
        <Simbolo mesa="#ffffff" libres="#ffffff" opacidadLibres={0.3} />
      </g>
    </svg>
  );
}

// Símbolo suelto, sin tile (es el que se usa en la app): mesa y sillas
// libres en navy sobre el tema claro y en el color del texto (#f2f2f2) sobre
// el Ónix; las sillas ocupadas, siempre teal. tono="claro" lo fija en navy
// aunque la pantalla esté en oscuro (para el papel impreso).
export function SimboloCapax({
  size = 32,
  className = "",
  tono = "auto",
}: {
  size?: number;
  className?: string;
  tono?: "auto" | "claro";
}) {
  const color = tono === "claro" ? "text-[#143d58]" : "text-[#143d58] [[data-theme=dark]_&]:text-tinta";
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={`shrink-0 ${color} ${className}`}
      role="img"
      aria-label="capax"
    >
      <Simbolo mesa="currentColor" libres="currentColor" opacidadLibres={0.26} />
    </svg>
  );
}

// La palabra "capax". "size" es el cuerpo equivalente en px (como un
// font-size); «capa» toma el color del texto que la rodea y la «x» va
// siempre en teal.
export function WordmarkCapax({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${WORDMARK_ANCHO} ${WORDMARK_ALTO}`}
      width={(WORDMARK_ANCHO * size) / 100}
      height={(WORDMARK_ALTO * size) / 100}
      className={`block overflow-visible ${className}`}
      role="img"
      aria-label="capax"
    >
      {WORDMARK_LETRAS.map((d, i) => (
        <path
          key={i}
          d={d}
          fill={i === 4 ? TEAL : "currentColor"}
          pathLength={100}
          className={`capax-letra capax-l${i + 1}`}
        />
      ))}
    </svg>
  );
}

// Bloque de marca para el header y el login: símbolo (sin fondo) + "capax"
// + el nombre del cliente debajo, como el logo horizontal. Con "animado" se
// reproduce la animación de entrada una vez al montarse.
export function MarcaCapax({
  subtitulo,
  simbolo = 36,
  animado = false,
}: {
  subtitulo: string;
  simbolo?: number;
  animado?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 ${animado ? "capax-intro" : ""}`}>
      <SimboloCapax size={simbolo} />
      <div>
        <WordmarkCapax size={19} />
        <div className="capax-sub mt-1 text-xs text-tinta-suave">{subtitulo}</div>
      </div>
    </div>
  );
}

// Versión vertical y grande, para el login: símbolo arriba, "capax" debajo y
// el nombre del cliente. Misma animación de entrada que MarcaCapax.
export function MarcaCapaxVertical({ subtitulo, animado = false }: { subtitulo: string; animado?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-3 ${animado ? "capax-intro" : ""}`}>
      <SimboloCapax size={60} />
      <WordmarkCapax size={44} />
      <div className="capax-sub text-sm text-tinta-suave">{subtitulo}</div>
    </div>
  );
}
