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
    <div className="flex flex-wrap items-center gap-4">
      <div className="rounded-full bg-arena-suave px-3.5 py-1.5 text-xs font-semibold tracking-wide text-tinta-suave uppercase">
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
        {!esHoy && (
          <button
            onClick={onHoy}
            className="rounded-lg bg-tinta px-3.5 py-1.5 text-sm text-white"
          >
            Hoy
          </button>
        )}
      </div>
    </div>
  );
}
