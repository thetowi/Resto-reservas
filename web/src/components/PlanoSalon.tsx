"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HubConnectionState } from "@microsoft/signalr";
import {
  ApiError,
  borrarElementoPlano,
  crearElementoPlano,
  getDia,
  getElementosPlano,
  patchElementoPlano,
} from "@/lib/api";
import { addDays, formatFechaLarga, todayISO } from "@/lib/date";
import { crearConexion } from "@/lib/signalr";
import type { ElementoPlano, Mesa, Reserva, Turno, TurnoData } from "@/lib/types";
import DateNav from "@/components/DateNav";
import TurnoToggle from "@/components/TurnoToggle";

interface Props {
  mesas: Mesa[];
  // A qué salón corresponde este plano (ya se asume que "mesas" viene
  // pre-filtrada por el caller a este mismo salón): se usa para filtrar los
  // carteles de referencia (que son globales, ver getElementosPlano) y para
  // taggear los carteles nuevos que se agreguen desde acá.
  salonId: number;
  onMoverMesa: (mesa: Mesa, posX: number, posY: number) => void;
  // Cambia la forma (redonda/cuadrada) de una mesa: se llama desde el
  // selector que aparece al elegir una mesa en el plano (ver más abajo).
  // Opcional porque en modo lectura (/plano) no aplica — ahí no se puede
  // editar nada del plano, solo mirarlo.
  onCambiarForma?: (mesa: Mesa, forma: "redonda" | "cuadrada") => void;
  // Fija/desfija una mesa: mientras está fijada, MesaCaja ignora el
  // arrastre (ver onPointerDown/onPointerMove más abajo). Mismo criterio de
  // opcionalidad que onCambiarForma: no aplica en modo lectura.
  onFijar?: (mesa: Mesa, fijada: boolean) => void;
  // Rota el dibujo de una mesa (mesa + sillitas) en pasos de 90°: se llama
  // desde el mismo selector que onCambiarForma/onFijar, botón "Rotar" (ver
  // más abajo). No mueve ni redimensiona la mesa, solo cambia mesa.rotacion.
  // Mismo criterio de opcionalidad: no aplica en modo lectura.
  onRotar?: (mesa: Mesa, rotacion: number) => void;
  // Modo lectura (usado en /plano, la vista de Staff "para estudiar" el
  // salón): sin arrastre de mesas ni carteles, sin agregar/editar/borrar
  // carteles — solo mirar la disposición y la ocupación en vivo. Sí permite
  // hacer click en una mesa ocupada para ver el detalle de la reserva.
  soloLectura?: boolean;
  // Fecha/turno con los que arranca el plano (ver /plano/page.tsx, que los
  // pasa según lo que estaba elegido en la hoja antes de entrar). Si no
  // vienen, arranca en hoy/almuerzo como siempre — uso de /admin/mesas, que
  // no depende de ningún turno puntual. Ojo: este componente guarda su
  // propio fecha/turno en estado interno (el usuario los puede seguir
  // cambiando acá con su propio selector de fecha/turno, más abajo), así
  // que estos props solo se leen UNA VEZ al montar — el caller le tiene que
  // pasar una key distinta cada vez que cambian, para forzar un montaje
  // nuevo y que los tome (ver /plano/page.tsx).
  fechaInicial?: string;
  turnoInicial?: Turno;
  // Si el salón de este plano permite el turno Merienda (ver
  // Salon.permiteMerienda): habilita el botón "Merienda" en el toggle
  // interno de turno, más abajo. Default false: si no se pasa, se comporta
  // igual que antes (solo Almuerzo/Cena).
  permiteMerienda?: boolean;
  // Nombre del salón (Restaurant, Bar, Aqua Bar, etc): solo se usa para el
  // encabezado del PDF exportado (ver exportarPdf) — si no viene, el PDF
  // sale con un título genérico.
  salonNombre?: string;
}

// Grilla de arranque para las mesas que todavia no se acomodaron a mano
// (PosX/PosY null): las ubica en filas de a 8 para que el plano no arranque
// vacio ni con todas las mesas superpuestas en el origen.
const COLUMNAS = 8;
const ESPACIADO = 100;
const MARGEN = 30;

// Tamaño del lienzo: bastante mas grande que el ancho util de la pantalla
// para que entre un salon real completo — se recorre con scroll (el
// contenedor de afuera tiene overflow-auto).
const LIENZO_ANCHO = 1600;
const LIENZO_ALTO = 1000;

const ETIQUETAS_RAPIDAS = ["Ventana", "Cocina", "Bodega", "Isla", "Mueble", "Barra", "Entrada"];

// Paso de ajuste a grilla (snap): al soltar una mesa o cartel, si no quedó
// enganchado a ninguna línea guía (ver SNAP_TOLERANCIA), redondea a este
// múltiplo — mantiene el plano prolijo sin obligar a alinear a mano.
const GRID_STEP = 20;

// Distancia (en px del lienzo, sin escalar por el zoom) dentro de la cual se
// considera que el borde/centro de la mesa que se está arrastrando "engancha"
// con el de otra mesa ya ubicada — dispara la línea guía punteada.
const SNAP_TOLERANCIA = 6;

// Límites del zoom del lienzo (1 = 100%).
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 1.5;
const ZOOM_PASO = 0.1;
// Zoom con el que arranca el plano al entrar (ver el useEffect de montaje
// más abajo) y al que vuelve "Restablecer" — elegido a mano por el usuario,
// no calculado.
const ZOOM_DEFAULT = 0.92;

// Factor de resolución del <canvas> que arma exportarPdf (ver
// construirCanvasPlano): 2 = el doble de pixels por unidad de lienzo, para
// que el PDF salga nítido incluso ampliado.
const RESOLUCION_EXPORT = 2;

function posicionPorDefecto(orden: number) {
  return {
    x: MARGEN + (orden % COLUMNAS) * ESPACIADO,
    y: MARGEN + Math.floor(orden / COLUMNAS) * ESPACIADO,
  };
}

// Tamaño y forma de cada mesa: la forma (redonda/cuadrada) la elige la
// persona a mano por mesa (ver mesa.forma, seleccionable desde el plano),
// no se deriva de la capacidad. La única excepción es una mesa CUADRADA de
// más de 2 pax: en el salón real esas nunca son un cuadrado más grande, son
// la unión en fila de N mesas cuadradas individuales de 2 pax (4 pax = 2
// unidas, 6 pax = 3 unidas, 8 pax = 4 unidas, etc.), así que se dibujan como
// N cuadrados pegados en vez de uno solo agrandado (esPar=true; ladoPar es
// el lado de cada cuadrado individual, numCuadrados cuántos hay en la fila).
const GAP_PAR = 4;

interface Dimensiones {
  ancho: number;
  alto: number;
  esPar: boolean;
  ladoPar: number;
  numCuadrados: number;
}

// Un único cálculo de tamaño por capacidad, reusado tanto para una mesa
// normal como para el lado de cada cuadrado del par (ver más abajo): así la
// fila de cuadrados de una mesa cuadrada de más de 2 pax queda garantizada
// del MISMO tamaño por cuadrado que una mesa independiente de 2 pax, sin dos
// fórmulas separadas que se puedan desalinear con el tiempo.
function ladoDeCapacidad(capacidad: number) {
  return Math.min(84, Math.max(46, 30 + capacidad * 5));
}

function dimensionesPorCapacidad(capacidad: number, forma: "redonda" | "cuadrada"): Dimensiones {
  if (forma === "cuadrada" && capacidad > 2) {
    const lado = ladoDeCapacidad(2);
    // Impar (3, 5, 7...): el último cuadrado de la fila queda con una sola
    // silla en vez de dos (ver sillasParUnido) — no debería pasar en la
    // práctica (las mesas cuadradas reales siempre son pares de 2 pax), pero
    // no rompe el dibujo si pasa.
    const numCuadrados = Math.ceil(capacidad / 2);
    return {
      ancho: numCuadrados * lado + (numCuadrados - 1) * GAP_PAR,
      alto: lado,
      esPar: true,
      ladoPar: lado,
      numCuadrados,
    };
  }
  const base = ladoDeCapacidad(capacidad);
  return { ancho: base, alto: base, esPar: false, ladoPar: base, numCuadrados: 1 };
}

// --- Sillitas alrededor de la mesa (ver MesaCaja) ---------------------
//
// Cada silla se ubica en coordenadas relativas al CENTRO de la mesa (0,0),
// con una rotación en grados para orientar el respaldo hacia afuera. Esto
// se probó primero a mano en un boceto aparte (con el usuario mirando cada
// iteración) antes de portarlo acá, así que las constantes de tamaño/gap
// vienen directo de esa versión aprobada — no cambiarlas "a ojo".
interface Silla {
  x: number;
  y: number;
  rotacion: number;
  // Mesas redondas: respaldo más chico y sutil. Mesas cuadradas/par: el
  // respaldo original, más marcado (así se pidió explícitamente).
  sutil: boolean;
}

const SILLA_ANCHO = 15;
const SILLA_ALTO = 11;
const SILLA_SEPARACION = 9; // separación mesa→silla, cuadrada y par unido
const SILLA_RADIO_EXTRA = 8; // separación mesa→silla, redonda
// Cuánto puede sobresalir una silla más allá de la caja lógica de la mesa
// (ancho x alto): define el margen del <svg> que dibuja mesa+sillas, y
// cuánto hay que correr para abajo el cartel con el nombre de la reserva
// para que no le queden las sillas de abajo encima.
const MARGEN_SILLAS = 26;

function sillasRedonda(radioMesa: number, n: number): Silla[] {
  const sillas: Silla[] = [];
  const dist = radioMesa + SILLA_RADIO_EXTRA;
  for (let i = 0; i < n; i++) {
    const ang = -90 + (360 / n) * i; // grados, empieza arriba
    const rad = (ang * Math.PI) / 180;
    sillas.push({ x: dist * Math.cos(rad), y: dist * Math.sin(rad), rotacion: ang + 90, sutil: true });
  }
  return sillas;
}

