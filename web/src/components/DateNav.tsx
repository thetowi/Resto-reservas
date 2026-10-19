"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCalendario } from "@/lib/api";
import { addDays, diasEntre, nombreMes, partesFecha, textoRelativo, todayISO } from "@/lib/date";

// Selector de fecha del encabezado (opción A del mockup
// capax-encabezado-prototipo): una sola línea con las flechas, el día
// escrito («Lunes 19 de octubre»), la etiqueta «Hoy» (o «Mañana», «En 4
// días», «Ayer») con el año, el botón del calendario y «Volver a hoy».
// Lo usan el panel (app/page.tsx, que además suma los atajos ← → y H) y el
// mapa del salón (PlanoSalon), que usa las flechas para mover mesas.

interface Props {
  fecha: string;
  onPrev: () => void;
  onNext: () => void;
  onHoy: () => void;
  onFecha: (fecha: string) => void;
}

function Flecha({ izq }: { izq?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={izq ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

function IconoCalendario() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

const boton =
  "grid h-[38px] w-[38px] flex-none place-items-center rounded-[11px] border border-borde bg-superficie text-tinta transition-colors hover:bg-arena-suave";

export default function DateNav({ fecha, onPrev, onNext, onHoy, onFecha }: Props) {
  const hoy = todayISO();
  const esHoy = fecha === hoy;
  const { diaSemana, dia, mes, anio } = partesFecha(fecha);
  const relativo = textoRelativo(fecha, hoy);
  const [abierto, setAbierto] = useState(false);
  const botonCal = useRef<HTMLButtonElement>(null);

  // Hacia qué lado entra el día nuevo (se desliza desde ese costado).
  const [anterior, setAnterior] = useState(fecha);
  const [lado, setLado] = useState<"izq" | "der" | "">("");
  if (anterior !== fecha) {
    setAnterior(fecha);
    setLado(fecha > anterior ? "der" : "izq");
  }

  return (
    <div className="flex items-center gap-2.5">
      <button type="button" onClick={onPrev} title="Día anterior" aria-label="Día anterior" className={boton}>
        <Flecha izq />
      </button>
      <div className="grid w-[250px] gap-[3px] overflow-hidden text-center" aria-live="polite">
        <div key={fecha} className={lado ? `fecha-entra-${lado}` : undefined}>
          <b className="block text-[21px] leading-tight font-bold tracking-[-0.01em] whitespace-nowrap">
            {diaSemana} {dia} de {mes}
          </b>
          <span className="mt-[3px] flex items-center justify-center gap-2 text-[13px] text-tinta-suave">
            {relativo ? (
              <em className="rounded-full bg-arena-suave px-2 py-0.5 text-[11px] font-extrabold tracking-[0.06em] text-tinta-suave uppercase not-italic">
                {relativo}
              </em>
            ) : (
              <em className="rounded-full bg-asistio px-2 py-0.5 text-[11px] font-extrabold tracking-[0.06em] text-[#04221c] uppercase not-italic">
                Hoy
              </em>
            )}
            {anio}
          </span>
        </div>
      </div>
      <button type="button" onClick={onNext} title="Día siguiente" aria-label="Día siguiente" className={boton}>
        <Flecha />
      </button>
      <button
        ref={botonCal}
        type="button"
        onClick={() => setAbierto((a) => !a)}
        title="Elegir fecha"
        aria-label="Elegir fecha"
        aria-expanded={abierto}
        aria-haspopup="dialog"
        className={`${boton} text-[#1d7a69]! [[data-theme=dark]_&]:text-[#6fd3bf]! ${abierto ? "border-asistio! bg-asistio-suave!" : ""}`}
      >
        <IconoCalendario />
      </button>
      {/* Siempre está (invisible en hoy) para que no se corra nada al
          volver a hoy. */}
      <button
        type="button"
        onClick={onHoy}
        aria-hidden={esHoy}
        tabIndex={esHoy ? -1 : 0}
        className={`h-8 rounded-[10px] bg-marca px-3 text-[13px] font-bold whitespace-nowrap text-white ${esHoy ? "invisible" : ""}`}
      >
        Volver a hoy
      </button>
      {abierto && (
        <Calendario
          fecha={fecha}
          hoy={hoy}
          ancla={botonCal}
          onElegir={(f) => {
            setAbierto(false);
            onFecha(f);
          }}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </div>
  );
}

// ---------- calendario del botón ----------

interface CalendarioProps {
  fecha: string;
  hoy: string;
  ancla: React.RefObject<HTMLButtonElement | null>;
  onElegir: (fecha: string) => void;
  onCerrar: () => void;
}

const SEMANA = ["L", "M", "M", "J", "V", "S", "D"];

// Primer lunes de la grilla de 6 semanas del mes de "mesISO" (yyyy-mm).
function inicioGrilla(mesISO: string) {
  const primero = `${mesISO}-01`;
  const [y, m] = mesISO.split("-").map(Number);
  const dow = new Date(y, m - 1, 1).getDay(); // 0 domingo
  return addDays(primero, -((dow + 6) % 7));
}

function moverMes(mesISO: string, delta: number) {
  const [y, m] = mesISO.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Calendario({ fecha, hoy, ancla, onElegir, onCerrar }: CalendarioProps) {
  const [mes, setMes] = useState(fecha.slice(0, 7));
  const [pax, setPax] = useState<Record<string, number>>({});
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const desde = inicioGrilla(mes);
  const hasta = addDays(desde, 41);

  // Gente reservada por día, para la rayita. Si falla, el calendario
  // funciona igual, sin rayitas.
  useEffect(() => {
    let vigente = true;
    getCalendario(desde, hasta)
      .then((dias) => {
        if (vigente) setPax(Object.fromEntries(dias.map((d) => [d.fecha, d.pax])));
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [desde, hasta]);

  // Va en un portal (el encabezado recorta lo que se sale) y se ubica
  // debajo del botón; se reacomoda si se mueve la pantalla.
  useLayoutEffect(() => {
    const ubicar = () => {
      const r = ancla.current?.getBoundingClientRect();
      if (!r) return;
      const ancho = 318;
      setPos({ left: Math.max(8, Math.min(r.left - 140, window.innerWidth - ancho - 8)), top: r.bottom + 8 });
    };
    ubicar();
    window.addEventListener("resize", ubicar);
    window.addEventListener("scroll", ubicar, true);
    return () => {
      window.removeEventListener("resize", ubicar);
      window.removeEventListener("scroll", ubicar, true);
    };
  }, [ancla]);

  useEffect(() => {
    const afuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!caja.current?.contains(t) && !ancla.current?.contains(t)) onCerrar();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("pointerdown", afuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", afuera);
      document.removeEventListener("keydown", esc);
    };
  }, [ancla, onCerrar]);

  const [y, m] = mes.split("-").map(Number);
  const dias = Array.from({ length: 42 }, (_, i) => addDays(desde, i));

  return createPortal(
    <div
      ref={caja}
      role="dialog"
      aria-label="Elegir fecha"
      className="fixed z-50 w-[318px] rounded-2xl border border-borde bg-superficie p-3.5 text-tinta shadow-[0_18px_40px_-18px_rgba(0,0,0,0.55)]"
      style={pos ?? { visibility: "hidden" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => setMes((x) => moverMes(x, -1))} aria-label="Mes anterior" className={`${boton} h-8! w-8! rounded-[9px]!`}>
          <Flecha izq />
        </button>
        <b className="text-[15px] capitalize">
          {nombreMes(m)} {y}
        </b>
        <button type="button" onClick={() => setMes((x) => moverMes(x, 1))} aria-label="Mes siguiente" className={`${boton} h-8! w-8! rounded-[9px]!`}>
          <Flecha />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-[3px]">
        {SEMANA.map((d, i) => (
          <span key={i} className="py-1 text-center text-[11px] font-bold text-tinta-suave">
            {d}
          </span>
        ))}
        {dias.map((d) => {
          const fuera = d.slice(0, 7) !== mes;
          const sel = d === fecha;
          const gente = pax[d] ?? 0;
          const n = Number(d.slice(8));
          return (
            <button
              key={d}
              type="button"
              onClick={() => onElegir(d)}
              title={gente ? `${gente} ${gente === 1 ? "persona reservada" : "personas reservadas"}` : "Sin reservas"}
              aria-label={`${n} de ${nombreMes(Number(d.slice(5, 7)))}${gente ? `, ${gente} reservados` : ""}`}
              aria-pressed={sel}
              className={`relative h-[38px] rounded-[10px] text-sm tabular-nums transition-colors ${
                sel ? "bg-marca font-bold text-white" : "hover:bg-arena-suave"
              } ${fuera && !sel ? "opacity-40" : ""} ${d === hoy && !sel ? "font-bold shadow-[inset_0_0_0_2px_var(--color-asistio)]" : ""}`}
            >
              {n}
              {gente > 0 && (
                <i
                  className={`absolute bottom-1 left-1/2 h-[3px] -translate-x-1/2 rounded-full ${sel ? "bg-white" : "bg-asistio"}`}
                  style={{ width: Math.min(22, 6 + gente / 6) }}
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 flex items-center justify-between border-t border-borde pt-2.5 text-xs text-tinta-suave">
        <span className="flex items-center gap-1.5">
          <i className="h-[3px] w-4 rounded-full bg-asistio" />
          más larga = más gente
        </span>
        {diasEntre(hoy, fecha) !== 0 || mes !== hoy.slice(0, 7) ? (
          <button type="button" onClick={() => onElegir(hoy)} className="h-7 rounded-[9px] bg-marca px-3 text-[13px] font-bold text-white">
            Hoy
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
