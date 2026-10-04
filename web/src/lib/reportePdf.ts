import type { jsPDF } from "jspdf";
import { NOMBRES_DIA, agruparPorDiaSemana } from "./reporteSemanal";
import type { ReporteMensual, Turno } from "./types";

// PDF del reporte mensual de asistencia (ver app/reportes/page.tsx, botón
// "Exportar PDF"). Mismo criterio que el PDF del plano (exportarPdf en
// PlanoSalon.tsx): se DIBUJA con jsPDF a partir de los datos, en vez de
// capturar la pantalla con html2canvas — así sale siempre igual (en claro,
// tipografía nítida, texto seleccionable) sin importar el tema o el tamaño
// de la ventana, y no choca con los color-mix(...) de Tailwind v4.
//
// Esta función solo arma el documento sobre el jsPDF que recibe (A4 vertical,
// en mm); la página se encarga de importar jspdf y de descargar el archivo.

export const NOMBRES_MES = [
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

// Colores de la paleta clara de la app (globals.css :root), como literales:
// el PDF siempre sale en claro, igual que el del plano.
const COLOR_TINTA = "#13242e";
const COLOR_TINTA_SUAVE = "#576066";
const COLOR_BORDE = "#c8d2da";
const COLOR_MARCA = "#0c2637";
const COLOR_ZEBRA = "#f0f3f6";

const MARGEN = 14;
const ALTO_FILA = 6.5;
const ALTO_PIE = 10;

// Columnas de la tabla (anchos en mm, suman el ancho útil de un A4 vertical
// con MARGEN de 14 a cada lado = 182). Los números van alineados a la
// derecha para que se lean en columna. Una fila por DÍA DE LA SEMANA +
// TURNO (todos los lunes almuerzo juntos, etc. — ver lib/reporteSemanal.ts).
const COLUMNAS: { titulo: string; ancho: number; derecha: boolean }[] = [
  { titulo: "Día", ancho: 32, derecha: false },
  { titulo: "Turno", ancho: 26, derecha: false },
  { titulo: "Días", ancho: 16, derecha: true },
  { titulo: "Reservas", ancho: 22, derecha: true },
  { titulo: "Pax", ancho: 20, derecha: true },
  { titulo: "Pax prom.", ancho: 24, derecha: true },
  { titulo: "Asistió", ancho: 18, derecha: true },
  { titulo: "% asistencia", ancho: 24, derecha: true },
];

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function ahoraTexto(): string {
  const a = new Date();
  const dd = String(a.getDate()).padStart(2, "0");
  const mm = String(a.getMonth() + 1).padStart(2, "0");
  const hh = String(a.getHours()).padStart(2, "0");
  const mi = String(a.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${a.getFullYear()} ${hh}:${mi}`;
}

function dibujarFila(doc: jsPDF, y: number, celdas: string[]) {
  let x = MARGEN;
  COLUMNAS.forEach((col, i) => {
    if (col.derecha) {
      doc.text(celdas[i], x + col.ancho - 3, y, { align: "right" });
    } else {
      doc.text(celdas[i], x + 3, y);
    }
    x += col.ancho;
  });
}

function dibujarEncabezadoTabla(doc: jsPDF, y: number): number {
  const anchoTabla = COLUMNAS.reduce((acc, c) => acc + c.ancho, 0);
  doc.setFillColor(COLOR_MARCA);
  doc.rect(MARGEN, y, anchoTabla, 7.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor("#ffffff");
  dibujarFila(
    doc,
    y + 4.9,
    COLUMNAS.map((c) => c.titulo.toUpperCase()),
  );
  return y + 7.5;
}

export function armarPdfReporte(doc: jsPDF, reporte: ReporteMensual, salonNombre: string | null, turnos: Turno[]) {
  const anchoPagina = doc.internal.pageSize.getWidth();
  const altoPagina = doc.internal.pageSize.getHeight();
  const anchoUtil = anchoPagina - MARGEN * 2;
  const limiteInferior = altoPagina - MARGEN - ALTO_PIE;
  const periodo = `${NOMBRES_MES[reporte.mes - 1]} ${reporte.anio}`;

  // --- Encabezado ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(COLOR_TINTA);
  doc.text("Reporte mensual de asistencia", MARGEN, MARGEN + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(COLOR_TINTA_SUAVE);
  doc.text(`${periodo} · ${salonNombre ?? "Todos los salones"}`, MARGEN, MARGEN + 11);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(COLOR_TINTA);
  doc.text("BARRANCAS", anchoPagina - MARGEN, MARGEN + 5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(COLOR_TINTA_SUAVE);
  doc.text(`Generado el ${ahoraTexto()}`, anchoPagina - MARGEN, MARGEN + 11, { align: "right" });

  doc.setDrawColor(COLOR_BORDE);
  doc.setLineWidth(0.3);
  doc.line(MARGEN, MARGEN + 15, anchoPagina - MARGEN, MARGEN + 15);

  // --- Resumen (mismas 4 tarjetas que la pantalla) ---
  const yTarjetas = MARGEN + 21;
  const separacion = 4;
  const anchoTarjeta = (anchoUtil - separacion * 3) / 4;
  const altoTarjeta = 18;
  const tarjetas: [string, string][] = [
    ["Reservas", String(reporte.totalReservas)],
    ["Pax total", String(reporte.totalPax)],
    ["Asistió", String(reporte.totalAsistio)],
    ["% asistencia", `${reporte.porcentajeAsistencia}%`],
  ];
  tarjetas.forEach(([etiqueta, valor], i) => {
    const x = MARGEN + i * (anchoTarjeta + separacion);
    doc.setDrawColor(COLOR_BORDE);
    doc.roundedRect(x, yTarjetas, anchoTarjeta, altoTarjeta, 2, 2, "S");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(COLOR_TINTA_SUAVE);
    doc.text(etiqueta.toUpperCase(), x + 4, yTarjetas + 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(COLOR_TINTA);
    doc.text(valor, x + 4, yTarjetas + 14);
  });

  // --- Tabla por día de la semana y turno ---
  const filas = agruparPorDiaSemana(reporte.porDiaYTurno, turnos);
  const anchoTabla = COLUMNAS.reduce((acc, c) => acc + c.ancho, 0);

  let y = dibujarEncabezadoTabla(doc, yTarjetas + altoTarjeta + 8);

  // El zebra alterna por DÍA (no por fila): así "Lunes almuerzo" y "Lunes
  // cena" quedan con el mismo fondo y se leen como un bloque.
  let bloque = 0;
  filas.forEach((f, i) => {
    const primeroDelDia = i === 0 || filas[i - 1].diaSemana !== f.diaSemana;
    if (primeroDelDia && i > 0) bloque += 1;

    // Salto de página: la fila no entra antes del pie -> hoja nueva, con
    // el encabezado de la tabla repetido arriba para no perder qué es
    // cada columna.
    if (y + ALTO_FILA > limiteInferior) {
      doc.addPage();
      y = dibujarEncabezadoTabla(doc, MARGEN);
    }
    if (bloque % 2 === 1) {
      doc.setFillColor(COLOR_ZEBRA);
      doc.rect(MARGEN, y, anchoTabla, ALTO_FILA, "F");
    }
    if (primeroDelDia && i > 0) {
      doc.setDrawColor(COLOR_BORDE);
      doc.setLineWidth(0.3);
      doc.line(MARGEN, y, MARGEN + anchoTabla, y);
    }
    doc.setFontSize(9);
    doc.setTextColor(COLOR_TINTA);
    // El nombre del día solo en la primera fila de cada día, en negrita.
    doc.setFont("helvetica", "bold");
    if (primeroDelDia) doc.text(NOMBRES_DIA[f.diaSemana], MARGEN + 3, y + 4.4);
    doc.setFont("helvetica", "normal");
    let x = MARGEN + COLUMNAS[0].ancho;
    [
      capitalizar(f.turno),
      String(f.dias),
      String(f.reservas),
      String(f.pax),
      String(f.paxPromedio),
      String(f.asistio),
      `${f.porcentajeAsistencia}%`,
    ].forEach((texto, k) => {
      const col = COLUMNAS[k + 1];
      if (col.derecha) doc.text(texto, x + col.ancho - 3, y + 4.4, { align: "right" });
      else doc.text(texto, x + 3, y + 4.4);
      x += col.ancho;
    });
    y += ALTO_FILA;
  });

  // Fila de total del mes al pie de la tabla.
  if (y + ALTO_FILA + 1 > limiteInferior) {
    doc.addPage();
    y = dibujarEncabezadoTabla(doc, MARGEN);
  }
  doc.setDrawColor(COLOR_TINTA);
  doc.setLineWidth(0.4);
  doc.line(MARGEN, y, MARGEN + anchoTabla, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(COLOR_TINTA);
  dibujarFila(doc, y + 4.9, [
    "Total del mes",
    "",
    "",
    String(reporte.totalReservas),
    String(reporte.totalPax),
    "",
    String(reporte.totalAsistio),
    `${reporte.porcentajeAsistencia}%`,
  ]);

  // --- Pie en todas las hojas (se agrega al final para saber el total) ---
  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    const yPie = altoPagina - MARGEN;
    doc.setDrawColor(COLOR_BORDE);
    doc.setLineWidth(0.3);
    doc.line(MARGEN, yPie - 5, anchoPagina - MARGEN, yPie - 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(COLOR_TINTA_SUAVE);
    doc.text(`Barrancas · Reporte mensual de asistencia · ${periodo}`, MARGEN, yPie);
    doc.text(`Página ${p} de ${totalPaginas}`, anchoPagina - MARGEN, yPie, { align: "right" });
  }
}
