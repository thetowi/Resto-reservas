"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, confirmarReservaWeb, getReservasWeb } from "@/lib/api";
import { haySesion } from "@/lib/auth";
import type { EstadoReservaWeb, ReservaWeb, Turno } from "@/lib/types";
import { fechaCorta, linkWhatsApp, numeroWhatsApp } from "@/lib/whatsapp";
import { IconoWhatsApp } from "@/components/BorrarReserva";
import { esNuevaWeb, guardarVistoWeb, leerVistoWeb } from "@/lib/avisosWeb";

// Reservas por el link: todas las que hicieron los clientes desde /reservar,
// de cualquier dia y salon, incluidas las canceladas (el registro queda
// aunque la fila de la grilla se vacie o se quite — ver
// ReservasWebController). Desde aca se confirman las solicitudes, se le
// escribe al cliente o se va a la reserva en el panel.

type Filtro = "pendiente" | "proximas" | "pasadas" | "cancelada" | "todas";

const FILTROS: { clave: Filtro; titulo: string }[] = [
  { clave: "pendiente", titulo: "A confirmar" },
  { clave: "proximas", titulo: "Próximas" },
  { clave: "pasadas", titulo: "Pasadas" },
  { clave: "cancelada", titulo: "Canceladas" },
  { clave: "todas", titulo: "Todas" },
];

const pasaFiltro = (r: ReservaWeb, f: Filtro) =>
  f === "todas"
    ? true
    : f === "proximas"
      ? r.estado === "confirmada" || r.estado === "pendiente"
      : f === "pasadas"
        ? r.estado === "asistio" || r.estado === "novino"
        : r.estado === f;

const ESTADO: Record<EstadoReservaWeb, { texto: string; clase: string }> = {
  pendiente: { texto: "A confirmar", clase: "bg-aviso-suave text-aviso" },
  confirmada: { texto: "Confirmada", clase: "bg-asistio-suave text-[#1d7a69] [[data-theme=dark]_&]:text-[#6fd3bf]" },
  asistio: { texto: "Asistió", clase: "bg-fila-asistio text-[#155d27] [[data-theme=dark]_&]:text-tinta" },
  novino: { texto: "No vino", clase: "bg-ocupada-suave text-ocupada [[data-theme=dark]_&]:bg-[#3a1418] [[data-theme=dark]_&]:text-[#ff8a8a]" },
  cancelada: { texto: "Cancelada", clase: "bg-arena-suave text-tinta-suave line-through" },
};

const NOMBRE_TURNO: Record<Turno, string> = { almuerzo: "Almuerzo", merienda: "Merienda", cena: "Cena" };

// "Hoy 14:32", "Ayer 22:41" o "mié 14/10" (cuando entro el pedido).
function cuandoEntro(iso: string) {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (d.toDateString() === hoy.toDateString()) return `Hoy ${hora}`;
  if (d.toDateString() === ayer.toDateString()) return `Ayer ${hora}`;
  const iso10 = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return fechaCorta(iso10);
}

function quienCancelo(r: ReservaWeb) {
  if (!r.canceladaEn) return "Borrada de la grilla";
  return `Borrada${r.canceladaPor ? ` por ${r.canceladaPor}` : ""} · ${cuandoEntro(r.canceladaEn)}`;
}

