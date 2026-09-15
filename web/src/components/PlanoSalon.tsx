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
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_PASO = 0.1;

function posicionPorDefecto(orden: number) {
  return {
    x: MARGEN + (orden % COLUMNAS) * ESPACIADO,
    y: MARGEN + Math.floor(orden / COLUMNAS) * ESPACIADO,
  };
}

// Tamaño y forma de cada mesa: la forma (redonda/cuadrada) la elige la
// persona a mano por mesa (ver mesa.forma, seleccionable desde el plano),
// no se deriva de la capacidad. La única excepción es una mesa CUADRADA de
// 4 pax: en el salón real esa es siempre la unión de dos mesas cuadradas de
// 2 pax pegadas, así que se dibuja como dos cuadrados en vez de uno solo
// más grande (esPar=true; ladoPar es el lado de cada cuadrado individual).
const GAP_PAR = 4;

interface Dimensiones {
  ancho: number;
  alto: number;
  esPar: boolean;
  ladoPar: number;
}

// Un único cálculo de tamaño por capacidad, reusado tanto para una mesa
// normal como para el lado de cada cuadrado del par (ver más abajo): así el
// par de una mesa cuadrada de 4 queda garantizado del MISMO tamaño que una
// mesa independiente de 2 pax, sin dos fórmulas separadas que se puedan
// desalinear con el tiempo.
function ladoDeCapacidad(capacidad: number) {
  return Math.min(96, Math.max(52, 36 + capacidad * 6));
}

function dimensionesPorCapacidad(capacidad: number, forma: "redonda" | "cuadrada"): Dimensiones {
  if (forma === "cuadrada" && capacidad === 4) {
    const lado = ladoDeCapacidad(2);
    return { ancho: lado * 2 + GAP_PAR, alto: lado, esPar: true, ladoPar: lado };
  }
  const base = ladoDeCapacidad(capacidad);
  return { ancho: base, alto: base, esPar: false, ladoPar: base };
}

