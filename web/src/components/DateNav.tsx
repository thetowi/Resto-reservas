"use client";

interface Props {
  fecha: string;
  titulo: string;
  esHoy: boolean;
  onPrev: () => void;
  onNext: () => void;
  onHoy: () => void;
  onFecha: (fecha: string) => void;
}

export default function DateNav({ fecha, titulo, esHoy, onPrev, onNext, onHoy, onFecha }: Props) {
  return (
    // Apiladas (fecha arriba, botones abajo) en vez de en una sola fila: así
    // este bloque no se ensancha horizontalmente junto al logo y no empuja
    // a las cajas de Salones/Turno del otro extremo del header.
    <div className="flex flex-col items-start gap-1.5">
      <div className="min-w-[190px] rounded-full bg-arena-suave px-3.5 py-1.5 text-center text-xs font-semibold tracking-wide text-tinta-suave uppercase">
        {titulo}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          title="Día anterior"
          className="h-8 w-8 rounded-lg border border-borde bg-superficie text-lg leading-none hover:bg-arena-suave"
        >
          ‹
        </button>
        <input
          type="date"
          value={fecha}
          onChange={(e) => onFecha(e.target.value)}
          className="rounded-lg border border-borde bg-superficie px-2.5 py-1.5 text-sm"
        />
        <button
          onClick={onNext}
          title="Día siguiente"
          className="h-8 w-8 rounded-lg border border-borde bg-superficie text-lg leading-none hover:bg-arena-suave"
        >
          ›
        </button>
        {/* Siempre se renderiza (aunque esHoy) para que el ancho del header
            no cambie al navegar a "hoy": se oculta con "invisible" en vez
            de desmontarse, así sigue ocupando su lugar. */}
        <button
          onClick={onHoy}
          aria-hidden={esHoy}
          tabIndex={esHoy ? -1 : 0}
          className={`rounded-lg bg-marca px-3.5 py-1.5 text-sm text-white ${esHoy ? "invisible" : ""}`}
        >
          Hoy
        </button>
      </div>
    </div>
  );
}
