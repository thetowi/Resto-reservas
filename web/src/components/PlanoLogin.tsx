// Fondo del login: el plano de un salón visto desde arriba (paredes con
// puerta, ventanales, barra con banquetas, mesas de 2, 4 y 6 y boxes), en
// perspectiva, como un piso que se pierde hacia el fondo. Al abrir se
// dibuja con trazo desde el centro hacia afuera, junto con la animación del
// logo, y cuando las letras se rellenan las mesas ocupadas se pintan de teal;
// después queda quieto. Es solo decorativo (aria-hidden) y los datos son de
// ejemplo, no reservas reales: el login no muestra nada antes de ingresar.
// Estilos y keyframes en globals.css (sección "Fondo del login").

import type { CSSProperties } from "react";

type TipoMesa = "r2" | "r4" | "c4" | "l6" | "box";

// "a" = demora (en s) del trazo de esa mesa: más lejos del centro, más tarde.
const MESAS: { t: TipoMesa; x: number; y: number; ocupada: boolean; a: number; n: number }[] = [
  { t: "r4", x: 230, y: 300, ocupada: true, a: 0.68, n: 11 },
  { t: "c4", x: 415, y: 300, ocupada: false, a: 0.5, n: 12 },
  { t: "r2", x: 600, y: 300, ocupada: true, a: 0.34, n: 13 },
  { t: "c4", x: 785, y: 300, ocupada: false, a: 0.34, n: 14 },
  { t: "r4", x: 970, y: 300, ocupada: false, a: 0.48, n: 15 },
  { t: "c4", x: 270, y: 465, ocupada: true, a: 0.62, n: 16 },
  { t: "r2", x: 455, y: 465, ocupada: true, a: 0.42, n: 17 },
  { t: "c4", x: 640, y: 465, ocupada: false, a: 0.22, n: 18 },
  { t: "r4", x: 825, y: 465, ocupada: true, a: 0.29, n: 19 },
  { t: "r2", x: 1010, y: 465, ocupada: true, a: 0.49, n: 20 },
  { t: "r2", x: 230, y: 630, ocupada: false, a: 0.69, n: 21 },
  { t: "c4", x: 415, y: 630, ocupada: true, a: 0.51, n: 22 },
  { t: "r4", x: 600, y: 630, ocupada: false, a: 0.37, n: 23 },
  { t: "r2", x: 785, y: 630, ocupada: true, a: 0.37, n: 24 },
  { t: "r4", x: 970, y: 630, ocupada: false, a: 0.5, n: 25 },
  { t: "l6", x: 1180, y: 230, ocupada: true, a: 0.72, n: 26 },
  { t: "l6", x: 1180, y: 420, ocupada: false, a: 0.67, n: 27 },
  { t: "l6", x: 1180, y: 610, ocupada: false, a: 0.7, n: 28 },
  { t: "box", x: 230, y: 780, ocupada: false, a: 0.77, n: 29 },
  { t: "box", x: 420, y: 780, ocupada: false, a: 0.62, n: 30 },
  { t: "box", x: 610, y: 780, ocupada: false, a: 0.52, n: 31 },
  { t: "box", x: 900, y: 780, ocupada: true, a: 0.57, n: 32 },
  { t: "box", x: 1090, y: 780, ocupada: false, a: 0.7, n: 33 },
];

const ALTO = 900;
const M = 60;

function demora(a: number): CSSProperties {
  return { "--a": `${a}s` } as CSSProperties;
}

function Sillas({ t, x, y, a }: { t: TipoMesa; x: number; y: number; a: number }) {
  let sillas: [number, number, number, number][] = [];
  if (t === "r2") sillas = [[x, y - 32, 16, 7], [x, y + 32, 16, 7]];
  else if (t === "r4") sillas = [[x, y - 39, 17, 7], [x, y + 39, 17, 7], [x - 39, y, 7, 17], [x + 39, y, 7, 17]];
  else if (t === "c4") sillas = [[x, y - 37, 18, 7], [x, y + 37, 18, 7], [x - 37, y, 7, 18], [x + 37, y, 7, 18]];
  else if (t === "l6")
    sillas = [-42, 0, 42].flatMap((dx): [number, number, number, number][] => [
      [x + dx, y - 38, 18, 7],
      [x + dx, y + 38, 18, 7],
    ]);
  else
    return (
      <>
        <rect className="lp-banco" x={x - 52} y={y + 26} width={104} height={14} rx={5} style={demora(a)} />
        <rect className="lp-banco" x={x - 52} y={y - 40} width={104} height={14} rx={5} style={demora(a)} />
      </>
    );
  return (
    <>
      {sillas.map(([sx, sy, w, h], i) => (
        <rect key={i} className="lp-silla" x={sx - w / 2} y={sy - h / 2} width={w} height={h} rx={3.5} style={demora(a)} />
      ))}
    </>
  );
}

function Mesa({ t, x, y, ocupada, a }: { t: TipoMesa; x: number; y: number; ocupada: boolean; a: number }) {
  const props = { className: `lp-mesa ${ocupada ? "lp-ocupada" : ""}`, pathLength: 100, style: demora(a) };
  if (t === "r2") return <circle cx={x} cy={y} r={20} {...props} />;
  if (t === "r4") return <circle cx={x} cy={y} r={27} {...props} />;
  if (t === "c4") return <rect x={x - 25} y={y - 25} width={50} height={50} rx={7} {...props} />;
  if (t === "l6") return <rect x={x - 70} y={y - 26} width={140} height={52} rx={8} {...props} />;
  return <rect x={x - 40} y={y - 22} width={80} height={44} rx={7} {...props} />;
}

export default function PlanoLogin({ animado = true }: { animado?: boolean }) {
  return (
    <div className={`login-plano ${animado ? "login-arma" : ""}`} aria-hidden="true">
      <div className="login-plano-piso">
        <svg viewBox="0 0 1400 900" preserveAspectRatio="xMidYMid slice">
          <path
            className="lp-pared"
            pathLength={100}
            d={`M630 ${ALTO - M}H${M}V${M}H1340V${ALTO - M}H770`}
          />
          <path className="lp-puerta" d={`M630 ${ALTO - M}A140 140 0 0 1 770 ${ALTO - M}`} />
          {[150, 320, 490, 660].map((y) => (
            <path key={y} className="lp-ventana" d={`M1334 ${y}V${y + 110}M1346 ${y}V${y + 110}`} />
          ))}
          <rect className="lp-barra" x={M + 40} y={M + 30} width={420} height={46} rx={10} pathLength={100} />
          {Array.from({ length: 7 }, (_, i) => (
            <circle key={i} className="lp-banqueta" cx={M + 75 + i * 58} cy={M + 112} r={13} />
          ))}
          {MESAS.map((m) => (
            <g key={m.n}>
              <Mesa {...m} />
              <Sillas {...m} />
              <text className="lp-num" x={m.x} y={m.y + 4} style={demora(m.a)}>
                {m.n}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="login-vineta" />
    </div>
  );
}