export default function ReservasWebPage() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [reservas, setReservas] = useState<ReservaWeb[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("pendiente");
  const [busqueda, setBusqueda] = useState("");
  const [confirmando, setConfirmando] = useState<number | null>(null);
  // Hasta donde se habian visto al entrar (lib/avisosWeb.ts): las que
  // entraron despues llevan la etiqueta "Nueva" durante esta visita.
  const [vistoAlEntrar] = useState(() => leerVistoWeb());

  useEffect(() => {
    if (!haySesion()) {
      router.replace("/login");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setListo(true);
  }, [router]);

  const cargar = useCallback(() => {
    getReservasWeb()
      .then((lista) => {
        setReservas(lista);
        setError(null);
        // Ya se vieron: el contador del panel deja de contarlas como nuevas.
        const ultima = lista.reduce<string | null>((max, r) => (!max || Date.parse(r.creadaEn) > Date.parse(max) ? r.creadaEn : max), null);
        guardarVistoWeb(ultima);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudieron cargar las reservas"));
  }, []);

  // Al entrar, cada minuto, y al volver a la pestaña (por si entraron
  // reservas nuevas mientras tanto).
  useEffect(() => {
    if (!listo) return;
    cargar();
    const intervalo = setInterval(cargar, 60_000);
    const alVolver = () => document.visibilityState === "visible" && cargar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [listo, cargar]);

  // Si no hay nada para confirmar, se arranca mostrando las próximas.
  const [filtroElegido, setFiltroElegido] = useState(false);
  useEffect(() => {
    if (!reservas || filtroElegido) return;
    if (!reservas.some((r) => r.estado === "pendiente")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFiltro("proximas");
    }
  }, [reservas, filtroElegido]);

  const visibles = useMemo(() => {
    if (!reservas) return [];
    const q = busqueda.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, "");
    return reservas
      .filter((r) => pasaFiltro(r, filtro))
      .filter((r) => !q || r.nombre.toLowerCase().includes(q) || (qDigitos.length >= 3 && r.telefono.replace(/\D/g, "").includes(qDigitos)))
      .sort((a, b) =>
        filtro === "proximas" || filtro === "pendiente"
          ? `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`)
          : b.creadaEn.localeCompare(a.creadaEn),
      );
  }, [reservas, filtro, busqueda]);

  async function confirmar(r: ReservaWeb) {
    setConfirmando(r.id);
    try {
      const nueva = await confirmarReservaWeb(r.id);
      setReservas((lista) => lista?.map((x) => (x.id === r.id ? nueva : x)) ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo confirmar");
    } finally {
      setConfirmando(null);
    }
  }

  if (!listo) return null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="text-xs text-tinta-suave underline hover:text-tinta">
            ← Volver a reservas
          </Link>
          <h1 className="mt-1 text-lg font-bold">Reservas por el link</h1>
          <p className="mt-0.5 text-sm text-tinta-suave">Todas las que hicieron los clientes desde el link de reservas, de cualquier día y salón.</p>
        </div>
        <CopiarLink />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="inline-flex flex-wrap rounded-lg border border-borde bg-superficie p-0.5" role="group" aria-label="Filtrar">
          {FILTROS.map((f) => {
            const n = reservas?.filter((r) => pasaFiltro(r, f.clave)).length ?? 0;
            const activo = filtro === f.clave;
            return (
              <button
                key={f.clave}
                type="button"
                aria-pressed={activo}
                onClick={() => {
                  setFiltro(f.clave);
                  setFiltroElegido(true);
                }}
                className={`rounded-md px-3 py-1.5 text-sm ${activo ? "bg-marca text-white" : "text-tinta-suave hover:bg-arena-suave"}`}
              >
                {f.titulo}
                <span className={`ml-1.5 rounded-full px-1.5 text-[11px] font-bold ${activo ? "bg-white/20" : "bg-arena-suave"}`}>{n}</span>
              </button>
            );
          })}
        </div>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o teléfono"
          aria-label="Buscar por nombre o teléfono"
          className="min-w-0 flex-1 rounded-lg border border-borde bg-superficie px-3 py-1.5 text-sm sm:max-w-xs"
        />
      </div>

      {error && <div className="mb-3 rounded-lg bg-ocupada-suave px-3 py-2 text-sm text-ocupada">{error}</div>}

      <div className="overflow-x-auto rounded-2xl border border-borde bg-superficie">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="text-left text-[11px] tracking-wider text-tinta-suave uppercase">
              <th className="px-4 py-2.5 font-semibold">Recibida</th>
              <th className="px-4 py-2.5 font-semibold">Para</th>
              <th className="px-4 py-2.5 font-semibold">Salón</th>
              <th className="px-4 py-2.5 text-right font-semibold">Pax</th>
              <th className="px-4 py-2.5 font-semibold">Nombre</th>
              <th className="px-4 py-2.5 font-semibold">WhatsApp</th>
              <th className="px-4 py-2.5 font-semibold">Pedido</th>
              <th className="px-4 py-2.5 font-semibold">Estado</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {!reservas ? (
              <tr>
                <td colSpan={9} className="border-t border-borde px-4 py-6 text-tinta-suave">
                  Cargando…
                </td>
              </tr>
            ) : visibles.length === 0 ? (
              <tr>
                <td colSpan={9} className="border-t border-borde px-4 py-6 text-tinta-suave">
                  {busqueda ? "No hay reservas que coincidan con la búsqueda." : "No hay reservas en esta lista."}
                </td>
              </tr>
            ) : (
              visibles.map((r) => {
                const numero = numeroWhatsApp(r.telefono);
                const activa = r.estado === "pendiente" || r.estado === "confirmada";
                const cancelada = r.estado === "cancelada";
                return (
                  <tr key={r.id} className={`border-t border-borde align-middle ${cancelada ? "text-tinta-suave" : ""}`}>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {cuandoEntro(r.creadaEn)}
                      {!cancelada && esNuevaWeb(r.creadaEn, vistoAlEntrar) && (
                        <span className="ml-1.5 rounded-full bg-ocupada px-1.5 py-px align-[1px] text-[10px] font-bold tracking-wide text-white uppercase [[data-theme=dark]_&]:bg-[#e5484d]">
                          Nueva
                        </span>
                      )}
                      <small className="block text-[11px] text-tinta-suave">{r.codigo}</small>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <b className="font-semibold capitalize">{fechaCorta(r.fecha)}</b>
                      <small className="block text-[11.5px] text-tinta-suave">
                        {r.hora} · {NOMBRE_TURNO[r.turno]}
                      </small>
                    </td>
                    <td className="px-4 py-2.5">{r.salon}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.pax}</td>
                    <td className="px-4 py-2.5">
                      <b className="font-semibold whitespace-nowrap">{r.nombre}</b>
                      {r.habitacion && <small className="block text-[11.5px] text-tinta-suave">Hab {r.habitacion}</small>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{r.telefono}</td>
                    <td className="max-w-[220px] px-4 py-2.5">
                      {r.pedido ?? <span className="text-tinta-suave">—</span>}
                      {cancelada && <small className="block text-[11.5px] text-tinta-suave">{quienCancelo(r)}</small>}
                      {r.confirmadaPor && r.estado === "confirmada" && (
                        <small className="block text-[11.5px] text-tinta-suave">Confirmada por {r.confirmadaPor}</small>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold whitespace-nowrap ${ESTADO[r.estado].clase}`}>
                        {ESTADO[r.estado].texto}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                        {r.estado === "pendiente" && (
                          <button
                            type="button"
                            disabled={confirmando === r.id}
                            onClick={() => confirmar(r)}
                            className="rounded-lg bg-asistio px-3 py-1 text-[13px] font-bold text-[#04221c] hover:brightness-95 disabled:opacity-50"
                          >
                            {confirmando === r.id ? "Confirmando…" : "Confirmar"}
                          </button>
                        )}
                        {numero && (
                          <a
                            href={linkWhatsApp(numero, r.nombre, r.fecha, r.hora)}
                            target="_blank"
                            rel="noreferrer"
                            title="Escribirle por WhatsApp"
                            aria-label={`Escribirle a ${r.nombre} por WhatsApp`}
                            className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-borde text-[#1fa855] hover:bg-arena-suave"
                          >
                            <IconoWhatsApp />
                          </a>
                        )}
                        {activa && (
                          <Link
                            href={`/?fecha=${r.fecha}&turno=${r.turno}&salonId=${r.salonId}`}
                            title="Ver en el panel"
                            className="rounded-lg border border-borde px-2.5 py-1 text-[13px] hover:bg-arena-suave"
                          >
                            Panel →
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-tinta-suave">
        Las canceladas quedan registradas aunque se borren de la grilla. Se muestran las de los últimos 90 días y todas las próximas.
      </p>
    </div>
  );
}

// Copia el link publico de reservas (este mismo sitio + /reservar).
function CopiarLink() {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/reservar`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // sin permiso de portapapeles: no pasa nada
    }
  }
  return (
    <button type="button" onClick={copiar} className="rounded-lg border border-borde bg-superficie px-3 py-1.5 text-sm hover:bg-arena-suave">
      {copiado ? "Link copiado" : "Copiar el link de reservas"}
    </button>
  );
}
