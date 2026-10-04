"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, getMeta, getReporteMensual } from "@/lib/api";
import { esAdmin, haySesion } from "@/lib/auth";
import { NOMBRES_MES, armarPdfReporte } from "@/lib/reportePdf";
import { NOMBRES_DIA, agruparPorDiaSemana, turnosDelReporte } from "@/lib/reporteSemanal";
import type { ReporteMensual, Salon } from "@/lib/types";

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
  const [exportando, setExportando] = useState(false);
  // Vista previa del PDF antes de bajarlo: el blob: URL del documento ya
  // armado (se muestra en un <iframe>) y el nombre con el que se va a
  // descargar. null = modal cerrado.
  const [vistaPrevia, setVistaPrevia] = useState<{ url: string; nombreArchivo: string } | null>(null);

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

  // Mientras la vista previa está abierta: Escape la cierra. Al cerrarse (o
  // si se sale de la página) se libera el blob: URL para no dejar el PDF
  // ocupando memoria.
  useEffect(() => {
    if (!vistaPrevia) return;
    const { url } = vistaPrevia;
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") setVistaPrevia(null);
    }
    window.addEventListener("keydown", alTeclear);
    return () => {
      window.removeEventListener("keydown", alTeclear);
      URL.revokeObjectURL(url);
    };
  }, [vistaPrevia]);

  // "Exportar PDF": arma el PDF del reporte que se está viendo (mismo
  // mes/año/salón elegidos) y lo muestra en una vista previa — NO lo descarga
  // de una; recién se baja con "Descargar PDF" dentro de la vista previa
  // (ver descargarPdf). El documento lo arma lib/reportePdf.ts; acá solo se
  // importa jspdf (dinámico, igual que en el plano: no se carga hasta que
  // alguien aprieta el botón).
  async function exportarPdf() {
    if (!reporte || exportando) return;
    setExportando(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const salonNombre = salonId !== undefined ? (salones.find((s) => s.id === salonId)?.nombre ?? null) : null;
      armarPdfReporte(doc, reporte, salonNombre, turnosDelReporte(salones, salonId));

      const sufijoSalon = salonNombre
        ? `-${salonNombre
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")}`
        : "";
      setVistaPrevia({
        url: URL.createObjectURL(doc.output("blob")),
        nombreArchivo: `reporte-asistencia-${reporte.anio}-${String(reporte.mes).padStart(2, "0")}${sufijoSalon}.pdf`,
      });
    } catch {
      setError("No se pudo generar el PDF del reporte");
    } finally {
      setExportando(false);
    }
  }

  // Baja el PDF de la vista previa. Se fuerza con un <a download> sobre el
  // blob: URL (mismo método que exportarPdf en PlanoSalon.tsx) porque
  // doc.save() en algunos navegadores abre el PDF en vez de descargarlo.
  // Después de bajarlo se cierra la vista previa.
  function descargarPdf() {
    if (!vistaPrevia) return;
    const enlace = document.createElement("a");
    enlace.href = vistaPrevia.url;
    enlace.download = vistaPrevia.nombreArchivo;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    setVistaPrevia(null);
  }

  if (!listo) return null;

  // Una fila por día de la semana + turno (todos los lunes almuerzo del mes
  // juntos, todos los lunes cena, todos los martes almuerzo...) — ver
  // lib/reporteSemanal.ts. Se calcula acá, en el frontend, a partir de las
  // filas por fecha que ya devuelve el backend.
  const filas = reporte ? agruparPorDiaSemana(reporte.porDiaYTurno, turnosDelReporte(salones, salonId)) : [];

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
        {/* ml-auto: queda a la derecha de los filtros. Deshabilitado mientras
            carga, para no exportar el reporte del mes anterior mientras
            todavía está llegando el del mes recién elegido. */}
        <button
          onClick={exportarPdf}
          disabled={cargando || !reporte || exportando}
          title="Descargar este reporte (mes, año y salón elegidos) como PDF"
          className="ml-auto rounded-lg border border-borde px-3 py-1.5 text-sm hover:bg-arena-suave disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exportando ? "Generando…" : "Exportar PDF"}
        </button>
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

          <div className="overflow-x-auto rounded-2xl border border-borde bg-superficie shadow-sm">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-borde text-left text-[11px] tracking-wide text-tinta-suave uppercase">
                  <th className="px-3.5 py-2.5">Día</th>
                  <th className="px-3.5 py-2.5">Turno</th>
                  <th className="px-3.5 py-2.5 text-right" title="Cuántos días de ese tipo tuvieron reservas en el mes">
                    Días
                  </th>
                  <th className="px-3.5 py-2.5 text-right">Reservas</th>
                  <th className="px-3.5 py-2.5 text-right">Pax</th>
                  <th className="px-3.5 py-2.5 text-right" title="Pax promedio por día">
                    Pax prom.
                  </th>
                  <th className="px-3.5 py-2.5 text-right">Asistió</th>
                  <th className="px-3.5 py-2.5 text-right">% asistencia</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => {
                  // El nombre del día solo en la primera fila de cada día
                  // (lunes almuerzo / lunes cena -> "Lunes" una sola vez), y
                  // una línea más marcada al empezar un día nuevo.
                  const primeroDelDia = i === 0 || filas[i - 1].diaSemana !== f.diaSemana;
                  return (
                    <tr
                      key={`${f.diaSemana}:${f.turno}`}
                      className={`border-b border-borde last:border-0 ${primeroDelDia && i > 0 ? "border-t-2" : ""}`}
                    >
                      <td className="px-3.5 py-2 font-semibold">{primeroDelDia ? NOMBRES_DIA[f.diaSemana] : ""}</td>
                      <td className="px-3.5 py-2 capitalize">{f.turno}</td>
                      <td className="px-3.5 py-2 text-right tabular-nums">{f.dias}</td>
                      <td className="px-3.5 py-2 text-right tabular-nums">{f.reservas}</td>
                      <td className="px-3.5 py-2 text-right tabular-nums">{f.pax}</td>
                      <td className="px-3.5 py-2 text-right tabular-nums">{f.paxPromedio}</td>
                      <td className="px-3.5 py-2 text-right tabular-nums">{f.asistio}</td>
                      <td className="px-3.5 py-2 text-right tabular-nums">{f.porcentajeAsistencia}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {vistaPrevia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setVistaPrevia(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Vista previa del reporte en PDF"
            onClick={(e) => e.stopPropagation()}
            className="flex h-full max-h-[920px] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-borde bg-superficie shadow-lg"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borde px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-base font-bold">Vista previa</h2>
                <p className="truncate text-xs text-tinta-suave">{vistaPrevia.nombreArchivo}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setVistaPrevia(null)}
                  className="rounded-lg border border-borde px-3 py-1.5 text-sm hover:bg-arena-suave"
                >
                  Cerrar
                </button>
                <button
                  autoFocus
                  onClick={descargarPdf}
                  className="rounded-lg bg-marca px-3.5 py-1.5 text-sm text-white"
                >
                  Descargar PDF
                </button>
              </div>
            </div>
            {/* #view=FitH: que el visor del navegador ajuste la hoja al ancho
                del recuadro. Es el visor de PDF propio del navegador
                (Chrome/Edge/Firefox); si el navegador no puede mostrar PDFs
                adentro de la página, el aviso de abajo explica que igual se
                puede descargar. */}
            <iframe
              title="Vista previa del reporte en PDF"
              src={`${vistaPrevia.url}#view=FitH&navpanes=0`}
              className="min-h-0 flex-1 bg-white"
            />
            <p className="border-t border-borde px-4 py-2 text-[11px] text-tinta-suave">
              Si no ves el documento acá, igual lo podés bajar con &quot;Descargar PDF&quot;.
            </p>
          </div>
        </div>
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