// Reparte n sillas entre los dos pares de lados (arriba/abajo e izquierda/
// derecha) de a pares, para que cada silla quede enfrentada a su opuesta.
// En cada paso se suma un par al lado que en ese momento tenga más espacio
// disponible por silla (largo del lado / sillas ya puestas ahí), así los
// lados largos reciben más sillas que los cortos pero siempre parejo.
function distribuirSillasRectangulo(w: number, h: number, n: number) {
  let countTB = 0;
  let countLR = 0;
  const pares = Math.floor(n / 2);
  for (let i = 0; i < pares; i++) {
    const espacioTB = w / (countTB + 1);
    const espacioLR = h / (countLR + 1);
    if (espacioTB >= espacioLR) countTB++;
    else countLR++;
  }
  const extra = n % 2; // capacidades impares: una silla suelta en el lado con más espacio
  let arriba = countTB;
  let abajo = countTB;
  let izquierda = countLR;
  let derecha = countLR;
  if (extra) {
    if (w / (countTB + 1) >= h / (countLR + 1)) arriba++;
    else izquierda++;
  }
  return { arriba, abajo, izquierda, derecha };
}

function sillasRectangulo(w: number, h: number, n: number): Silla[] {
  const { arriba, abajo, izquierda, derecha } = distribuirSillasRectangulo(w, h, n);
  const sillas: Silla[] = [];
  const fraccion = (j: number, k: number) => -0.5 + (j + 0.5) / k;
  for (let j = 0; j < arriba; j++) {
    sillas.push({ x: fraccion(j, arriba) * w, y: -h / 2 - SILLA_SEPARACION, rotacion: 0, sutil: false });
  }
  for (let j = 0; j < abajo; j++) {
    sillas.push({ x: fraccion(j, abajo) * w, y: h / 2 + SILLA_SEPARACION, rotacion: 180, sutil: false });
  }
  for (let j = 0; j < izquierda; j++) {
    sillas.push({ x: -w / 2 - SILLA_SEPARACION, y: fraccion(j, izquierda) * h, rotacion: 270, sutil: false });
  }
  for (let j = 0; j < derecha; j++) {
    sillas.push({ x: w / 2 + SILLA_SEPARACION, y: fraccion(j, derecha) * h, rotacion: 90, sutil: false });
  }
  return sillas;
}

// Caso esPar: N mesas de 2 pax unidas en fila (ver dimensionesPorCapacidad).
// Una silla arriba y una abajo por cada cuadrado de la fila, enfrentadas
// entre sí, nunca en las puntas cortas de la fila (ahí es donde se unen las
// mesas) — generaliza el caso original de 2 cuadrados (4 pax) a cualquier
// cantidad. Si la capacidad es impar, el último cuadrado se queda sin la
// silla de abajo (ver comentario de dimensionesPorCapacidad).
function sillasParUnido(w: number, ladoPar: number, capacidad: number): Silla[] {
  const sillas: Silla[] = [];
  const centroCuadrado = (i: number) => -w / 2 + ladoPar / 2 + i * (ladoPar + GAP_PAR);
  const arriba = Math.ceil(capacidad / 2);
  const abajo = Math.floor(capacidad / 2);
  for (let i = 0; i < arriba; i++) {
    sillas.push({ x: centroCuadrado(i), y: -ladoPar / 2 - SILLA_SEPARACION, rotacion: 0, sutil: false });
  }
  for (let i = 0; i < abajo; i++) {
    sillas.push({ x: centroCuadrado(i), y: ladoPar / 2 + SILLA_SEPARACION, rotacion: 180, sutil: false });
  }
  return sillas;
}

function SillaSvg({ silla }: { silla: Silla }) {
  const w = SILLA_ANCHO;
  const h = SILLA_ALTO;
  return (
    <g transform={`translate(${silla.x.toFixed(2)}, ${silla.y.toFixed(2)}) rotate(${silla.rotacion})`}>
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx={w * 0.28}
        fill="var(--color-silla)"
        stroke="var(--color-silla-borde)"
        strokeWidth={1}
      />
      {silla.sutil ? (
        <rect
          x={-(w * 0.86) / 2}
          y={-h / 2 - h * 0.27}
          width={w * 0.86}
          height={h * 0.3}
          rx={w * 0.86 * 0.24}
          fill="var(--color-silla-borde)"
        />
      ) : (
        <rect x={-w / 2} y={-h / 2 - h * 0.32} width={w} height={h * 0.34} rx={w * 0.22} fill="var(--color-silla-borde)" />
      )}
    </g>
  );
}

// --- Dibujo del plano a mano en <canvas> (ver construirCanvasPlano en el
// componente, y el comentario de exportarPdf sobre por qué se dibuja en vez
// de capturar el DOM): funciones puras de trazado, sin estado propio.
//
// Mesa cuadrada/redonda/par y sillas se dibujan CENTRADAS en el (0,0) del
// contexto (el llamador hace ctx.translate al centro de la mesa y, si
// corresponde, ctx.rotate por mesa.rotacion antes de llamarlas — ver el loop
// de mesas en construirCanvasPlano) para poder rotar mesa+sillas como un
// solo bloque, igual que el <g> del SVG en pantalla (ver MesaCaja).

// Mismos colores fijos que --color-silla/--color-silla-borde en modo claro
// (globals.css): el PDF siempre sale en modo claro, así que acá van como
// literales en vez de var(...) — mismo criterio que el resto de esta función
// (relleno/borde de mesas).
const COLOR_SILLA = "#b9c3ca";
const COLOR_SILLA_BORDE = "#8fa0aa";

