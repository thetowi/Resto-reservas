"use client";

import { useEffect, useState } from "react";
import { ApiError, crearReserva, reducirSalonPorTurno, toggleCierre } from "@/lib/api";
import type { Espera, Mesa, Salon, Turno, TurnoData } from "@/lib/types";
import { excedioTolerancia } from "@/lib/tolerancia";
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

  // "Reducir salón" (ver ReduccionesController del lado del backend): sacar
  // de circulación algunas mesas LIBRES de este turno puntual cuando hay
  // poco personal, sin tocar la estructura real del salón — vuelven a verse
  // normal solo, en cualquier otro turno o día. Las mesas ya reducidas
  // llegan marcadas (mesa.reducida) dentro del mismo prop "mesas" de
  // siempre (ver DiaService/MesaDto), MesasPanel.tsx las saca de "Mesas
  // disponibles" por su cuenta.
  const [reduciendoSalon, setReduciendoSalon] = useState(false);
  const [mesasAReducir, setMesasAReducir] = useState<Set<number>>(new Set());
  const [enviandoReduccion, setEnviandoReduccion] = useState(false);
  const [errorReduccion, setErrorReduccion] = useState<string | null>(null);
  const mesasReducidasActuales = mesas.filter((m) => m.reducida);
  // Candidatas para el modal: cualquier mesa de este turno que no esté
  // ocupada por una reserva real ni por un walk-in — da igual si ya está
  // reducida (hay que poder destildarla para devolverla a circulación), lo
  // único que no tiene sentido es ofrecer una mesa que ya tiene gente.
  const candidatasReduccion = mesas.filter(
    (m) => !mesasOcupadas.includes(m.id) && !data.mesasWalkIn.includes(m.id),
  );

  // Reloj compartido para el aviso de tolerancia (ver ReservaRow.tsx / lib/
  // tolerancia.ts): un solo timer acá en vez de uno por fila, y también
  // alimenta el contador del encabezado de abajo. 30s alcanza de sobra para
  // un aviso que se dispara recien a los 15 minutos.
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const reservasFueraDeTolerancia = reservas.filter((r) => excedioTolerancia(r, ahora)).length;

  // Aviso de sobreventa: cuando el pax reservado de este turno llega al 80%
  // de la capacidad total del salon (todas las mesas, bases y divisiones),
  // conviene que el staff lo note antes de que se termine de llenar. Resta
  // las mesas reducidas (ver más arriba): si se achicó el salón a propósito
  // por poco personal, el techo real para este turno es ese, no el de
  // siempre.
  const capacidadSalon = mesas
    .filter((m) => !m.reducida)
    .reduce((acc, m) => acc + m.capacidad, 0);
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

  function onAbrirReducir() {
    // Arranca con las que ya estaban reducidas tildadas, para poder tanto
    // sumar como sacar reducciones en esta misma confirmación.
    setMesasAReducir(new Set(mesasReducidasActuales.map((m) => m.id)));
    setErrorReduccion(null);
    setReduciendoSalon(true);
  }

  function onToggleMesaAReducir(mesaId: number) {
    setMesasAReducir((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(mesaId)) siguiente.delete(mesaId);
      else siguiente.add(mesaId);
      return siguiente;
    });
  }

  async function onConfirmarReducir() {
    setEnviandoReduccion(true);
    setErrorReduccion(null);
    try {
      await reducirSalonPorTurno(fecha, turno, salonId, [...mesasAReducir]);
      setReduciendoSalon(false);
    } catch (e) {
      setErrorReduccion(e instanceof ApiError ? e.message : "No se pudo reducir el salón");
    } finally {
      setEnviandoReduccion(false);
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
              <div className="flex items-center gap-2">
                <button
                  onClick={onAbrirReducir}
                  className="rounded-lg border border-borde px-2.5 py-1 text-xs text-tinta-suave hover:border-arena hover:text-tinta"
                >
                  {mesasReducidasActuales.length > 0
                    ? `Reducir salón (${mesasReducidasActuales.length})`
                    : "Reducir salón"}
                </button>
                <button
                  onClick={onCerrar}
                  disabled={enviandoCierre}
                  className="rounded-lg border border-borde px-2.5 py-1 text-xs text-tinta-suave hover:border-ocupada hover:text-ocupada disabled:opacity-50"
                >
                  Cerrar turno
                </button>
              </div>
            )}
          </div>

          {mesasReducidasActuales.length > 0 && (
            <div className="mb-3 rounded-lg bg-arena-suave px-3 py-2 text-xs text-tinta-suave">
              Salón reducido para este turno: {mesasReducidasActuales.length === 1 ? "mesa" : "mesas"}{" "}
              {mesasReducidasActuales.map((m) => m.codigo).join(", ")} fuera de &quot;Mesas disponibles&quot;.
            </div>
          )}

          {cercaDeLlenarse && (
            <div className="mb-3 rounded-lg bg-aviso-suave px-3 py-2 text-xs text-aviso">
              ⚠ Salón al {porcentajeOcupacion}% de su capacidad para este turno ({totalPax}/{capacidadSalon} pax)
            </div>
          )}

          {reservasFueraDeTolerancia > 0 && (
            <div className="mb-3 rounded-lg bg-aviso-suave px-3 py-2 text-xs text-aviso">
              ⏰ {reservasFueraDeTolerancia}{" "}
              {reservasFueraDeTolerancia === 1
                ? "reserva superó los 15 minutos de tolerancia y todavía no llegó"
                : "reservas superaron los 15 minutos de tolerancia y todavía no llegaron"}
              : movele el horario o liberale la mesa desde su fila.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
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
                  <th
                    className="px-1.5 py-1.5 text-left"
                    title="Ya vino, comió y se fue: libera su mesa (para un walk-in u otra reserva) sin borrar en qué mesa estuvo sentada"
                  >
                    Se fue
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {reservas.map((r, i) => (
                  <ReservaRow
                    key={r.id}
                    reserva={r}
                    mesas={mesas}
                    reservas={reservas}
                    mesasWalkIn={data.mesasWalkIn}
                    impar={i % 2 === 1}
                    ahora={ahora}
                  />
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

      {reduciendoSalon && (
        <>
          <button
            type="button"
            aria-label="Cerrar"
            className="fixed inset-0 z-40 cursor-default bg-tinta/30"
            onClick={() => setReduciendoSalon(false)}
          />
          <div className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-borde bg-superficie p-5 shadow-lg">
            <h3 className="mb-1.5 text-base font-bold">Reducir salón — {titulo}</h3>
            <p className="mb-3 text-xs text-tinta-suave">
              Tildá las mesas libres que querés sacar de circulación para este turno puntual
              (por poco personal, por ejemplo). Dejan de listarse en &quot;Mesas disponibles&quot; solo
              hasta que termine este turno — destildalas acá para devolverlas antes.
            </p>

            {errorReduccion && (
              <div className="mb-3 rounded-lg bg-ocupada-suave px-2.5 py-2 text-xs text-ocupada">
                {errorReduccion}
              </div>
            )}

            {candidatasReduccion.length === 0 ? (
              <p className="mb-3 text-xs text-tinta-suave">
                No hay mesas libres en este turno para reducir — todas están ocupadas o con un
                walk-in.
              </p>
            ) : (
              <div className="mb-3 grid max-h-64 grid-cols-4 gap-1.5 overflow-y-auto">
                {candidatasReduccion.map((m) => {
                  const tildada = mesasAReducir.has(m.id);
                  return (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => onToggleMesaAReducir(m.id)}
                      className={`rounded-lg border px-1 py-2 text-center text-xs font-semibold ${
                        tildada
                          ? "border-ocupada bg-ocupada-suave text-ocupada"
                          : "border-borde bg-libre text-tinta-suave hover:bg-arena-suave"
                      }`}
                    >
                      {m.codigo}
                      <span className="block text-[9px] font-normal opacity-75">{m.capacidad}p</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReduciendoSalon(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-tinta-suave hover:bg-arena-suave"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirmarReducir}
                disabled={enviandoReduccion}
                className="rounded-lg bg-marca px-3.5 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {enviandoReduccion ? "Guardando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}