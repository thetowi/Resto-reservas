"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError, dividirMesaRapido, toggleWalkIn } from "@/lib/api";
import type { Mesa, Reserva, Turno } from "@/lib/types";

interface Props {
  mesas: Mesa[];
  mesasOcupadas: number[];
  mesasPedidas: number[];
  mesasWalkIn: number[];
  reservas: Reserva[];
  fecha: string;
  turno: Turno;
}

export default function MesasPanel({
  mesas,
  mesasOcupadas,
  mesasPedidas,
  mesasWalkIn,
  reservas,
  fecha,
  turno,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<number | null>(null);
  // Mesa libre sobre la que se abrió el menú de "Ocupar / Dividir" (ver
  // onTocarMesa): solo una a la vez, se cierra tocando cualquiera de las dos
  // opciones, el backdrop, o Escape.
  const [menuAbiertoPara, setMenuAbiertoPara] = useState<number | null>(null);

  const ocupadas = new Set(mesasOcupadas);
  const pedidas = new Set(mesasPedidas);
  const walkIns = new Set(mesasWalkIn);

  // El total de pax del salon suma TODAS las mesas (bases y divisiones): al
  // dividir una mesa, la capacidad de la division sale de la base (se le
  // resta ahi mismo — ver MesasController.Dividir/DividirEnDos), asi que
  // sumar las dos por separado ya no duplica nada, y omitir las divisiones
  // haria que el total quedara de menos.
  const totalPax = mesas.reduce((acc, m) => acc + m.capacidad, 0);

  function onTocarMesa(mesa: Mesa) {
    setError(null);

    if (ocupadas.has(mesa.id)) {
      // Ocupada por una reserva real: no se libera con un click, para
      // evitar borrar por error los datos de un huesped ya cargado.
      const reserva = reservas.find((r) => r.mesaIds.includes(mesa.id));
      setError(
        `Mesa ${mesa.codigo} ocupada por la reserva de ${reserva?.nombre || "—"}: editala desde su fila para cambiarla.`,
      );
      return;
    }

    if (walkIns.has(mesa.id)) {
      // Ya ocupada por un walk-in: tocarla de nuevo la libera directo (no
      // tiene sentido ofrecer "dividir" una mesa que ya está en uso).
      if (window.confirm(`¿Liberar la mesa ${mesa.codigo}?`)) {
        liberarOOcupar(mesa);
      }
      return;
    }

    // Mesa libre: acá es donde entran las dos opciones nuevas — en vez de
    // ocupar directo con un walk-in como antes, se abre un menú chico para
    // elegir entre ocupar o dividir al toque.
    setMenuAbiertoPara(mesa.id);
  }

  async function liberarOOcupar(mesa: Mesa) {
    setEnviando(mesa.id);
    try {
      await toggleWalkIn(fecha, turno, mesa.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo actualizar la mesa");
    } finally {
      setEnviando(null);
    }
  }

  async function onDividir(mesa: Mesa) {
    setMenuAbiertoPara(null);
    setEnviando(mesa.id);
    try {
      await dividirMesaRapido(mesa.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo dividir la mesa");
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div className="rounded-2xl border border-borde bg-superficie p-4 shadow-sm">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold tracking-wide text-tinta-suave uppercase">
          Mesas disponibles
        </div>
        <div className="text-xs text-tinta-suave">
          Total salón: <strong className="text-tinta">{totalPax} pax</strong>
        </div>
      </div>

      {error && (
        <div className="mb-2.5 rounded-lg bg-ocupada-suave px-2.5 py-2 text-xs text-ocupada">{error}</div>
      )}

      <div className="grid grid-cols-4 gap-1.5">
        {mesas
          // Una base ya dividida al toque (ver DividirEnDos) queda en 0 pax
          // propios — toda su capacidad pasó a sus dos mitades ("11a"/"11b"),
          // así que ya no tiene sentido mostrarla acá como si fuera una mesa
          // usable. Sigue existiendo (y se puede ver/renombrar/borrar desde
          // "Administrar mesas"), solo se oculta de este panel.
          .filter((m) => !(m.mesaPadreId === null && m.capacidad === 0))
          .map((m) => {
          const ocupada = ocupadas.has(m.id);
          const walkIn = walkIns.has(m.id);
          const pedida = pedidas.has(m.id);
          const reserva = reservas.find((r) => r.mesaIds.includes(m.id));
          const puedeDividir = m.mesaPadreId === null && m.capacidad >= 2;
          const titulo = ocupada
            ? `Mesa ${m.codigo} — ${m.capacidad} pax — ocupada (${reserva?.nombre || "reserva"})${pedida ? ", pedida puntualmente" : ""}`
            : walkIn
              ? `Mesa ${m.codigo} — ${m.capacidad} pax — ocupada por un walk-in: tocá para liberarla`
              : `Mesa ${m.codigo} — ${m.capacidad} pax — libre: tocá para ocuparla o dividirla`;
          return (
            <div key={m.id} className="relative">
              <button
                type="button"
                title={titulo}
                disabled={enviando === m.id}
                onClick={() => onTocarMesa(m)}
                className={`relative w-full rounded-lg border px-1 py-2 text-center text-xs font-semibold transition-opacity disabled:opacity-50 ${
                  ocupada
                    ? "border-ocupada bg-ocupada text-white"
                    : walkIn
                      ? "border-walkin bg-walkin text-white"
                      : "border-borde bg-libre text-tinta-suave hover:bg-arena-suave"
                } ${pedida ? "anillo-pedida" : ""}`}
                            >
                {m.codigo}
                <span className="block text-[9px] font-normal opacity-75">{m.capacidad}p</span>
              </button>
              {pedida && <span className="chip-pedida" aria-hidden="true" />}

              {menuAbiertoPara === m.id && (
                <>
                  {/* Backdrop invisible: cerrar el menu tocando afuera. */}
                  <button
                    type="button"
                    aria-label="Cerrar"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setMenuAbiertoPara(null)}
                  />
                  <div className="absolute top-full left-1/2 z-50 mt-1 w-40 -translate-x-1/2 rounded-lg border border-borde bg-superficie p-1 text-left shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuAbiertoPara(null);
                        liberarOOcupar(m);
                      }}
                      className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs text-tinta hover:bg-arena-suave"
                    >
                      Ocupar (walk-in)
                    </button>
                    <button
                      type="button"
                      disabled={!puedeDividir}
                      title={puedeDividir ? undefined : "No hay pax suficientes para dividir esta mesa"}
                      onClick={() => onDividir(m)}
                      className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs text-tinta hover:bg-arena-suave disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      Dividir mesa
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 text-[11px] text-tinta-suave">
        <div className="flex flex-wrap gap-3.5">
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
            <i className="anillo-pedida inline-block h-2.5 w-2.5 rounded-full border border-borde bg-superficie" />
            Pedida
          </span>
        </div>
        <Link href="/admin/mesas" className="underline hover:text-tinta">
          Administrar mesas
        </Link>
      </div>
    </div>
  );
}