function dibujarRectRedondeado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radio: number) {
  const r = Math.min(radio, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// Equivalente en <canvas> de SillaSvg más arriba: misma geometría (asiento +
// respaldo, sutil o marcado), pero dibujada con la API Canvas 2D en vez de
// JSX. `silla.x/y/rotacion` ya vienen en coordenadas locales al centro de la
// mesa (ver sillasRedonda/sillasRectangulo/sillasParUnido), así que esta
// función asume que el contexto ya está trasladado a ese centro.
function dibujarSilla(ctx: CanvasRenderingContext2D, silla: Silla) {
  const w = SILLA_ANCHO;
  const h = SILLA_ALTO;
  ctx.save();
  ctx.translate(silla.x, silla.y);
  ctx.rotate((silla.rotacion * Math.PI) / 180);
  dibujarRectRedondeado(ctx, -w / 2, -h / 2, w, h, w * 0.28);
  ctx.fillStyle = COLOR_SILLA;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLOR_SILLA_BORDE;
  ctx.stroke();
  if (silla.sutil) {
    dibujarRectRedondeado(ctx, -(w * 0.86) / 2, -h / 2 - h * 0.27, w * 0.86, h * 0.3, w * 0.86 * 0.24);
  } else {
    dibujarRectRedondeado(ctx, -w / 2, -h / 2 - h * 0.32, w, h * 0.34, w * 0.22);
  }
  ctx.fillStyle = COLOR_SILLA_BORDE;
  ctx.fill();
  ctx.restore();
}

function trazarMesaCuadrada(
  ctx: CanvasRenderingContext2D,
  lado: number,
  relleno: string,
  borde: string,
  dividida: boolean,
) {
  dibujarRectRedondeado(ctx, -lado / 2, -lado / 2, lado, lado, 12);
  ctx.fillStyle = relleno;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = borde;
  ctx.setLineDash(dividida ? [5, 3] : []);
  ctx.stroke();
  ctx.setLineDash([]);
}

function trazarMesaRedonda(
  ctx: CanvasRenderingContext2D,
  ancho: number,
  alto: number,
  relleno: string,
  borde: string,
  dividida: boolean,
) {
  ctx.beginPath();
  ctx.ellipse(0, 0, ancho / 2, alto / 2, 0, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = relleno;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = borde;
  ctx.setLineDash(dividida ? [5, 3] : []);
  ctx.stroke();
  ctx.setLineDash([]);
}

// Caso esPar (mesa cuadrada de más de 2 pax = N cuadrados de 2 pax pegados
// en fila, ver dimensionesPorCapacidad): N cuadrados + una línea punteada
// divisoria entre cada par de cuadrados consecutivos, igual que el bloque
// esPar de MesaCaja en pantalla.
function trazarMesaPar(
  ctx: CanvasRenderingContext2D,
  ancho: number,
  alto: number,
  ladoPar: number,
  numCuadrados: number,
  relleno: string,
  borde: string,
  divisor: string,
  dividida: boolean,
) {
  for (let i = 0; i < numCuadrados; i++) {
    dibujarRectRedondeado(ctx, -ancho / 2 + i * (ladoPar + GAP_PAR), -alto / 2, ladoPar, alto, 10);
    ctx.fillStyle = relleno;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = borde;
    ctx.setLineDash(dividida ? [5, 3] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (let i = 0; i < numCuadrados - 1; i++) {
    const xDivisor = -ancho / 2 + i * (ladoPar + GAP_PAR) + ladoPar + GAP_PAR / 2;
    ctx.beginPath();
    ctx.moveTo(xDivisor, -alto / 2 + 3);
    ctx.lineTo(xDivisor, alto / 2 - 3);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = divisor;
    ctx.setLineDash([2, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// Puntito de "mesa pedida" (ver .chip-pedida en globals.css — mismo criterio
// visual, en la esquina superior derecha de la mesa).
function dibujarPuntoPedida(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#b8722c";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
}

// Guía de alineación activa mientras se arrastra: una línea vertical (v) y/o
// horizontal (h) en coordenadas del lienzo (sin escalar), calculadas contra
// el resto de las mesas — estilo Figma/PowerPoint ("smart guides").
interface Guia {
  v: number | null;
  h: number | null;
}

interface RectRender {
  id: string;
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

// Calcula, para una caja en (x,y) de tamaño (ancho,alto) que se está
// arrastrando, si algún borde/centro cae lo bastante cerca del de otra caja
// ya ubicada (excluyéndose a sí misma) — si es así devuelve la posición
// ajustada (snap) y qué línea guía mostrar; si no, aplica el ajuste a grilla
// como respaldo.
function calcularSnap(
  x: number,
  y: number,
  ancho: number,
  alto: number,
  propioId: string,
  referencias: RectRender[],
): { x: number; y: number; guia: Guia } {
  const centroX = x + ancho / 2;
  const centroY = y + alto / 2;
  let mejorV: { valor: number; dx: number; linea: number } | null = null;
  let mejorH: { valor: number; dy: number; linea: number } | null = null;

  for (const ref of referencias) {
    if (ref.id === propioId) continue;
    const refCentroX = ref.x + ref.ancho / 2;
    const refCentroY = ref.y + ref.alto / 2;
    const candidatosX: Array<[number, number]> = [
      [ref.x - x, ref.x],
      [ref.x + ref.ancho - (x + ancho), ref.x + ref.ancho - ancho],
      [refCentroX - centroX, refCentroX - ancho / 2],
    ];
    for (const [dx, nuevoX] of candidatosX) {
      if (Math.abs(dx) <= SNAP_TOLERANCIA && (!mejorV || Math.abs(dx) < Math.abs(mejorV.dx))) {
        mejorV = { valor: nuevoX, dx, linea: nuevoX === ref.x ? ref.x : nuevoX === ref.x + ref.ancho - ancho ? ref.x + ref.ancho : refCentroX };
      }
    }
    const candidatosY: Array<[number, number]> = [
      [ref.y - y, ref.y],
      [ref.y + ref.alto - (y + alto), ref.y + ref.alto - alto],
      [refCentroY - centroY, refCentroY - alto / 2],
    ];
    for (const [dy, nuevoY] of candidatosY) {
      if (Math.abs(dy) <= SNAP_TOLERANCIA && (!mejorH || Math.abs(dy) < Math.abs(mejorH.dy))) {
        mejorH = { valor: nuevoY, dy, linea: nuevoY === ref.y ? ref.y : nuevoY === ref.y + ref.alto - alto ? ref.y + ref.alto : refCentroY };
      }
    }
  }

  const resultado = {
    x: mejorV ? mejorV.valor : Math.round(x / GRID_STEP) * GRID_STEP,
    y: mejorH ? mejorH.valor : Math.round(y / GRID_STEP) * GRID_STEP,
    guia: { v: mejorV ? mejorV.linea : null, h: mejorH ? mejorH.linea : null },
  };
  return resultado;
}

export default function PlanoSalon({
  mesas,
  salonId,
  onMoverMesa,
  onCambiarForma,
  onFijar,
  onRotar,
  soloLectura = false,
  fechaInicial,
  turnoInicial,
  permiteMerienda = false,
  salonNombre,
}: Props) {
  const [fecha, setFecha] = useState(fechaInicial ?? todayISO());
  const [turno, setTurno] = useState<Turno>(turnoInicial ?? "almuerzo");
  const [turnoData, setTurnoData] = useState<TurnoData | null>(null);
  const [elementos, setElementos] = useState<ElementoPlano[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [guiaActiva, setGuiaActiva] = useState<Guia>({ v: null, h: null });
  const [reservaDetalle, setReservaDetalle] = useState<Reserva | null>(null);
  // Mesa elegida en el plano (solo en modo edición): al seleccionarla
  // aparece el selector de forma (redonda/cuadrada) flotando junto a ella.
  const [mesaSeleccionadaId, setMesaSeleccionadaId] = useState<number | null>(null);
  // Texto de "Buscar mesa" (ver centrarEnMesa más abajo) y la mesa que quedó
  // resaltada momentáneamente después de encontrarla/centrarla.
  const [busqueda, setBusqueda] = useState("");
  const [mesaResaltadaId, setMesaResaltadaId] = useState<number | null>(null);
  const [exportando, setExportando] = useState(false);
  const fechaRef = useRef(fecha);
  const turnoRef = useRef(turno);
  // Contenedor con scroll (el que tiene overflow-auto): se usa para centrar
  // una mesa encontrada por búsqueda (ver centrarEnMesa).
  const scrollRef = useRef<HTMLDivElement>(null);
  const resaltadoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lista de mesas que se USA PARA DIBUJAR el plano (posiciones, forma,
  // dividida, fijada): arranca con `mesas` (la que trae el caller: la
  // estructural fija de /admin/mesas, o la ya resuelta para el fecha/turno
  // con el que se entró a /plano), pero DESPUES se reemplaza por
  // turnoData.mesas apenas se resuelve el turno elegido (ver mas abajo).
  // Hace falta este segundo paso porque este componente tiene SU PROPIO
  // selector de fecha/turno (mas abajo): si el usuario lo usa para cambiar
  // de turno SIN salir de la pantalla, `mesas` (el prop) no cambia solo —
  // sigue siendo la foto de cuando se entro — y sin esto, una mesa dividida
  // SOLO PARA ESE TURNO (ver DividirPorTurno) seguia apareciendo entera (o
  // viceversa) al cambiar de turno con el toggle interno o el calendario,
  // en vez de mostrar como esta esa mesa DE VERDAD en el turno elegido.
  const [mesasInternas, setMesasInternas] = useState<Mesa[]>(mesas);

  useEffect(() => {
    fechaRef.current = fecha;
  }, [fecha]);
  useEffect(() => {
    turnoRef.current = turno;
  }, [turno]);

  // Calcula el zoom más grande que hace entrar el lienzo completo
  // (LIENZO_ANCHO x LIENZO_ALTO) en el contenedor visible SIN necesitar
  // scroll, y lo aplica. Redondea siempre para abajo (no al más cercano):
  // así nunca queda a un pixel de redondeo de distancia de disparar la
  // scrollbar por el lado que se pasó.
  function ajustarZoomAlContenedor() {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
    const escalaX = el.clientWidth / LIENZO_ANCHO;
    const escalaY = el.clientHeight / LIENZO_ALTO;
    const ajuste = Math.min(escalaX, escalaY, ZOOM_MAX);
    setZoom(Math.max(ZOOM_MIN, Math.floor(ajuste * 100) / 100));
  }

  // Al entrar al plano arranca siempre en ZOOM_DEFAULT (ya seteado como
  // estado inicial más arriba) en vez de recalcular un ajuste al contenedor:
  // si en una pantalla puntual no entra todo sin scrollear, está el botón
  // "Ajustar a pantalla" más abajo para eso.

  useEffect(
    () => () => {
      if (resaltadoTimer.current) clearTimeout(resaltadoTimer.current);
    },
    [],
  );

  // Si el prop cambia desde afuera (el caller volvio a pedir /api/meta o
  // /api/dias, o aplico a mano un PATCH — ver admin/mesas/page.tsx y
  // /plano/page.tsx), se refleja aca. Se pisa de nuevo apenas resuelve
  // turnoData (efecto de abajo), que es la fuente mas actualizada para el
  // turno puntual que se esta mirando.
  useEffect(() => {
    setMesasInternas(mesas);
  }, [mesas]);

  // Trae la ocupacion del turno elegido (para pintar rojo/verde) Y la lista
  // de mesas ya resuelta para ESE fecha/turno puntual (con las divisiones
  // por turno aplicadas — ver DiaService.GetTurnoAsync): esto ultimo es lo
  // que hace que cambiar de turno con el toggle interno, o de fecha con el
  // calendario, actualice tambien como se ve cada mesa (dividida o entera),
  // no solo la ocupacion.
  useEffect(() => {
    getDia(fecha, salonId)
      .then((dia) => {
        // dia.merienda es null si el salón no tiene Merienda habilitada (ver
        // Salon.permiteMerienda) — si igual se llega acá con
        // turno==="merienda" para ese salón, no queda ocupación que mostrar.
        const data = turno === "almuerzo" ? dia.almuerzo : turno === "merienda" ? dia.merienda : dia.cena;
        setTurnoData(data);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error cargando la ocupación"));
  }, [fecha, turno, salonId]);

  useEffect(() => {
    if (turnoData) setMesasInternas(turnoData.mesas);
  }, [turnoData]);

  // Los elementos de referencia (cartelitos) son globales (de todos los
  // salones), se cargan una sola vez y despues se mantienen con el
  // broadcast de SignalR — se filtran por este salon mas abajo.
  useEffect(() => {
    getElementosPlano()
      .then(setElementos)
      .catch(() => {
        // si falla, el plano sigue funcionando igual sin los cartelitos
      });
  }, []);

  const elementosDelSalon = useMemo(
    () => elementos.filter((e) => e.salonId === salonId),
    [elementos, salonId],
  );

  // Conexion propia (independiente de la de /admin/mesas para MesasActualizado):
  // se resuscribe al grupo fecha:turno:salon cada vez que cambian, igual
  // que en la pantalla principal de reservas.
  useEffect(() => {
    const conexion = crearConexion();

    conexion.on("TurnoActualizado", (data: TurnoData) => {
      if (data.fecha !== fechaRef.current || data.turno !== turnoRef.current || data.salonId !== salonId) return;
      setTurnoData(data);
    });

    // Global, igual que las mesas: no depende de fecha/turno ni de
    // suscribirse a ningun grupo (se filtra por salon mas arriba, en
    // elementosDelSalon).
    conexion.on("ElementosPlanoActualizado", (data: ElementoPlano[]) => setElementos(data));

    conexion
      .start()
      .then(() => conexion.invoke("Suscribirse", fechaRef.current, turnoRef.current, salonId))
      .catch(() => {});

    return () => {
      if (conexion.state === HubConnectionState.Connected) {
        conexion.invoke("Desuscribirse", fechaRef.current, turnoRef.current, salonId).catch(() => {});
      }
      conexion.stop();
    };
  }, [fecha, turno, salonId]);

  const ocupadas = useMemo(() => new Set(turnoData?.mesasOcupadas ?? []), [turnoData]);
  const pedidas = useMemo(() => new Set(turnoData?.mesasPedidas ?? []), [turnoData]);
  const walkIns = useMemo(() => new Set(turnoData?.mesasWalkIn ?? []), [turnoData]);

  // Una mesa en 0 pax es una base que ya se dividió por completo (ver
  // MesasController.DividirEnDos): sus asientos pasaron enteros a sus dos
  // mitades nuevas, así que ella ya no es una mesa real — se sigue guardando
  // (para no romper reservas viejas que le apuntaban), pero no tiene sentido
  // dibujarla en el plano. Sin este filtro quedaba un cajoncito fantasma de
  // "0p" justo donde estaban las dos mitades nuevas.
  const mesasVisibles = useMemo(() => mesasInternas.filter((m) => m.capacidad > 0), [mesasInternas]);

  // Mesa -> reserva que la ocupa (si tiene una): para el label de nombre/hora
  // sobre la mesa y para el detalle al hacer click. Una reserva puede tener
  // varias mesas (mesaIds); se ignoran las ya "retiradas" (se fueron), igual
  // que mesasOcupadas del backend.
  const reservaPorMesaId = useMemo(() => {
    const mapa = new Map<number, Reserva>();
    for (const reserva of turnoData?.reservas ?? []) {
      if (reserva.retirada) continue;
      for (const mesaId of reserva.mesaIds) mapa.set(mesaId, reserva);
    }
    return mapa;
  }, [turnoData]);

  // Pares de mesas divididas (mesa base -> sus dos hijas), para dibujar la
  // línea punteada que las conecta visualmente en el lienzo.
  const paresDivididos = useMemo(() => {
    const porPadre = new Map<number, Mesa[]>();
    for (const mesa of mesasVisibles) {
      if (mesa.mesaPadreId === null) continue;
      const lista = porPadre.get(mesa.mesaPadreId) ?? [];
      lista.push(mesa);
      porPadre.set(mesa.mesaPadreId, lista);
    }
    return [...porPadre.values()].filter((lista) => lista.length === 2);
  }, [mesasVisibles]);

  // Posiciones actuales de todas las mesas (para las líneas guía y los
  // conectores de división): se recalcula solo cuando cambian mesas, no en
  // cada frame de arrastre — mientras se arrastra, MesaCaja compara su
  // propia posición local contra este snapshot, que sigue siendo válido
  // porque las otras mesas no se mueven al mismo tiempo.
  const mesasRender = useMemo<RectRender[]>(
    () =>
      mesasVisibles.map((mesa) => {
        const inicial =
          mesa.posX !== null && mesa.posY !== null ? { x: mesa.posX, y: mesa.posY } : posicionPorDefecto(mesa.orden);
        const dim = dimensionesPorCapacidad(mesa.capacidad, mesa.forma);
        return { id: `mesa-${mesa.id}`, x: inicial.x, y: inicial.y, ancho: dim.ancho, alto: dim.alto };
      }),
    [mesasVisibles],
  );

  // Resultados de "Buscar mesa" (por código, no distingue mayúsculas): hasta
  // 8 para no desbordar el desplegable. Vacío si todavía no se escribió nada.
  const coincidencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return mesasVisibles.filter((m) => m.codigo.toLowerCase().includes(q)).slice(0, 8);
  }, [busqueda, mesasVisibles]);

  // Centra el scroll del plano en la mesa indicada (con animación) y la
  // resalta un rato (ver mesaResaltadaId, MesaCaja) para que sea fácil de
  // ubicar de un vistazo. Las coordenadas de mesasRender ya están en
  // "espacio de lienzo" (sin escalar); acá se multiplican por el zoom actual
  // porque el contenedor con scroll trabaja en pixels de pantalla.
  function centrarEnMesa(mesaId: number) {
    const rect = mesasRender.find((r) => r.id === `mesa-${mesaId}`);
    const contenedor = scrollRef.current;
    if (!rect || !contenedor) return;
    const cx = (rect.x + rect.ancho / 2) * zoom;
    const cy = (rect.y + rect.alto / 2) * zoom;
    contenedor.scrollTo({
      left: Math.max(0, cx - contenedor.clientWidth / 2),
      top: Math.max(0, cy - contenedor.clientHeight / 2),
      behavior: "smooth",
    });
    setMesaResaltadaId(mesaId);
    if (resaltadoTimer.current) clearTimeout(resaltadoTimer.current);
    resaltadoTimer.current = setTimeout(
      () => setMesaResaltadaId((actual) => (actual === mesaId ? null : actual)),
      2200,
    );
  }

  function onBuscarSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (coincidencias.length === 0) return;
    centrarEnMesa(coincidencias[0].id);
    setBusqueda("");
  }

  // Dibuja el plano completo (mesas + carteles + conectores de división) en
  // un <canvas> propio, a partir de los mismos datos que se usan para
  // pintarlo en pantalla — a mano, con la API Canvas 2D, en vez de capturar
  // el DOM (ver comentario de exportarPdf más abajo sobre por qué). Siempre
  // a resolución fija (RESOLUCION_EXPORT) y sobre fondo blanco, sin importar
  // el zoom o el tema (claro/oscuro) con el que se lo esté mirando en
  // pantalla en ese momento.
  function construirCanvasPlano(): HTMLCanvasElement {
    // Autocrop: en vez de exportar el lienzo entero (1600x1000 fijos —
    // vacíos en su mayoría si el salón real ocupa solo una esquina, que era
    // justo lo que dejaba tanto espacio en blanco en el PDF), calcula el
    // rectángulo que en verdad contiene mesas y carteles, con un margen
    // chico alrededor, y arma el canvas de ESE tamaño. Se recalcula solo en
    // cada exportación — no hace falta mandar una captura ni tocar nada a
    // mano: si más adelante se agregan o mueven mesas, el recorte se ajusta
    // automáticamente.
    const PADDING_RECORTE = 40;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of mesasRender) {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.ancho);
      maxY = Math.max(maxY, r.y + r.alto);
    }
    for (const elemento of elementosDelSalon) {
      minX = Math.min(minX, elemento.posX);
      minY = Math.min(minY, elemento.posY);
      maxX = Math.max(maxX, elemento.posX + elemento.ancho);
      maxY = Math.max(maxY, elemento.posY + elemento.alto);
    }
    // Salón vacío (sin mesas visibles ni carteles): cae al lienzo completo
    // en vez de un rectángulo vacío/infinito.
    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = LIENZO_ANCHO;
      maxY = LIENZO_ALTO;
    }
    minX = Math.max(0, minX - PADDING_RECORTE);
    minY = Math.max(0, minY - PADDING_RECORTE);
    maxX = Math.min(LIENZO_ANCHO, maxX + PADDING_RECORTE);
    maxY = Math.min(LIENZO_ALTO, maxY + PADDING_RECORTE);
    const anchoRecorte = maxX - minX;
    const altoRecorte = maxY - minY;

    const canvas = document.createElement("canvas");
    canvas.width = anchoRecorte * RESOLUCION_EXPORT;
    canvas.height = altoRecorte * RESOLUCION_EXPORT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no se pudo crear el contexto 2D");
    ctx.scale(RESOLUCION_EXPORT, RESOLUCION_EXPORT);
    // Corre el origen al recorte: todo el código de dibujo de más abajo usa
    // coordenadas absolutas del lienzo completo (mesa.posX/posY, etc.) sin
    // cambios — este translate es lo único que hace falta para que esas
    // mismas coordenadas caigan en el lugar correcto del canvas recortado.
    ctx.translate(-minX, -minY);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(minX, minY, anchoRecorte, altoRecorte);

    // Carteles de referencia primero (quedan "debajo" de las mesas, igual
    // que en pantalla — aunque en la práctica no se pisan entre sí).
    for (const elemento of elementosDelSalon) {
      dibujarRectRedondeado(ctx, elemento.posX, elemento.posY, elemento.ancho, elemento.alto, 8);
      ctx.fillStyle = "#f3ecd8";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#9c7a3c";
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#9c7a3c";
      ctx.font = "11px sans-serif";
      ctx.fillText(
        elemento.etiqueta,
        elemento.posX + elemento.ancho / 2,
        elemento.posY + elemento.alto / 2,
        elemento.ancho - 6,
      );
    }

    // Conectores entre mesas divididas (línea punteada entre los centros).
    ctx.strokeStyle = "#143d58";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    for (const [a, b] of paresDivididos) {
      const ra = mesasRender.find((r) => r.id === `mesa-${a.id}`);
      const rb = mesasRender.find((r) => r.id === `mesa-${b.id}`);
      if (!ra || !rb) continue;
      ctx.beginPath();
      ctx.moveTo(ra.x + ra.ancho / 2, ra.y + ra.alto / 2);
      ctx.lineTo(rb.x + rb.ancho / 2, rb.y + rb.alto / 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Mesas: mismos colores que la leyenda de pantalla (ver más abajo en el
    // JSX), pero como literales fijos — el PDF sale siempre en modo claro.
    // Mesa + sillitas se dibujan centradas y rotadas como un solo bloque
    // (ctx.save/translate/rotate/restore), igual que el <g> del SVG en
    // pantalla (ver MesaCaja) — así el PDF respeta mesa.rotacion. El texto
    // (código/capacidad), el puntito de "pedida" y el cartel de la reserva
    // quedan A PROPÓSITO fuera de esa rotación, para que sigan siendo
    // legibles sin importar cómo esté rotada la mesa (mismo criterio que en
    // pantalla, donde esas etiquetas viven fuera del <svg> rotado).
    for (const mesa of mesasVisibles) {
      const inicial =
        mesa.posX !== null && mesa.posY !== null ? { x: mesa.posX, y: mesa.posY } : posicionPorDefecto(mesa.orden);
      const dim = dimensionesPorCapacidad(mesa.capacidad, mesa.forma);
      const ocupada = ocupadas.has(mesa.id);
      const walkIn = walkIns.has(mesa.id);
      const pedida = pedidas.has(mesa.id);
      const dividida = mesa.mesaPadreId !== null;
      const relleno = ocupada ? "#c00000" : walkIn ? "#8f5ad1" : "#dae1e6";
      const borde = ocupada ? "#c00000" : walkIn ? "#8f5ad1" : "#c8d2da";
      const divisor = ocupada || walkIn ? "rgba(255,255,255,0.55)" : "#c8d2da";
      const colorTexto = ocupada || walkIn ? "#ffffff" : "#13242e";
      const cx = inicial.x + dim.ancho / 2;
      const cy = inicial.y + dim.alto / 2;
      const sillas = dim.esPar
        ? sillasParUnido(dim.ancho, dim.ladoPar, mesa.capacidad)
        : mesa.forma === "redonda"
          ? sillasRedonda(dim.ancho / 2, mesa.capacidad)
          : sillasRectangulo(dim.ancho, dim.alto, mesa.capacidad);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((mesa.rotacion * Math.PI) / 180);
      for (const silla of sillas) dibujarSilla(ctx, silla);
      if (dim.esPar) {
        trazarMesaPar(ctx, dim.ancho, dim.alto, dim.ladoPar, dim.numCuadrados, relleno, borde, divisor, dividida);
      } else if (mesa.forma === "redonda") {
        trazarMesaRedonda(ctx, dim.ancho, dim.alto, relleno, borde, dividida);
      } else {
        trazarMesaCuadrada(ctx, dim.ancho, relleno, borde, dividida);
      }
      ctx.restore();

      // Código/capacidad centrados sobre TODA la mesa (fila completa de
      // cuadrados incluida, no sobre un cuadrado en particular) — mismo
      // criterio que en pantalla, donde estas dos etiquetas viven afuera del
      // <svg> y quedan centradas por flexbox sobre la caja entera sin
      // importar si es esPar o no (ver el <span> de mesa.codigo en MesaCaja).
      ctx.fillStyle = colorTexto;
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(mesa.codigo, inicial.x + dim.ancho / 2, inicial.y + dim.alto / 2 - 6);
      ctx.font = "9px sans-serif";
      ctx.fillText(`${mesa.capacidad}p`, inicial.x + dim.ancho / 2, inicial.y + dim.alto / 2 + 8);
      if (pedida) dibujarPuntoPedida(ctx, inicial.x + dim.ancho - 4, inicial.y + 4);

      const reserva = reservaPorMesaId.get(mesa.id);
      if (reserva) {
        ctx.fillStyle = "#13242e";
        ctx.font = "9px sans-serif";
        ctx.textBaseline = "top";
        const texto = `${reserva.nombre || "Sin nombre"}${reserva.hora ? ` · ${reserva.hora}` : ""}`;
        ctx.fillText(texto, inicial.x + dim.ancho / 2, inicial.y + dim.alto + 4, dim.ancho + 40);
        ctx.textBaseline = "middle";
      }
    }

    return canvas;
  }

  // Exporta el plano completo (todo el lienzo, no solo lo que se ve con el
  // scroll actual) como un PDF de una página — pensado para tenerlo impreso
  // como referencia para personal nuevo.
  //
  // A propósito NO usa html2canvas (capturar el DOM tal cual se ve en
  // pantalla): esta app usa Tailwind v4, que compila cualquier utilidad de
  // opacidad con "/" (ej. "bg-superficie/90", el fondo del cartelito con el
  // nombre de la reserva) a un color-mix(...) en CSS — una función de color
  // moderna que html2canvas (una librería vieja, sin actualizar para eso) no
  // sabe interpretar, y tira error apenas encuentra una. En vez de andar
  // esquivando esa combinación en cada clase nueva que se agregue a futuro,
  // el plano para el PDF se dibuja a mano en un <canvas> propio (ver
  // construirCanvasPlano) a partir de los mismos datos que ya se usan para
  // pintarlo en pantalla — sin tocar el DOM ni sus estilos, así que este
  // problema no puede volver a aparecer.
  async function exportarPdf() {
    if (exportando) return;
    setExportando(true);
    try {
      const canvasPlano = construirCanvasPlano();
      const { jsPDF } = await import("jspdf");

      // Página A4 real (no un tamaño a medida de la imagen, que es lo que
      // hacía que al imprimir saliera gigante o cortado): todo lo demás se
      // calcula para que la imagen ENTRE adentro de esta hoja, no al revés.
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const anchoPagina = doc.internal.pageSize.getWidth();
      const altoPagina = doc.internal.pageSize.getHeight();
      const margen = 10;
      const alturaEncabezado = 14;
      const alturaLeyenda = 8;

      const turnoTexto = turno === "almuerzo" ? "Almuerzo" : turno === "merienda" ? "Merienda" : "Cena";
      doc.setFontSize(14);
      doc.setTextColor(20);
      doc.text(salonNombre ? `Plano del salón — ${salonNombre}` : "Plano del salón", margen, margen + 4);
      doc.setFontSize(9);
      doc.setTextColor(110);
      doc.text(`${formatFechaLarga(fecha)} · ${turnoTexto}`, margen, margen + 9);

      // Espacio disponible para la imagen, entre el encabezado y la
      // leyenda de abajo: la imagen se escala para entrar ahí completa
      // (proporción 1600x1000 preservada — "contain", no la deforma) y
      // queda centrada tanto horizontal como verticalmente en ese espacio.
      const cajaAncho = anchoPagina - margen * 2;
      const cajaAlto = altoPagina - margen * 2 - alturaEncabezado - alturaLeyenda;
      const relacionImagen = canvasPlano.width / canvasPlano.height;
      let anchoImagen = cajaAncho;
      let altoImagen = anchoImagen / relacionImagen;
      if (altoImagen > cajaAlto) {
        altoImagen = cajaAlto;
        anchoImagen = altoImagen * relacionImagen;
      }
      const xImagen = margen + (cajaAncho - anchoImagen) / 2;
      const yImagen = margen + alturaEncabezado + (cajaAlto - altoImagen) / 2;

      doc.addImage(canvasPlano.toDataURL("image/png"), "PNG", xImagen, yImagen, anchoImagen, altoImagen);

      // Referencia rápida, mismos colores que la leyenda de pantalla —
      // siempre pegada al pie de la hoja (no depende de la altura real de
      // la imagen, que puede quedar más baja que la caja si el salón es más
      // "cuadrado" que 1.6:1).
      const yLeyenda = margen + alturaEncabezado + cajaAlto + 6;
      let xLeyenda = margen;
      doc.setFontSize(8);
      for (const [color, etiqueta] of [
        ["#dae1e6", "Libre"],
        ["#c00000", "Ocupada"],
        ["#8f5ad1", "Walk-in"],
        ["#9c7a3c", "Cartel de referencia"],
      ] as const) {
        doc.setFillColor(color);
        doc.roundedRect(xLeyenda, yLeyenda - 3, 3, 3, 0.8, 0.8, "F");
        doc.setTextColor(60);
        doc.text(etiqueta, xLeyenda + 4.5, yLeyenda);
        xLeyenda += doc.getTextWidth(etiqueta) + 14;
      }

      // doc.save(...) de jsPDF, en algunos navegadores, termina abriendo el
      // PDF en una pestaña nueva en vez de descargarlo (depende de cómo esa
      // versión arme el link interno) — forzando la descarga a mano con un
      // <a download> sobre un blob: URL (en vez de la data: URL que usa
      // jsPDF por dentro) es el método que los navegadores sí respetan
      // siempre como "guardar archivo" en vez de "previsualizar".
      const blobPdf = doc.output("blob");
      const url = URL.createObjectURL(blobPdf);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = `plano-salon-${fecha}-${turno}.pdf`;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo exportar el plano a PDF");
    } finally {
      setExportando(false);
    }
  }

  async function onAgregarElemento(etiqueta: string) {
    try {
      // Arranca a la derecha de la grilla de mesas (no encima de la mesa
      // "10", que es donde cae la posicion por defecto de la primera mesa),
      // en una columna propia que va bajando con cada cartel nuevo.
      const columnaCarteles = MARGEN + COLUMNAS * ESPACIADO + 40;
      const offset = (elementosDelSalon.length % 8) * 70;
      setElementos(await crearElementoPlano(etiqueta, columnaCarteles, MARGEN + offset, salonId));
    } catch {
      setError("No se pudo agregar el cartel");
    }
  }

  async function onMoverElemento(elemento: ElementoPlano, posX: number, posY: number) {
    try {
      setElementos(await patchElementoPlano(elemento.id, { posX, posY }));
    } catch {
      setError("No se pudo mover el cartel");
    }
  }

  async function onRedimensionarElemento(elemento: ElementoPlano, ancho: number, alto: number) {
    try {
      setElementos(await patchElementoPlano(elemento.id, { ancho, alto }));
    } catch {
      setError("No se pudo redimensionar el cartel");
    }
  }

  async function onRenombrarElemento(elemento: ElementoPlano, etiqueta: string) {
    if (etiqueta === elemento.etiqueta) return;
    try {
      setElementos(await patchElementoPlano(elemento.id, { etiqueta }));
    } catch {
      setError("No se pudo renombrar el cartel");
    }
  }

  async function onBorrarElemento(elemento: ElementoPlano) {
    try {
      setElementos(await borrarElementoPlano(elemento.id));
    } catch {
      setError("No se pudo borrar el cartel");
    }
  }

  function onClickMesa(mesa: Mesa) {
    if (!soloLectura) return;
    const reserva = reservaPorMesaId.get(mesa.id);
    if (reserva) setReservaDetalle(reserva);
  }

  const mesaSeleccionada = !soloLectura ? (mesasVisibles.find((m) => m.id === mesaSeleccionadaId) ?? null) : null;
  const rectSeleccionada = mesaSeleccionada
    ? (mesasRender.find((r) => r.id === `mesa-${mesaSeleccionada.id}`) ?? null)
    : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <DateNav
          fecha={fecha}
          titulo={formatFechaLarga(fecha)}
          esHoy={fecha === todayISO()}
          onPrev={() => setFecha((f) => addDays(f, -1))}
          onNext={() => setFecha((f) => addDays(f, 1))}
          onHoy={() => setFecha(todayISO())}
          onFecha={setFecha}
        />
        <TurnoToggle turno={turno} onCambiar={setTurno} permiteMerienda={permiteMerienda} />
      </div>

      {error && (
        <div className="mb-3 rounded-xl bg-ocupada-suave px-4 py-2.5 text-sm text-ocupada">{error}</div>
      )}

      <p className="mb-2 text-xs text-tinta-suave">
        {soloLectura
          ? "El color de cada mesa muestra si ya tiene una reserva asignada en el día y turno elegidos arriba. Click en una mesa ocupada para ver el detalle de la reserva."
          : "Arrastrá cada mesa para acomodar el plano como está el salón de verdad (se ajusta solo a la grilla y a las demás mesas). Al seleccionar una mesa podés elegir si es redonda o cuadrada, y también moverla de a poco con las flechas del teclado. El color muestra si esa mesa ya tiene una reserva asignada en el día y turno elegidos arriba."}
      </p>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {!soloLectura ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-tinta-suave">Agregar cartel de referencia:</span>
            {ETIQUETAS_RAPIDAS.map((etiqueta) => (
              <button
                key={etiqueta}
                onClick={() => onAgregarElemento(etiqueta)}
                className="rounded-md border border-dashed border-referencia px-2 py-1 text-referencia hover:bg-referencia-suave"
              >
                + {etiqueta}
              </button>
            ))}
            <button
              onClick={() => onAgregarElemento("Nuevo")}
              className="rounded-md border border-dashed border-referencia px-2 py-1 text-referencia hover:bg-referencia-suave"
            >
              + Otro…
            </button>
          </div>
        ) : (
          <span />
        )}

        <form onSubmit={onBuscarSubmit} className="relative flex items-center gap-1.5 text-xs">
          <span className="text-tinta-suave">Buscar mesa:</span>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="ej: 11b"
            className="w-24 rounded-md border border-borde px-2 py-1 text-xs"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda("")}
              title="Limpiar búsqueda"
              className="text-tinta-suave hover:text-tinta"
            >
              ×
            </button>
          )}
          {coincidencias.length > 0 && (
            <div className="absolute top-full left-0 z-30 mt-1 max-h-48 w-40 overflow-auto rounded-lg border border-borde bg-superficie shadow-lg">
              {coincidencias.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    centrarEnMesa(m.id);
                    setBusqueda("");
                  }}
                  className="block w-full px-2.5 py-1.5 text-left text-xs hover:bg-arena-suave"
                >
                  Mesa {m.codigo} <span className="text-tinta-suave">· {m.capacidad}p</span>
                </button>
              ))}
            </div>
          )}
        </form>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-tinta-suave">Zoom:</span>
            <button
              onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_PASO) * 100) / 100))}
              disabled={zoom <= ZOOM_MIN}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-borde hover:bg-arena-suave disabled:cursor-not-allowed disabled:opacity-30"
              title="Alejar"
            >
              −
            </button>
            <span className="w-10 text-center text-tinta-suave">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_PASO) * 100) / 100))}
              disabled={zoom >= ZOOM_MAX}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-borde hover:bg-arena-suave disabled:cursor-not-allowed disabled:opacity-30"
              title="Acercar"
            >
              +
            </button>
            {zoom !== ZOOM_DEFAULT && (
              <button onClick={() => setZoom(ZOOM_DEFAULT)} className="ml-0.5 text-tinta-suave underline">
                Restablecer
              </button>
            )}
            <button
              onClick={ajustarZoomAlContenedor}
              title="Ajustar el zoom para que entre todo el salón sin scrollear"
              className="ml-0.5 rounded-md border border-borde px-2 py-1 text-[11px] hover:bg-arena-suave"
            >
              Ajustar a pantalla
            </button>
          </div>

          <button
            onClick={exportarPdf}
            disabled={exportando}
            title="Exportar el plano completo a PDF (útil como referencia impresa para personal nuevo)"
            className="rounded-md border border-borde px-2.5 py-1 text-xs hover:bg-arena-suave disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exportando ? "Generando…" : "Exportar PDF"}
          </button>
        </div>
      </div>

      <div
          ref={scrollRef}
          className="relative overflow-auto rounded-2xl border border-borde"
          style={{
            height: "min(78vh, 760px)",
            backgroundColor: "var(--color-fondo)",
            backgroundImage: "radial-gradient(var(--color-borde) 1px, transparent 1px)",
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          }}
        >
        <div
          className="relative"
          style={{ width: LIENZO_ANCHO * zoom, height: LIENZO_ALTO * zoom }}
        >
          <div
            className="absolute top-0 left-0"
            style={{ width: LIENZO_ANCHO, height: LIENZO_ALTO, transform: `scale(${zoom})`, transformOrigin: "top left" }}
            onClick={(e) => {
              // Click en el fondo vacío del lienzo (no en una mesa ni en un
              // cartel): deselecciona, así se cierra el selector de forma.
              if (e.target === e.currentTarget) setMesaSeleccionadaId(null);
            }}
          >
            {/* Conectores entre mesas divididas: una línea punteada entre el
                centro de cada mitad, para que se note de un vistazo que "52a"
                y "52b" son la misma mesa base partida en dos. */}
            <svg
              className="pointer-events-none absolute top-0 left-0"
              width={LIENZO_ANCHO}
              height={LIENZO_ALTO}
              style={{ overflow: "visible" }}
            >
              {paresDivididos.map(([a, b]) => {
                const ra = mesasRender.find((r) => r.id === `mesa-${a.id}`);
                const rb = mesasRender.find((r) => r.id === `mesa-${b.id}`);
                if (!ra || !rb) return null;
                return (
                  <line
                    key={`${a.id}-${b.id}`}
                    x1={ra.x + ra.ancho / 2}
                    y1={ra.y + ra.alto / 2}
                    x2={rb.x + rb.ancho / 2}
                    y2={rb.y + rb.alto / 2}
                    stroke="var(--color-arena)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    opacity={0.7}
                  />
                );
              })}
            </svg>

            {/* Líneas guía de alineación (estilo Figma): aparecen mientras se
                arrastra una mesa o cartel y desaparecen al soltar. */}
            {guiaActiva.v !== null && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 border-l border-dashed"
                style={{ left: guiaActiva.v, borderColor: "var(--color-ocupada)" }}
              />
            )}
            {guiaActiva.h !== null && (
              <div
                className="pointer-events-none absolute top-0 right-0 left-0 border-t border-dashed"
                style={{ top: guiaActiva.h, borderColor: "var(--color-ocupada)" }}
              />
            )}

            {mesasVisibles.map((mesa) => {
              const inicial =
                mesa.posX !== null && mesa.posY !== null
                  ? { x: mesa.posX, y: mesa.posY }
                  : posicionPorDefecto(mesa.orden);
              const reserva = reservaPorMesaId.get(mesa.id);
              return (
                <MesaCaja
                  key={mesa.id}
                  mesa={mesa}
                  x={inicial.x}
                  y={inicial.y}
                  ocupada={ocupadas.has(mesa.id)}
                  walkIn={walkIns.has(mesa.id)}
                  pedida={pedidas.has(mesa.id)}
                  dividida={mesa.mesaPadreId !== null}
                  seleccionada={mesa.id === mesaSeleccionadaId}
                  resaltada={mesa.id === mesaResaltadaId}
                  reserva={reserva ?? null}
                  onMover={onMoverMesa}
                  onClickMesa={onClickMesa}
                  onSeleccionar={() => setMesaSeleccionadaId(mesa.id)}
                  soloLectura={soloLectura}
                  zoom={zoom}
                  referencias={mesasRender}
                  onGuia={setGuiaActiva}
                />
              );
            })}
            {elementosDelSalon.map((elemento) =>
              soloLectura ? (
                <div
                  key={elemento.id}
                  className="absolute flex items-center justify-center rounded-lg border-2 border-dashed border-referencia bg-referencia-suave/80 p-1 text-center text-[11px] font-medium text-referencia"
                  style={{ left: elemento.posX, top: elemento.posY, width: elemento.ancho, height: elemento.alto }}
                >
                  <span className="truncate">{elemento.etiqueta}</span>
                </div>
              ) : (
                <ElementoCaja
                  key={elemento.id}
                  elemento={elemento}
                  onMover={onMoverElemento}
                  onRedimensionar={onRedimensionarElemento}
                  onRenombrar={onRenombrarElemento}
                  onBorrar={onBorrarElemento}
                  zoom={zoom}
                  referencias={mesasRender}
                  onGuia={setGuiaActiva}
                />
              ),
            )}

            {mesaSeleccionada && rectSeleccionada && onCambiarForma && (
              <SelectorForma
                mesa={mesaSeleccionada}
                rect={rectSeleccionada}
                onElegir={(forma) => onCambiarForma(mesaSeleccionada, forma)}
                onFijar={onFijar ? (fijada) => onFijar(mesaSeleccionada, fijada) : undefined}
                onRotar={onRotar ? (rotacion) => onRotar(mesaSeleccionada, rotacion) : undefined}
                onCerrar={() => setMesaSeleccionadaId(null)}
              />
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3.5 text-[11px] text-tinta-suave">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-full border border-borde bg-libre" />
          Libre
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-full bg-ocupada" />
          Ocupada
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-full bg-walkin" />
          Walk-in
        </span>
        <span className="inline-flex items-center gap-1.5">
                    <i className="anillo-pedida inline-block h-2.5 w-2.5 rounded-full border border-borde bg-libre" />
          Pedida
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-3 rounded-sm border border-dashed border-arena" />
          Mesa dividida
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-referencia bg-referencia-suave" />
          Cartel de referencia
        </span>
      </div>

      {reservaDetalle && (
        <DetalleReservaModal reserva={reservaDetalle} onCerrar={() => setReservaDetalle(null)} />
      )}
    </div>
  );
}

