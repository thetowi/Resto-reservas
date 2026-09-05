"use client";

import { useState } from "react";
import { crearReserva, toggleCierre } from "@/lib/api";
import type { Espera, Mesa, Salon, Turno, TurnoData } from "@/lib/types";
import EsperaPanel from "./EsperaPanel";
import MesasPanel from "./MesasPanel";
import ReservaRow from "./ReservaRow";
import { useConfirm } from "./ConfirmProvider";

interface Props {
  titulo: string;
  fecha: string;
  turno: Turno;
  salonId: number;
  salones: Salon[];
  data: TurnoData;
  mesas: Mesa[];
  espera: Espera[];
  admin: boolean;
  onEsperaActualizada: (lista: Espera[]) => void;
}

export default function ShiftSection({
  titulo,
  fecha,
  turno,
  salonId,
  salones,
  data,
  mesas,
  espera,
  admin,
  onEsperaActualizada,
}: Props) {
  const { confirmar, preguntar } = useConfirm();
  const { reservas, totalPax, totalAsistio, mesasOcupadas } = data;
  const [enviandoCierre, setEnviandoCierre] = useState(false);

  // Aviso de sobreventa: cuando el pax reservado de este turno llega al 80%
  // de la capacidad total del salon (todas las mesas, bases y divisiones),
  // conviene que el staff lo note antes de que se termine de llenar.
  const capacidadSalon = mesas.reduce((acc, m) => acc + m.capacidad, 0);
  const porcentajeOcupacion = capacidadSalon > 0 ? Math.round((totalPax / capacidadSalon) * 100) : 0;
  const cercaDeLlenarse = capacidadSalon > 0 && totalPax / capacidadSalon >= 0.8;

  async function onCerrar() {
    const motivo = await preguntar(
      `¿Por qué se cierra "${titulo}"? (opcional, dejá vacío si no hace falta)`,
    );
    if (motivo === null) return; // canceló

    const otrosSalones = salones.filter((s) => s.id !== salonId);
    const cerrarTodos =
      otrosSalones.length > 0 &&
      (await confirmar(
        `¿Cerrar "${titulo}" también en los demás salones (${otrosSalones.map((s) => s.nombre).join(", ")})?`,
        { textoConfirmar: "Sí", textoCancelar: "No" },
      ));

    setEnviandoCierre(true);
    try {
      const idsObjetivo = cerrarTodos ? salones.map((s) => s.id) : [salonId];
      await Promise.all(idsObjetivo.map((id) => toggleCierre(fecha, turno, id, motivo || undefined)));
    } catch {
      // el usuario ya ve el estado sin cambios si algo falla
    } finally {
      setEnviandoCierre(false);
    }
  }

  async function onReabrir() {
    if (!(await confirmar(`¿Reabrir "${titulo}"? Vuelve a aceptar reservas.`))) return;
    setEnviandoCierre(true);
    try {
      await toggleCierre(fecha, turno, salonId);
    } catch {
      // idem onCerrar
    } finally {
      setEnviandoCierre(false);
    }
  }

  if (data.estaCerrado) {
    return (
      <section>
        <div className="rounded-2xl border border-borde bg-superficie p-8 text-center shadow-sm">
          <h2 className="mb-2 text-base tracking-wide text-tinta-suave uppercase">{titulo} — Turno cerrado</h2>
          <p className="mx-auto mb-4 max-w-md text-sm text-tinta-suave">
            {data.motivoCierre ? `Motivo: ${data.motivoCierre}` : "No se están tomando reservas para este turno."}
          </p>
          {admin && (
            <button
              onClick={onReabrir}
              disabled={enviandoCierre}
              className="rounded-lg border border-arena px-4 py-2 text-sm hover:bg-arena-suave disabled:opacity-50"
            >
              Reabrir turno
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_260px]">
        <div className="rounded-2xl border border-borde bg-superficie p-4.5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2 border-l-4 border-arena pl-2.5">
            <h2 className="text-base tracking-wide uppercase">{titulo}</h2>
            {admin && (
              <button
                onClick={onCerrar}
                disabled={enviandoCierre}
                className="rounded-lg border border-borde px-2.5 py-1 text-xs text-tinta-suave hover:border-ocupada hover:text-ocupada disabled:opacity-50"
              >
                Cerrar turno
              </button>
            )}
          </div>

          {cercaDeLlenarse && (
            <div className="mb-3 rounded-lg bg-aviso-suave px-3 py-2 text-xs text-aviso">
              ⚠ Salón al {porcentajeOcupacion}% de su capacidad para este turno ({totalPax}/{capacidadSalon} pax)
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-borde text-[11px] tracking-wide text-tinta-suave uppercase">
                  <th className="px-1.5 py-1.5 text-left">Hora</th>
                  <th className="px-1.5 py-1.5 text-left">Mesa</th>
                  <th className="px-1.5 py-1.5 text-left" title="Mesa pedida puntualmente (bloquea el selector de Mesa)">
                    Pidió
                  </th>
                  <th className="px-1.5 py-1.5 text-left">Pax</th>
                  <th className="px-1.5 py-1.5 text-left">Apellido / Nombre</th>
                  <th className="px-1.5 py-1.5 text-left">Hab / Tel</th>
                  <th className="px-1.5 py-1.5 text-left">Comentarios</th>
                  <th className="px-1.5 py-1.5 text-left">Asistió</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {reservas.map((r, i) => (
                  <ReservaRow key={r.id} reserva={r} mesas={mesas} reservas={reservas} impar={i % 2 === 1} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2.5 border-t border-borde pt-2.5">
            <button
              onClick={() => crearReserva(fecha, turno, salonId).catch(() => {})}
              className="rounded-lg border border-dashed border-arena px-3.5 py-1.5 text-sm hover:bg-arena-suave"
            >
              + Agregar reserva
            </button>
            <div className="flex gap-4.5 text-sm text-tinta-suave">
              <span>
                Total pax: <strong className="text-tinta">{totalPax}</strong>
              </span>
              <span>
                Asistió: <strong className="text-tinta">{totalAsistio}</strong>
              </span>
            </div>
          </div>
        </div>
        <div className="sticky top-24 flex h-fit flex-col gap-5 self-start">
          <MesasPanel
            mesas={mesas}
            mesasOcupadas={mesasOcupadas}
            mesasPedidas={data.mesasPedidas}
            mesasWalkIn={data.mesasWalkIn}
            reservas={reservas}
            fecha={fecha}
            turno={turno}
          />
          <EsperaPanel
            fecha={fecha}
            turno={turno}
            salonId={salonId}
            lista={espera}
            onListaActualizada={onEsperaActualizada}
          />
        </div>
      </div>
    </section>
  );
}