function radioPorForma(forma: "redonda" | "cuadrada") {
  return forma === "redonda" ? "9999px" : "12px";
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
  soloLectura = false,
  fechaInicial,
  turnoInicial,
}: Props) {
  const [fecha, setFecha] = useState(fechaInicial ?? todayISO());
  const [turno, setTurno] = useState<Turno>(turnoInicial ?? "almuerzo");
  const [turnoData, setTurnoData] = useState<TurnoData | null>(null);
  const [elementos, setElementos] = useState<ElementoPlano[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [guiaActiva, setGuiaActiva] = useState<Guia>({ v: null, h: null });
  const [reservaDetalle, setReservaDetalle] = useState<Reserva | null>(null);
  // Mesa elegida en el plano (solo en modo edición): al seleccionarla
  // aparece el selector de forma (redonda/cuadrada) flotando junto a ella.
  const [mesaSeleccionadaId, setMesaSeleccionadaId] = useState<number | null>(null);
  const fechaRef = useRef(fecha);
  const turnoRef = useRef(turno);

  useEffect(() => {
    fechaRef.current = fecha;
  }, [fecha]);
  useEffect(() => {
    turnoRef.current = turno;
  }, [turno]);

  // Trae la ocupacion del turno elegido (para pintar rojo/verde). El plano
  // en si (posiciones/capacidades) ya viaja en `mesas`, esto es solo el
  // estado de las reservas de ese dia/turno/salon puntual.
  useEffect(() => {
    getDia(fecha, salonId)
      .then((dia) => setTurnoData(turno === "almuerzo" ? dia.almuerzo : dia.cena))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error cargando la ocupación"));
  }, [fecha, turno, salonId]);

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
  const mesasVisibles = useMemo(() => mesas.filter((m) => m.capacidad > 0), [mesas]);

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
        <TurnoToggle turno={turno} onCambiar={setTurno} />
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
          {zoom !== 1 && (
            <button onClick={() => setZoom(1)} className="ml-0.5 text-tinta-suave underline">
              Restablecer
            </button>
          )}
        </div>
      </div>

      <div
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
          <span aria-hidden="true">🔒</span>
          Mesa fijada
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
  onCerrar: () => void;
}

// Selector flotante que aparece pegado a la mesa recién seleccionada (modo
// edición del plano): elegir Redonda o Cuadrada la guarda al toque, y
// Fijar/Desfijar bloquea o libera el arrastre de esta mesa (ver
// MesaCaja.onPointerDown más abajo). Vive en el mismo sistema de
// coordenadas que las mesas (dentro del lienzo escalado por el zoom), así
// que se mueve y escala junto con el plano.
function SelectorForma({ mesa, rect, onElegir, onFijar, onCerrar }: SelectorFormaProps) {
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
  reserva,
  onMover,
  onClickMesa,
  onSeleccionar,
  soloLectura = false,
  zoom,
  referencias,
  onGuia,
}: MesaCajaProps) {
  const { ancho, alto, esPar, ladoPar } = dimensionesPorCapacidad(mesa.capacidad, mesa.forma);
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

  const colorClase = ocupada
    ? "border-ocupada bg-ocupada text-white"
    : walkIn
      ? "border-walkin bg-walkin text-white"
      : "border-borde bg-libre text-tinta";

  const estado = ocupada
    ? `ocupada${pedida ? ", pedida puntualmente" : ""}`
    : walkIn
      ? "ocupada por un walk-in"
      : "libre";

  const anilloSeleccion = seleccionada && !soloLectura ? { boxShadow: "0 0 0 3px var(--color-marca)" } : undefined;

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
        className={`absolute touch-none text-xs font-semibold shadow-md select-none transition-shadow ${
          soloLectura
            ? reserva
              ? "cursor-pointer"
              : ""
            : mesa.fijada
              ? "cursor-default focus:outline-none"
              : "cursor-grab focus:outline-none active:cursor-grabbing"
        } ${esPar ? "flex items-stretch" : `flex flex-col items-center justify-center border-2 ${colorClase} ${dividida ? "border-dashed" : ""}`} ${!esPar && pedida ? "anillo-pedida" : ""}`}
        style={{
          left: pos.x,
          top: pos.y,
          width: ancho,
          height: alto,
          gap: esPar ? GAP_PAR : undefined,
          borderRadius: esPar ? undefined : radioPorForma(mesa.forma),
          ...anilloSeleccion,
        }}
      >
        {esPar ? (
          <>
            {[0, 1].map((i) => (
              <div
                key={i}
                className={`relative flex flex-1 flex-col items-center justify-center border-2 ${colorClase} ${dividida ? "border-dashed" : ""} ${pedida ? "anillo-pedida" : ""}`}
                style={{ width: ladoPar, borderRadius: radioPorForma("cuadrada") }}
              >
                {i === 0 && <span>{mesa.codigo}</span>}
                {i === 1 && <span className="text-[9px] font-normal opacity-75">{mesa.capacidad}p</span>}
                {pedida && i === 1 && <span className="chip-pedida" aria-hidden="true" />}
              </div>
            ))}
          </>
        ) : (
          <>
            <span>{mesa.codigo}</span>
            <span className="text-[9px] font-normal opacity-75">{mesa.capacidad}p</span>
            {pedida && <span className="chip-pedida" aria-hidden="true" />}
          </>
        )}
        {mesa.fijada && !soloLectura && (
          <span
            className="pointer-events-none absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-borde bg-superficie text-[8px] leading-none shadow-sm"
            aria-hidden="true"
          >
            🔒
          </span>
        )}
      </div>
      {reserva && (
        <div
          className="pointer-events-none absolute truncate rounded-md bg-superficie/90 px-1.5 py-0.5 text-center text-[10px] leading-tight font-medium text-tinta shadow-sm"
          style={{ left: pos.x - 10, top: pos.y + alto + 3, width: ancho + 20 }}
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