interface DetalleReservaModalProps {
  reserva: Reserva;
  onCerrar: () => void;
}

// Popup de detalle al hacer click en una mesa ocupada (solo en modo lectura,
// /plano): junta lo esencial de la reserva sin tener que ir hasta la grilla
// de reservas.
function DetalleReservaModal({ reserva, onCerrar }: DetalleReservaModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-borde bg-superficie p-5 shadow-lg"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-base font-bold text-tinta">{reserva.nombre || "Sin nombre"}</h3>
          <button
            onClick={onCerrar}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-tinta-suave hover:bg-arena-suave hover:text-tinta"
            title="Cerrar"
          >
            ×
          </button>
        </div>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-tinta-suave">Hora</dt>
            <dd className="font-medium text-tinta">{reserva.hora ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-tinta-suave">Mesa(s)</dt>
            <dd className="font-medium text-tinta">{reserva.mesaCodigos.join(", ") || "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-tinta-suave">Pax</dt>
            <dd className="font-medium text-tinta">{reserva.pax ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-tinta-suave">Hab./Tel.</dt>
            <dd className="font-medium text-tinta">{reserva.habTel || "—"}</dd>
          </div>
          {reserva.comentarios && (
            <div className="pt-1.5">
              <dt className="mb-0.5 text-tinta-suave">Comentarios</dt>
              <dd className="text-tinta">{reserva.comentarios}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

interface SelectorFormaProps {
  mesa: Mesa;
  rect: RectRender;
  onElegir: (forma: "redonda" | "cuadrada") => void;
  // Opcional: si no viene, no se muestra el botón de fijar/desfijar (mismo
  // criterio que onCambiarForma en el componente padre).
  onFijar?: (fijada: boolean) => void;
  // Opcional: si no viene, no se muestra el botón de rotar (mismo criterio
  // que onFijar).
  onRotar?: (rotacion: number) => void;
  onCerrar: () => void;
}

// Selector flotante que aparece pegado a la mesa recién seleccionada (modo
// edición del plano): elegir Redonda o Cuadrada la guarda al toque, y
// Fijar/Desfijar bloquea o libera el arrastre de esta mesa (ver
// MesaCaja.onPointerDown más abajo). Vive en el mismo sistema de
// coordenadas que las mesas (dentro del lienzo escalado por el zoom), así
// que se mueve y escala junto con el plano.
function SelectorForma({ mesa, rect, onElegir, onFijar, onRotar, onCerrar }: SelectorFormaProps) {
  const arriba = rect.y > 44;
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute z-10 flex items-center gap-1 rounded-lg border border-borde bg-superficie px-1.5 py-1 shadow-lg"
      style={{
        left: rect.x + rect.ancho / 2,
        top: arriba ? rect.y - 8 : rect.y + rect.alto + 8,
        transform: `translate(-50%, ${arriba ? "-100%" : "0"})`,
      }}
    >
      <span className="pr-0.5 text-[10px] font-medium text-tinta-suave">Mesa {mesa.codigo}:</span>
      <button
        onClick={() => onElegir("redonda")}
        aria-pressed={mesa.forma === "redonda"}
        className={`rounded-md border px-2 py-1 text-[11px] font-medium ${
          mesa.forma === "redonda"
            ? "border-marca bg-marca text-white"
            : "border-borde text-tinta-suave hover:bg-arena-suave"
        }`}
      >
        ● Redonda
      </button>
      <button
        onClick={() => onElegir("cuadrada")}
        aria-pressed={mesa.forma === "cuadrada"}
        className={`rounded-md border px-2 py-1 text-[11px] font-medium ${
          mesa.forma === "cuadrada"
            ? "border-marca bg-marca text-white"
            : "border-borde text-tinta-suave hover:bg-arena-suave"
        }`}
      >
        ■ Cuadrada
      </button>
      {onFijar && (
        <button
          onClick={() => onFijar(!mesa.fijada)}
          aria-pressed={mesa.fijada}
          title={mesa.fijada ? "Desfijar mesa (permitir arrastrarla)" : "Fijar mesa (bloquear el arrastre)"}
          className={`rounded-md border px-2 py-1 text-[11px] font-medium ${
            mesa.fijada
              ? "border-marca bg-marca text-white"
              : "border-borde text-tinta-suave hover:bg-arena-suave"
          }`}
        >
          {mesa.fijada ? "Fijada" : "Fijar"}
        </button>
      )}
      {onRotar && (
        <button
          onClick={() => onRotar((mesa.rotacion + 90) % 360)}
          title="Rotar el dibujo de esta mesa 90°"
          className="rounded-md border border-borde px-2 py-1 text-[11px] font-medium text-tinta-suave hover:bg-arena-suave"
        >
          ⟳ Rotar
        </button>
      )}
      <button
        onClick={onCerrar}
        title="Cerrar"
        className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-tinta-suave hover:bg-arena-suave hover:text-tinta"
      >
        ×
      </button>
    </div>
  );
}

interface MesaCajaProps {
  mesa: Mesa;
  x: number;
  y: number;
  ocupada: boolean;
  walkIn: boolean;
  pedida: boolean;
  dividida: boolean;
  seleccionada: boolean;
  // Mesa recién encontrada con "Buscar mesa" (ver centrarEnMesa en
  // PlanoSalon): pinta un anillo distinto (aviso/dorado) durante unos
  // segundos, independiente de "seleccionada" — se puede resaltar una mesa
  // sin necesariamente seleccionarla para editarla.
  resaltada?: boolean;
  reserva: Reserva | null;
  onMover: (mesa: Mesa, posX: number, posY: number) => void;
  onClickMesa: (mesa: Mesa) => void;
  onSeleccionar: () => void;
  soloLectura?: boolean;
  zoom: number;
  referencias: RectRender[];
  onGuia: (guia: Guia) => void;
}

function MesaCaja({
  mesa,
  x,
  y,
  ocupada,
  walkIn,
  pedida,
  dividida,
  seleccionada,
  resaltada = false,
  reserva,
  onMover,
  onClickMesa,
  onSeleccionar,
  soloLectura = false,
  zoom,
  referencias,
  onGuia,
}: MesaCajaProps) {
  const { ancho, alto, esPar, ladoPar, numCuadrados } = dimensionesPorCapacidad(mesa.capacidad, mesa.forma);
  const [pos, setPos] = useState({ x, y });
  const [arrastrando, setArrastrando] = useState(false);
  const offset = useRef({ dx: 0, dy: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincroniza con la posicion "oficial" (prop) cuando cambia por afuera —
  // otra persona movio esta mesa, o volvio el broadcast del propio guardado
  // — pero nunca mientras se la esta arrastrando, para no pelearle al mouse.
  useEffect(() => {
    if (!arrastrando) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPos({ x, y });
    }
  }, [x, y, arrastrando]);

  useEffect(() => () => {
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // En modo lectura no hay arrastre: el click (más abajo, onClick) es el
    // que abre el detalle de la reserva. Una mesa fijada tampoco arranca el
    // arrastre (ver SelectorForma) — pero sigue dejando hacer click simple
    // para seleccionarla y poder desfijarla desde ahí (ver onPointerUp, que
    // no depende de que haya arrancado el arrastre).
    if (soloLectura || mesa.fijada) return;
    const rect = ref.current!.getBoundingClientRect();
    offset.current = { dx: (e.clientX - rect.left) / zoom, dy: (e.clientY - rect.top) / zoom };
    ref.current!.setPointerCapture(e.pointerId);
    setArrastrando(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrastrando || soloLectura) return;
    const contenedor = ref.current!.offsetParent as HTMLElement | null;
    if (!contenedor) return;
    const rect = contenedor.getBoundingClientRect();
    const crudoX = Math.max(0, (e.clientX - rect.left) / zoom - offset.current.dx);
    const crudoY = Math.max(0, (e.clientY - rect.top) / zoom - offset.current.dy);
    const snap = calcularSnap(crudoX, crudoY, ancho, alto, `mesa-${mesa.id}`, referencias);
    setPos({ x: snap.x, y: snap.y });
    onGuia(snap.guia);
  }

  function onPointerUp() {
    if (soloLectura) return;
    setArrastrando(false);
    onGuia({ v: null, h: null });
    const redondeada = { x: Math.round(pos.x), y: Math.round(pos.y) };
    if (redondeada.x !== Math.round(x) || redondeada.y !== Math.round(y)) {
      onMover(mesa, redondeada.x, redondeada.y);
    }
    // Click o arrastre, cualquiera de los dos "selecciona" la mesa: ahí
    // aparece el selector de forma (ver SelectorForma, en PlanoSalon).
    onSeleccionar();
  }

  // Flechas del teclado: nudge fino (4px, 20px con Shift) cuando la mesa
  // tiene el foco — el commit al backend se debounce un rato después del
  // último toque de flecha, para no mandar un PATCH por cada pixel.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (soloLectura) return;
    const paso = e.shiftKey ? 20 : 4;
    let dx = 0;
    let dy = 0;
    if (e.key === "ArrowLeft") dx = -paso;
    else if (e.key === "ArrowRight") dx = paso;
    else if (e.key === "ArrowUp") dy = -paso;
    else if (e.key === "ArrowDown") dy = paso;
    else return;
    e.preventDefault();
    setPos((prev) => {
      const nuevo = { x: Math.max(0, prev.x + dx), y: Math.max(0, prev.y + dy) };
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
      nudgeTimer.current = setTimeout(() => {
        const redondeada = { x: Math.round(nuevo.x), y: Math.round(nuevo.y) };
        onMover(mesa, redondeada.x, redondeada.y);
      }, 500);
      return nuevo;
    });
  }

  const estado = ocupada
    ? `ocupada${pedida ? ", pedida puntualmente" : ""}`
    : walkIn
      ? "ocupada por un walk-in"
      : "libre";

  // Reemplaza al viejo colorClase (clases de Tailwind sobre un <div> con
  // fondo/borde propios): ahora el "cuerpo" de la mesa lo dibuja el <svg> de
  // abajo, así que estos son los mismos tres estados pero como valores CSS
  // para fill/stroke/texto.
  const colorMesa = ocupada
    ? { fill: "var(--color-ocupada)", stroke: "var(--color-ocupada)", texto: "#ffffff", divisor: "rgba(255,255,255,0.55)" }
    : walkIn
      ? { fill: "var(--color-walkin)", stroke: "var(--color-walkin)", texto: "#ffffff", divisor: "rgba(255,255,255,0.55)" }
      : { fill: "var(--color-libre)", stroke: "var(--color-borde)", texto: "var(--color-tinta)", divisor: "var(--color-borde)" };

  const anilloSeleccion = seleccionada && !soloLectura ? { boxShadow: "0 0 0 3px var(--color-marca)" } : undefined;
  // Anillo de "recién encontrada" (ver Buscar mesa en PlanoSalon): independiente
  // de la selección de edición, así que se ve tanto en modo lectura (/plano)
  // como en modo edición (/admin/mesas).
  const anilloResaltado = resaltada ? { boxShadow: "0 0 0 4px var(--color-aviso)" } : undefined;

  // Sillitas alrededor de la mesa (ver bloque "Sillitas alrededor de la
  // mesa" más arriba en este archivo) — geometría fija por forma/capacidad,
  // se recalcula solo si esas dos cambian, no en cada frame de arrastre.
  const sillas = useMemo(() => {
    if (esPar) return sillasParUnido(ancho, ladoPar, mesa.capacidad);
    if (mesa.forma === "redonda") return sillasRedonda(ancho / 2, mesa.capacidad);
    return sillasRectangulo(ancho, alto, mesa.capacidad);
  }, [esPar, mesa.forma, mesa.capacidad, ancho, alto, ladoPar]);

  return (
    <>
      <div
        ref={ref}
        tabIndex={soloLectura ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        onClick={() => {
          if (soloLectura) onClickMesa(mesa);
        }}
        title={`Mesa ${mesa.codigo} — ${mesa.capacidad} pax — ${estado}${mesa.fijada ? " — fijada" : ""}`}
        className={`absolute touch-none flex flex-col items-center justify-center text-xs font-semibold select-none transition-shadow ${
          soloLectura
            ? reserva
              ? "cursor-pointer"
              : ""
            : mesa.fijada
              ? "cursor-default focus:outline-none"
              : "cursor-grab focus:outline-none active:cursor-grabbing"
        } ${pedida ? "anillo-pedida" : ""} ${resaltada ? "animate-pulse" : ""}`}
        style={{
          left: pos.x,
          top: pos.y,
          width: ancho,
          height: alto,
          ...anilloSeleccion,
          ...anilloResaltado,
        }}
      >
        {/* Mesa + sillitas: puramente decorativo (pointer-events-none), el
            área que se puede arrastrar/clickear sigue siendo exactamente la
            caja lógica (ancho x alto) de siempre — las sillas sobresalen
            visualmente pero no agrandan el "hitbox" de la mesa. */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute overflow-visible"
          style={{ left: -MARGEN_SILLAS, top: -MARGEN_SILLAS }}
          width={ancho + MARGEN_SILLAS * 2}
          height={alto + MARGEN_SILLAS * 2}
          viewBox={`0 0 ${ancho + MARGEN_SILLAS * 2} ${alto + MARGEN_SILLAS * 2}`}
        >
          <g
            transform={`translate(${ancho / 2 + MARGEN_SILLAS}, ${alto / 2 + MARGEN_SILLAS}) rotate(${mesa.rotacion})`}
          >
            {sillas.map((silla, i) => (
              <SillaSvg key={i} silla={silla} />
            ))}
            {esPar ? (
              <>
                {Array.from({ length: numCuadrados }, (_, i) => (
                  <rect
                    key={`cuadrado-${i}`}
                    x={-ancho / 2 + i * (ladoPar + GAP_PAR)}
                    y={-alto / 2}
                    width={ladoPar}
                    height={alto}
                    rx={10}
                    fill={colorMesa.fill}
                    stroke={colorMesa.stroke}
                    strokeWidth={2}
                    strokeDasharray={dividida ? "5 4" : undefined}
                  />
                ))}
                {Array.from({ length: numCuadrados - 1 }, (_, i) => {
                  const xDivisor = -ancho / 2 + i * (ladoPar + GAP_PAR) + ladoPar + GAP_PAR / 2;
                  return (
                    <line
                      key={`divisor-${i}`}
                      x1={xDivisor}
                      y1={-alto / 2 + 3}
                      x2={xDivisor}
                      y2={alto / 2 - 3}
                      stroke={colorMesa.divisor}
                      strokeWidth={1.5}
                      strokeDasharray="2 3"
                    />
                  );
                })}
              </>
            ) : mesa.forma === "redonda" ? (
              <circle
                r={ancho / 2}
                fill={colorMesa.fill}
                stroke={colorMesa.stroke}
                strokeWidth={2}
                strokeDasharray={dividida ? "5 4" : undefined}
              />
            ) : (
              <rect
                x={-ancho / 2}
                y={-alto / 2}
                width={ancho}
                height={alto}
                rx={12}
                fill={colorMesa.fill}
                stroke={colorMesa.stroke}
                strokeWidth={2}
                strokeDasharray={dividida ? "5 4" : undefined}
              />
            )}
          </g>
        </svg>
        <span className="relative" style={{ color: colorMesa.texto }}>
          {mesa.codigo}
        </span>
        <span className="relative text-[9px] font-normal opacity-75" style={{ color: colorMesa.texto }}>
          {mesa.capacidad}p
        </span>
        {pedida && <span className="chip-pedida" aria-hidden="true" />}
      </div>
      {reserva && (
        <div
          className="pointer-events-none absolute truncate rounded-md bg-superficie/90 px-1.5 py-0.5 text-center text-[10px] leading-tight font-medium text-tinta shadow-sm"
          style={{ left: pos.x - 10, top: pos.y + alto + MARGEN_SILLAS + 3, width: ancho + 20 }}
        >
          {reserva.nombre || "Sin nombre"}
          {reserva.hora ? ` · ${reserva.hora}` : ""}
        </div>
      )}
    </>
  );
}

interface ElementoCajaProps {
  elemento: ElementoPlano;
  onMover: (elemento: ElementoPlano, posX: number, posY: number) => void;
  onRedimensionar: (elemento: ElementoPlano, ancho: number, alto: number) => void;
  onRenombrar: (elemento: ElementoPlano, etiqueta: string) => void;
  onBorrar: (elemento: ElementoPlano) => void;
  zoom: number;
  referencias: RectRender[];
  onGuia: (guia: Guia) => void;
}

// Cartel de referencia (Ventana, Cocina, Bodega, Isla, Mueble, etc.): se
// arrastra igual que una mesa, pero ademas se puede renombrar (el texto es
// un input siempre editable) y redimensionar con la manija de la esquina.
function ElementoCaja({
  elemento,
  onMover,
  onRedimensionar,
  onRenombrar,
  onBorrar,
  zoom,
  referencias,
  onGuia,
}: ElementoCajaProps) {
  const [pos, setPos] = useState({ x: elemento.posX, y: elemento.posY });
  const [tamano, setTamano] = useState({ ancho: elemento.ancho, alto: elemento.alto });
  const [arrastrando, setArrastrando] = useState(false);
  const [redimensionando, setRedimensionando] = useState(false);
  const [etiqueta, setEtiqueta] = useState(elemento.etiqueta);
  const offset = useRef({ dx: 0, dy: 0 });
  const inicioRedimension = useRef({ ancho: 0, alto: 0, clientX: 0, clientY: 0 });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!arrastrando) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPos({ x: elemento.posX, y: elemento.posY });
    }
  }, [elemento.posX, elemento.posY, arrastrando]);

  useEffect(() => {
    if (!redimensionando) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTamano({ ancho: elemento.ancho, alto: elemento.alto });
    }
  }, [elemento.ancho, elemento.alto, redimensionando]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setEtiqueta(elemento.etiqueta), [elemento.etiqueta]);

  function onPointerDownMover(e: React.PointerEvent<HTMLDivElement>) {
    const rect = ref.current!.getBoundingClientRect();
    offset.current = { dx: (e.clientX - rect.left) / zoom, dy: (e.clientY - rect.top) / zoom };
    ref.current!.setPointerCapture(e.pointerId);
    setArrastrando(true);
  }

  function onPointerMoveMover(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrastrando) return;
    const contenedor = ref.current!.offsetParent as HTMLElement | null;
    if (!contenedor) return;
    const rect = contenedor.getBoundingClientRect();
    const crudoX = Math.max(0, (e.clientX - rect.left) / zoom - offset.current.dx);
    const crudoY = Math.max(0, (e.clientY - rect.top) / zoom - offset.current.dy);
    const snap = calcularSnap(crudoX, crudoY, tamano.ancho, tamano.alto, `elemento-${elemento.id}`, referencias);
    setPos({ x: snap.x, y: snap.y });
    onGuia(snap.guia);
  }

  function onPointerUpMover() {
    setArrastrando(false);
    onGuia({ v: null, h: null });
    const redondeada = { x: Math.round(pos.x), y: Math.round(pos.y) };
    if (redondeada.x === Math.round(elemento.posX) && redondeada.y === Math.round(elemento.posY)) return;
    onMover(elemento, redondeada.x, redondeada.y);
  }

  function onPointerDownRedimensionar(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    (e.target as HTMLDivElement).setPointerCapture(e.pointerId);
    inicioRedimension.current = { ancho: tamano.ancho, alto: tamano.alto, clientX: e.clientX, clientY: e.clientY };
    setRedimensionando(true);
  }

  function onPointerMoveRedimensionar(e: React.PointerEvent<HTMLDivElement>) {
    if (!redimensionando) return;
    e.stopPropagation();
    const inicio = inicioRedimension.current;
    const nuevoAncho = Math.max(30, inicio.ancho + (e.clientX - inicio.clientX) / zoom);
    const nuevoAlto = Math.max(24, inicio.alto + (e.clientY - inicio.clientY) / zoom);
    setTamano({ ancho: nuevoAncho, alto: nuevoAlto });
  }

  function onPointerUpRedimensionar(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    setRedimensionando(false);
    const redondeado = { ancho: Math.round(tamano.ancho), alto: Math.round(tamano.alto) };
    if (redondeado.ancho === Math.round(elemento.ancho) && redondeado.alto === Math.round(elemento.alto)) return;
    onRedimensionar(elemento, redondeado.ancho, redondeado.alto);
  }

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDownMover}
      onPointerMove={onPointerMoveMover}
      onPointerUp={onPointerUpMover}
      className="group absolute flex cursor-grab touch-none flex-col items-stretch justify-center gap-0.5 rounded-lg border-2 border-dashed border-referencia bg-referencia-suave/80 p-1 text-center shadow-sm select-none active:cursor-grabbing"
      style={{ left: pos.x, top: pos.y, width: tamano.ancho, height: tamano.alto }}
    >
      <button
        title="Quitar cartel"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onBorrar(elemento)}
        className="absolute -top-2 -right-2 hidden h-4.5 w-4.5 items-center justify-center rounded-full border border-borde bg-superficie text-[10px] text-tinta-suave opacity-0 transition-opacity group-hover:flex group-hover:opacity-100 hover:text-ocupada"
      >
        ×
      </button>
      <input
        value={etiqueta}
        onChange={(e) => setEtiqueta(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        onBlur={() => onRenombrar(elemento, etiqueta.trim() || "Nuevo")}
                className="w-full truncate rounded border-none bg-transparent text-center text-[11px] font-medium text-tinta-suave focus:bg-superficie focus:outline-none"
      />
      <div
        onPointerDown={onPointerDownRedimensionar}
        onPointerMove={onPointerMoveRedimensionar}
        onPointerUp={onPointerUpRedimensionar}
        title="Arrastrá para cambiar el tamaño"
        className="absolute right-0 bottom-0 h-3 w-3 cursor-nwse-resize touch-none opacity-0 group-hover:opacity-100"
        style={{
          background:
            "linear-gradient(135deg, transparent 0 50%, var(--color-referencia) 50% 100%)",
        }}
      />
    </div>
  );
}
