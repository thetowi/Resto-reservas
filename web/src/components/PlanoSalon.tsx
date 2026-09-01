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
import type { ElementoPlano, Mesa, Turno, TurnoData } from "@/lib/types";
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
  // Modo lectura (usado en /plano, la vista de Staff "para estudiar" el
  // salón): sin arrastre de mesas ni carteles, sin agregar/editar/borrar
  // carteles — solo mirar la disposición y la ocupación en vivo.
  soloLectura?: boolean;
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

function posicionPorDefecto(orden: number) {
  return {
    x: MARGEN + (orden % COLUMNAS) * ESPACIADO,
    y: MARGEN + Math.floor(orden / COLUMNAS) * ESPACIADO,
  };
}

function tamanoPorCapacidad(capacidad: number) {
  return Math.min(96, Math.max(52, 36 + capacidad * 6));
}

export default function PlanoSalon({ mesas, salonId, onMoverMesa, soloLectura = false }: Props) {
  const [fecha, setFecha] = useState(todayISO());
  const [turno, setTurno] = useState<Turno>("almuerzo");
  const [turnoData, setTurnoData] = useState<TurnoData | null>(null);
  const [elementos, setElementos] = useState<ElementoPlano[]>([]);
  const [error, setError] = useState<string | null>(null);
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
          ? "El color de cada mesa muestra si ya tiene una reserva asignada en el día y turno elegidos arriba."
          : "Arrastrá cada mesa para acomodar el plano como está el salón de verdad. El color muestra si esa mesa ya tiene una reserva asignada en el día y turno elegidos arriba."}
      </p>

      {!soloLectura && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-tinta-suave">Agregar cartel de referencia:</span>
          {ETIQUETAS_RAPIDAS.map((etiqueta) => (
            <button
              key={etiqueta}
              onClick={() => onAgregarElemento(etiqueta)}
              className="rounded-md border border-dashed border-arena px-2 py-1 hover:bg-arena-suave"
            >
              + {etiqueta}
            </button>
          ))}
          <button
            onClick={() => onAgregarElemento("Nuevo")}
            className="rounded-md border border-dashed border-borde px-2 py-1 text-tinta-suave hover:bg-arena-suave"
          >
            + Otro…
          </button>
        </div>
      )}

      <div
        className="relative overflow-auto rounded-2xl border border-borde"
        style={{
          height: "min(78vh, 760px)",
          backgroundColor: "var(--color-fondo)",
          backgroundImage: "radial-gradient(var(--color-borde) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        <div className="relative" style={{ width: LIENZO_ANCHO, height: LIENZO_ALTO }}>
          {mesas.map((mesa) => {
            const inicial =
              mesa.posX !== null && mesa.posY !== null
                ? { x: mesa.posX, y: mesa.posY }
                : posicionPorDefecto(mesa.orden);
            return (
              <MesaCaja
                key={mesa.id}
                mesa={mesa}
                x={inicial.x}
                y={inicial.y}
                tamano={tamanoPorCapacidad(mesa.capacidad)}
                ocupada={ocupadas.has(mesa.id)}
                walkIn={walkIns.has(mesa.id)}
                pedida={pedidas.has(mesa.id)}
                onMover={onMoverMesa}
                soloLectura={soloLectura}
              />
            );
          })}
          {elementosDelSalon.map((elemento) =>
            soloLectura ? (
              <div
                key={elemento.id}
                className="absolute flex items-center justify-center rounded-lg border-2 border-dashed border-arena bg-arena-suave/80 p-1 text-center text-[11px] font-medium text-tinta-suave"
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
              />
            ),
          )}
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
          <i className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-arena bg-arena-suave" />
          Cartel de referencia
        </span>
      </div>
    </div>
  );
}

interface MesaCajaProps {
  mesa: Mesa;
  x: number;
  y: number;
  tamano: number;
  ocupada: boolean;
  walkIn: boolean;
  pedida: boolean;
  onMover: (mesa: Mesa, posX: number, posY: number) => void;
  soloLectura?: boolean;
}

