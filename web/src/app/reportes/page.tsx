"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, getMeta, getReporteMensual } from "@/lib/api";
import { esAdmin, haySesion } from "@/lib/auth";
import type { ReporteMensual, Salon } from "@/lib/types";

const NOMBRES_MES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function mesActual() {
  const ahora = new Date();
  return { anio: ahora.getFullYear(), mes: ahora.getMonth() + 1 };
}

// Reporte estadistico mensual (solo Admin): "% de asistencias me gusta, me
// gustaria poder hacer un reporte por mes, con un reporte estadistico". Los
// numeros salen de ReportesController.GetMensual, que ya ignora las filas
// "vacias" que se auto-generan por turno (Pax == null) — aca solo se
// muestran/formatean.
export default function ReportesPage() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [{ anio, mes }, setPeriodo] = useState(mesActual);
  const [salones, setSalones] = useState<Salon[]>([]);
  // undefined = "todos los salones combinados" (default); un id puntual
  // limita el reporte a ese salon solo (ver ReportesController.Mensual).
  const [salonId, setSalonId] = useState<number | undefined>(undefined);
  const [reporte, setReporte] = useState<ReporteMensual | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!haySesion()) {
      router.replace("/login");
      return;
    }
    if (!esAdmin()) {
      router.replace("/");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setListo(true);
  }, [router]);

  useEffect(() => {
    if (!listo) return;
    getMeta()
      .then((meta) => setSalones(meta.salones))
      .catch(() => {
        // si falla, el reporte sigue funcionando igual sin el filtro por salon
      });
  }, [listo]);

  useEffect(() => {
    if (!listo) return;
    let activo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true);
    getReporteMensual(anio, mes, salonId)
      .then((data) => {
        if (activo) setReporte(data);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error cargando el reporte"))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [listo, anio, mes, salonId]);

  if (!listo) return null;

  const filas = reporte
    ? [...reporte.porDiaYTurno].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.turno.localeCompare(b.turno))
    : [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <Link href="/" className="text-xs text-tinta-suave underline hover:text-tinta">
          ← Volver a reservas
        </Link>
        <h1 className="mt-1 text-lg font-bold">Reporte mensual de asistencia</h1>
      </div>

      <div className="mb-5 flex items-center gap-2.5">
        <select
          className="rounded-lg border border-borde px-2.5 py-1.5 text-sm"
          value={mes}
          onChange={(e) => setPeriodo({ anio, mes: Number(e.target.value) })}
        >
          {NOMBRES_MES.map((nombre, i) => (
            <option key={i} value={i + 1}>
              {nombre}
            </option>
          ))}
        </select>
        <input
          type="number"
          className="w-24 rounded-lg border border-borde px-2.5 py-1.5 text-sm"
          value={anio}
          onChange={(e) => setPeriodo({ anio: Number(e.target.value) || anio, mes })}
        />
        <select
          className="rounded-lg border border-borde px-2.5 py-1.5 text-sm"
          value={salonId ?? ""}
          onChange={(e) => setSalonId(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">Todos los salones</option>
          {salones.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-ocupada-suave px-4 py-2.5 text-sm text-ocupada">{error}</div>
      )}

      {cargando || !reporte ? (
        <div className="p-10 text-center text-tinta-suave">Cargando…</div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            <TarjetaResumen etiqueta="Reservas" valor={reporte.totalReservas} />
            <TarjetaResumen etiqueta="Pax total" valor={reporte.totalPax} />
            <TarjetaResumen etiqueta="Asistió" valor={reporte.totalAsistio} />
            <TarjetaResumen etiqueta="% asistencia" valor={`${reporte.porcentajeAsistencia}%`} />
          </div>

          <div className="overflow-hidden rounded-2xl border border-borde bg-superficie shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-borde text-left text-[11px] tracking-wide text-tinta-suave uppercase">
                  <th className="px-3.5 py-2.5">Fecha</th>
                  <th className="px-3.5 py-2.5">Turno</th>
                  <th className="px-3.5 py-2.5">Reservas</th>
                  <th className="px-3.5 py-2.5">Pax</th>
                  <th className="px-3.5 py-2.5">Asistió</th>
                  <th className="px-3.5 py-2.5">% asistencia</th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3.5 py-6 text-center text-tinta-suave">
                      Sin reservas cargadas en este mes.
                    </td>
                  </tr>
                ) : (
                  filas.map((f) => (
                    <tr key={`${f.fecha}:${f.turno}`} className="border-b border-borde last:border-0">
                      <td className="px-3.5 py-2">{f.fecha}</td>
                      <td className="px-3.5 py-2 capitalize">{f.turno}</td>
                      <td className="px-3.5 py-2">{f.cantidadReservas}</td>
                      <td className="px-3.5 py-2">{f.totalPax}</td>
                      <td className="px-3.5 py-2">{f.totalAsistio}</td>
                      <td className="px-3.5 py-2">{f.porcentajeAsistencia}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function TarjetaResumen({ etiqueta, valor }: { etiqueta: string; valor: string | number }) {
  return (
    <div className="rounded-2xl border border-borde bg-superficie p-4 shadow-sm">
      <div className="text-[11px] tracking-wide text-tinta-suave uppercase">{etiqueta}</div>
      <div className="mt-1 text-2xl font-bold">{valor}</div>
    </div>
  );
}
