import type { Espera, Mesa, TurnoData } from "@/lib/types";
import { formatFechaLarga } from "@/lib/date";

interface Props {
  fecha: string;
  // Nombre del salón elegido en pantalla (Restaurant, Bar, Aqua Bar, etc):
  // se muestra en el encabezado para que quede claro a qué salón corresponde
  // el papel — null solo puede pasar en un instante transitorio antes de que
  // "meta" termine de cargar.
  salonNombre: string | null;
  mesas: Mesa[];
  almuerzo: TurnoData;
  cena: TurnoData;
  esperaAlmuerzo: Espera[];
  esperaCena: Espera[];
}

// Vista de impresion del dia ("Impresion del dia me parece algo excelente"):
// a proposito NO reutiliza ShiftSection/ReservaRow (esos son interactivos,
// con inputs editables y drag) — esto es un documento de solo lectura,
// pensado para llevarlo en papel durante el servicio. Vive oculta en
// pantalla (Tailwind "hidden print:block", ver globals.css para el @page)
// y se muestra unicamente cuando la pagina entra en modo impresion.
export default function ReporteImpresion({
  fecha,
  salonNombre,
  mesas,
  almuerzo,
  cena,
  esperaAlmuerzo,
  esperaCena,
}: Props) {
  const codigoMesa = (id: number) => mesas.find((m) => m.id === id)?.codigo ?? `#${id}`;

  return (
    <div className="hidden print:block">
      <header className="mb-5 border-b-2 border-tinta pb-2.5">
        <div className="text-lg font-bold tracking-wide">
          BARRANCAS{salonNombre ? ` · ${salonNombre}` : ""} · Reporte del día
        </div>
        <div className="text-sm">{formatFechaLarga(fecha)}</div>
      </header>

      <BloqueTurnoImpresion titulo="Almuerzo" data={almuerzo} espera={esperaAlmuerzo} codigoMesa={codigoMesa} />
      <div className="my-6 border-t border-tinta" />
      <BloqueTurnoImpresion titulo="Cena" data={cena} espera={esperaCena} codigoMesa={codigoMesa} />
    </div>
  );
}

function BloqueTurnoImpresion({
  titulo,
  data,
  espera,
  codigoMesa,
}: {
  titulo: string;
  data: TurnoData;
  espera: Espera[];
  codigoMesa: (id: number) => string;
}) {
  // Igual criterio que el backend (ReportesController) para distinguir una
  // reserva real de una fila "vacia" auto-generada por horario: si tiene
  // pax cargado, es una reserva real.
  const reservas = data.reservas.filter((r) => r.pax !== null);
  const walkIns = data.mesasWalkIn.map(codigoMesa);
  const esperaOrdenada = [...espera].sort((a, b) => a.orden - b.orden);

  return (
    <section className="break-inside-avoid">
      <h2 className="mb-2 text-base font-bold uppercase tracking-wide">{titulo}</h2>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-tinta text-left uppercase">
            <th className="py-1 pr-2">Hora</th>
            <th className="py-1 pr-2">Mesa</th>
            <th className="py-1 pr-2">Pedida</th>
            <th className="py-1 pr-2">Pax</th>
            <th className="py-1 pr-2">Apellido / Nombre</th>
            <th className="py-1 pr-2">Hab / Tel</th>
            <th className="py-1 pr-2">Comentarios</th>
            <th className="py-1 pr-2">Asistió</th>
          </tr>
        </thead>
        <tbody>
          {reservas.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-2 text-center text-tinta-suave">
                Sin reservas cargadas.
              </td>
            </tr>
          ) : (
            reservas.map((r) => (
              <tr key={r.id} className="border-b border-borde">
                <td className="py-1 pr-2">{r.hora ?? "—"}</td>
                <td className="py-1 pr-2">{r.mesaCodigos.length > 0 ? r.mesaCodigos.join(", ") : "—"}</td>
                <td className="py-1 pr-2">{r.pidioMesa ? "Sí" : ""}</td>
                <td className="py-1 pr-2">{r.pax ?? "—"}</td>
                <td className="py-1 pr-2">{r.nombre ?? "—"}</td>
                <td className="py-1 pr-2">{r.habTel ?? "—"}</td>
                <td className="py-1 pr-2">{r.comentarios ?? ""}</td>
                <td className="py-1 pr-2">{r.asistio ? "Sí" : "No"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="mt-1.5 flex gap-6 text-xs font-semibold">
        <span>Total pax: {data.totalPax}</span>
        <span>Asistió: {data.totalAsistio}</span>
        <span>Mesas ocupadas: {data.mesasOcupadas.length}</span>
      </div>

      <div className="mt-2.5 text-xs">
        <strong>Walk-ins: </strong>
        {walkIns.length > 0 ? walkIns.join(", ") : "ninguno"}
      </div>

      <div className="mt-2.5 text-xs">
        <strong>Lista de espera ({esperaOrdenada.length}):</strong>
        {esperaOrdenada.length === 0 ? (
          " ninguna"
        ) : (
          <ol className="mt-1 list-decimal pl-5">
            {esperaOrdenada.map((e) => (
              <li key={e.id}>
                {e.nombre ?? "—"} {e.pax ? `(${e.pax} pax)` : ""} {e.habTel ? `· ${e.habTel}` : ""}
                {e.ubicada ? " · sentada" : ""}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