function MesaCaja({ mesa, x, y, tamano, ocupada, walkIn, pedida, onMover, soloLectura = false }: MesaCajaProps) {
  const [pos, setPos] = useState({ x, y });
  const [arrastrando, setArrastrando] = useState(false);
  const offset = useRef({ dx: 0, dy: 0 });
  const ref = useRef<HTMLDivElement>(null);

  // Sincroniza con la posicion "oficial" (prop) cuando cambia por afuera —
  // otra persona movio esta mesa, o volvio el broadcast del propio guardado
  // — pero nunca mientras se la esta arrastrando, para no pelearle al mouse.
  useEffect(() => {
    if (!arrastrando) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPos({ x, y });
    }
  }, [x, y, arrastrando]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (soloLectura) return;
    const rect = ref.current!.getBoundingClientRect();
    offset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    ref.current!.setPointerCapture(e.pointerId);
    setArrastrando(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrastrando || soloLectura) return;
    const contenedor = ref.current!.offsetParent as HTMLElement | null;
    if (!contenedor) return;
    const rect = contenedor.getBoundingClientRect();
    const nuevoX = Math.max(0, e.clientX - rect.left - offset.current.dx);
    const nuevoY = Math.max(0, e.clientY - rect.top - offset.current.dy);
    setPos({ x: nuevoX, y: nuevoY });
  }

  function onPointerUp() {
    if (soloLectura) return;
    setArrastrando(false);
    const redondeada = { x: Math.round(pos.x), y: Math.round(pos.y) };
    if (redondeada.x === Math.round(x) && redondeada.y === Math.round(y)) return;
    onMover(mesa, redondeada.x, redondeada.y);
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

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title={`Mesa ${mesa.codigo} — ${mesa.capacidad} pax — ${estado}`}
      className={`absolute flex touch-none flex-col items-center justify-center rounded-xl border-2 text-xs font-semibold shadow-sm select-none ${soloLectura ? "" : "cursor-grab active:cursor-grabbing"} ${colorClase} ${pedida ? "anillo-pedida" : ""}`}
      style={{ left: pos.x, top: pos.y, width: tamano, height: tamano }}
    >
      <span>{mesa.codigo}</span>
      <span className="text-[9px] font-normal opacity-75">{mesa.capacidad}p</span>
      {pedida && <span className="chip-pedida" aria-hidden="true" />}
    </div>
  );
}

interface ElementoCajaProps {
  elemento: ElementoPlano;
  onMover: (elemento: ElementoPlano, posX: number, posY: number) => void;
  onRedimensionar: (elemento: ElementoPlano, ancho: number, alto: number) => void;
  onRenombrar: (elemento: ElementoPlano, etiqueta: string) => void;
  onBorrar: (elemento: ElementoPlano) => void;
}

// Cartel de referencia (Ventana, Cocina, Bodega, Isla, Mueble, etc.): se
// arrastra igual que una mesa, pero ademas se puede renombrar (el texto es
// un input siempre editable) y redimensionar con la manija de la esquina.
function ElementoCaja({ elemento, onMover, onRedimensionar, onRenombrar, onBorrar }: ElementoCajaProps) {
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
    offset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    ref.current!.setPointerCapture(e.pointerId);
    setArrastrando(true);
  }

  function onPointerMoveMover(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrastrando) return;
    const contenedor = ref.current!.offsetParent as HTMLElement | null;
    if (!contenedor) return;
    const rect = contenedor.getBoundingClientRect();
    const nuevoX = Math.max(0, e.clientX - rect.left - offset.current.dx);
    const nuevoY = Math.max(0, e.clientY - rect.top - offset.current.dy);
    setPos({ x: nuevoX, y: nuevoY });
  }

  function onPointerUpMover() {
    setArrastrando(false);
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
    const nuevoAncho = Math.max(30, inicio.ancho + (e.clientX - inicio.clientX));
    const nuevoAlto = Math.max(24, inicio.alto + (e.clientY - inicio.clientY));
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
      className="group absolute flex cursor-grab touch-none flex-col items-stretch justify-center gap-0.5 rounded-lg border-2 border-dashed border-arena bg-arena-suave/80 p-1 text-center shadow-sm select-none active:cursor-grabbing"
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
            "linear-gradient(135deg, transparent 0 50%, var(--color-arena) 50% 100%)",
        }}
      />
    </div>
  );
}
