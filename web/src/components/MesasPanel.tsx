"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError, dividirMesaPorTurno, toggleWalkIn, unirMesaPorTurno } from "@/lib/api";
import type { Mesa, Reserva, Turno } from "@/lib/types";
import { useConfirm } from "./ConfirmProvider";

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
  const { confirmar } = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<number | null>(null);
  // Mesa libre sobre la que se abrió el menú (Ocupar / Dividir / Unir).
  const [menuAbiertoPara, setMenuAbiertoPara] = useState<number | null>(null);
  // Mesa sobre la que se está mostrando el mini-formulario de "cuántos pax
  // van a la mesa nueva" (reemplaza al menú cuando se toca "Dividir mesa").
  // El resto (lo que le queda a la mesa base) se calcula solo, no se pide.
  const [dividiendoPara, setDividiendoPara] = useState<number | null>(null);
  const [paxDivision, setPaxDivision] = useState("");

  const ocupadas = new Set(mesasOcupadas);
  const pedidas = new Set(mesasPedidas);
  const walkIns = new Set(mesasWalkIn);

  // El total de pax del salon suma TODAS las mesas que ve este turno (bases
  // y mitades, temporales o permanentes): la lista que llega por props ya
  // viene filtrada por turno desde el backend, asi que sumar todo es
  // correcto sin duplicar nada.
  const totalPax = mesas.reduce((acc, m) => acc + m.capacidad, 0);

  function cerrarMenus() {
    setMenuAbiertoPara(null);
    setDividiendoPara(null);
    setPaxDivision("");
  }

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
      // tiene sentido ofrecer "dividir/unir" una mesa que ya está en uso).
      liberarConfirmando(mesa);
      return;
    }

    setMenuAbiertoPara(mesa.id);
  }

  async function liberarConfirmando(mesa: Mesa) {
    if (!(await confirmar(`¿Liberar la mesa ${mesa.codigo}?`))) return;
    setEnviando(mesa.id);
    try {
      await toggleWalkIn(fecha, turno, mesa.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo actualizar la mesa");
    } finally {
      setEnviando(null);
    }
  }

  async function onOcupar(mesa: Mesa) {
    cerrarMenus();
    setEnviando(mesa.id);
    try {
      await toggleWalkIn(fecha, turno, mesa.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo ocupar la mesa");
    } finally {
      setEnviando(null);
    }
  }

  function onAbrirDividir(mesa: Mesa) {
    setMenuAbiertoPara(null);
    setDividiendoPara(mesa.id);
    // Sugerencia inicial: la mitad (redondeada hacia abajo) para la mesa
    // nueva; el usuario la puede cambiar antes de confirmar. El resto
    // (mesa base) se calcula solo, no se pide.
    setPaxDivision(String(Math.floor(mesa.capacidad / 2)));
  }

  async function onConfirmarDividir(mesa: Mesa) {
    const b = Number(paxDivision);
    if (!b || b < 1 || b >= mesa.capacidad) {
      setError(`Ingresá entre 1 y ${mesa.capacidad - 1} pax para la mesa nueva.`);
      return;
    }
    const a = mesa.capacidad - b;
    cerrarMenus();
    setError(null);
    setEnviando(mesa.id);
    try {
      await dividirMesaPorTurno(fecha, turno, mesa.id, a, b);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo dividir la mesa");
    } finally {
      setEnviando(null);
    }
  }

  async function onUnir(mesa: Mesa) {
    setMenuAbiertoPara(null);
    if (!(await confirmar(`¿Unir la mesa ${mesa.codigo}? Vuelve a verse como una sola para este turno.`))) return;
    setEnviando(mesa.id);
    try {
      // Unir se pide con el Id de la mesa BASE (el padre), no de la mitad
      // que se tocó — mesaPadreId siempre está seteado en una mitad.
      await unirMesaPorTurno(fecha, turno, mesa.mesaPadreId as number);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo unir la mesa");
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
        {mesas.map((m) => {
          const ocupada = ocupadas.has(m.id);
          const walkIn = walkIns.has(m.id);
          const pedida = pedidas.has(m.id);
          const reserva = reservas.find((r) => r.mesaIds.includes(m.id));
          const puedeDividir = m.mesaPadreId === null && m.capacidad >= 2;
          // Solo una mitad TEMPORAL (creada por esta misma feature) ofrece
          // "Unir" — una division permanente de /admin/mesas no se deshace
          // desde acá.
          const puedeUnir = m.esTemporal && m.mesaPadreId !== null;
          const titulo = ocupada
            ? `Mesa ${m.codigo} — ${m.capacidad} pax — ocupada (${reserva?.nombre || "reserva"})${pedida ? ", pedida puntualmente" : ""}`
            : walkIn
              ? `Mesa ${m.codigo} — ${m.capacidad} pax — ocupada por un walk-in: tocá para liberarla`
              : `Mesa ${m.codigo} — ${m.capacidad} pax — libre`;
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
                  <button
                    type="button"
                    aria-label="Cerrar"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={cerrarMenus}
                  />
                  <div className="absolute top-full left-1/2 z-50 mt-1 w-40 -translate-x-1/2 rounded-lg border border-borde bg-superficie p-1 text-left shadow-lg">
                    <button
                      type="button"
                      onClick={() => onOcupar(m)}
                      className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs text-tinta hover:bg-arena-suave"
                    >
                      Ocupar (walk-in)
                    </button>
                    {puedeUnir ? (
                      <button
                        type="button"
                        onClick={() => onUnir(m)}
                        className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs text-tinta hover:bg-arena-suave"
                      >
                        Unir mesas
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!puedeDividir}
                        title={puedeDividir ? undefined : "No hay pax suficientes para dividir esta mesa"}
                        onClick={() => onAbrirDividir(m)}
                        className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs text-tinta hover:bg-arena-suave disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                      >
                        Dividir mesa
                      </button>
                    )}
                  </div>
                </>
              )}

              {dividiendoPara === m.id && (
                <>
                  <button
                    type="button"
                    aria-label="Cerrar"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={cerrarMenus}
                  />
                  <div className="absolute top-full left-1/2 z-50 mt-1 w-44 -translate-x-1/2 rounded-lg border border-borde bg-superficie p-2.5 text-left shadow-lg">
                    <div className="mb-1.5 text-[11px] text-tinta-suave">
                      Mesa {m.codigo} tiene {m.capacidad} pax. ¿Cuántos pasan a la mesa nueva?
                    </div>
                    <div className="mb-2 flex items-center justify-center">
                      <input
                        type="number"
                        min={1}
                        max={m.capacidad - 1}
                        value={paxDivision}
                        onChange={(e) => setPaxDivision(e.target.value)}
                        className="w-16 rounded-md border border-borde bg-fondo px-1.5 py-1 text-center text-xs text-tinta"
                      />
                    </div>
                    <div className="mb-2 text-center text-[11px] text-tinta-suave">
                      Mesa {m.codigo} queda con {Math.max(m.capacidad - (Number(paxDivision) || 0), 0)} pax
                    </div>
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={cerrarMenus}
                        className="rounded-md px-2 py-1 text-xs text-tinta-suave hover:bg-arena-suave"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => onConfirmarDividir(m)}
                        className="rounded-md bg-marca px-2 py-1 text-xs text-white"
                      >
                        Dividir
                      </button>
                    </div>
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