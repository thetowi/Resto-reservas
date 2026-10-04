import type { jsPDF } from "jspdf";
import { NOMBRES_DIA, NOMBRE_TURNO, tablasPorTurno } from "./reporteSemanal";
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
const ALTO_FILA = 6;
const ALTO_TITULO_TABLA = 8;
const SEPARACION_TABLAS = 4;
const ALTO_PIE = 10;

// Columnas de cada tabla (anchos en mm, suman el ancho útil de un A4 vertical
// con MARGEN de 14 a cada lado = 182). Los números van alineados a la
// derecha para que se lean en columna; la última (Ocupación) lleva una
// "píldora" con el peso de la fila dentro de las reservas del turno (ver
// FilaTabla en lib/reporteSemanal.ts). Hay una tabla por TURNO (Almuerzo,
// Merienda, Cena) con una fila por día de la semana — todos los lunes del
// mes juntos, etc.
const COLUMNAS: { titulo: string; ancho: number; derecha: boolean }[] = [
  { titulo: "Día", ancho: 28, derecha: false },
  { titulo: "Días", ancho: 14, derecha: true },
  { titulo: "Reservas", ancho: 22, derecha: true },
  { titulo: "Pax", ancho: 16, derecha: true },
  { titulo: "Pax prom.", ancho: 22, derecha: true },
  { titulo: "Asistió", ancho: 18, derecha: true },
  { titulo: "% asist.", ancho: 20, derecha: true },
  { titulo: "Ocupación", ancho: 42, derecha: false },
];

// Colores de la píldora (paleta clara de la app): pista gris azulada, relleno
// azul medio para las filas comunes y el azul de marca para la/s de mayor
// ocupación.
const COLOR_PILDORA_PISTA = "#dae1e6";
const COLOR_PILDORA = "#8fa9bd";
const COLOR_PILDORA_MAX = "#143d58";
const ANCHO_PILDORA = 24;
const ALTO_PILDORA = 2.6;

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

  // --- Una tabla por turno (Almuerzo / Merienda / Cena) ---
  const tablas = tablasPorTurno(reporte.porDiaYTurno, turnos);
  const anchoTabla = COLUMNAS.reduce((acc, c) => acc + c.ancho, 0);
  const alturaTabla = ALTO_TITULO_TABLA + 7.5 + 7 * ALTO_FILA + ALTO_FILA + 0.5;

  let y = yTarjetas + altoTarjeta + 8;

  tablas.forEach((tabla) => {
    // Una tabla nunca se parte entre dos hojas: si no entera en lo que queda
    // de la hoja, empieza en la siguiente.
    if (y + alturaTabla > limiteInferior) {
      doc.addPage();
      y = MARGEN;
    }

    // Título del turno, con un filete de color de marca a la izquierda.
    doc.setFillColor(COLOR_MARCA);
    doc.rect(MARGEN, y + 1, 1.2, 5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(COLOR_TINTA);
    doc.text(NOMBRE_TURNO[tabla.turno], MARGEN + 3.5, y + 5.2);
    y += ALTO_TITULO_TABLA;

    y = dibujarEncabezadoTabla(doc, y);

    tabla.filas.forEach((f, i) => {
      if (i % 2 === 1) {
        doc.setFillColor(COLOR_ZEBRA);
        doc.rect(MARGEN, y, anchoTabla, ALTO_FILA, "F");
      }
      doc.setFontSize(9);
      doc.setTextColor(COLOR_TINTA);
      doc.setFont("helvetica", "bold");
      doc.text(NOMBRES_DIA[f.diaSemana], MARGEN + 3, y + 4.2);
      doc.setFont("helvetica", "normal");
      let x = MARGEN + COLUMNAS[0].ancho;
      [
        String(f.dias),
        String(f.reservas),
        String(f.pax),
        String(f.paxPromedio),
        String(f.asistio),
        `${f.porcentajeAsistencia}%`,
      ].forEach((texto, k) => {
        const col = COLUMNAS[k + 1];
        doc.text(texto, x + col.ancho - 3, y + 4.2, { align: "right" });
        x += col.ancho;
      });

      // Píldora de ocupación: pista completa = 100% de las reservas del
      // turno; el relleno mide el peso de esta fila. La/s fila/s con la
      // mayor ocupación (si es mayor a 0) van en azul de marca y el número
      // en negrita, para encontrarlas de un vistazo.
      const colOcup = COLUMNAS[COLUMNAS.length - 1];
      const esMax = tabla.maxOcupacion > 0 && f.ocupacion === tabla.maxOcupacion;
      const xPildora = x + 3;
      const yPildora = y + (ALTO_FILA - ALTO_PILDORA) / 2;
      doc.setFillColor(COLOR_PILDORA_PISTA);
      doc.roundedRect(xPildora, yPildora, ANCHO_PILDORA, ALTO_PILDORA, ALTO_PILDORA / 2, ALTO_PILDORA / 2, "F");
      if (f.ocupacion > 0) {
        const anchoRelleno = Math.max((ANCHO_PILDORA * f.ocupacion) / 100, ALTO_PILDORA);
        doc.setFillColor(esMax ? COLOR_PILDORA_MAX : COLOR_PILDORA);
        doc.roundedRect(xPildora, yPildora, anchoRelleno, ALTO_PILDORA, ALTO_PILDORA / 2, ALTO_PILDORA / 2, "F");
      }
      doc.setFont("helvetica", esMax ? "bold" : "normal");
      doc.text(`${f.ocupacion}%`, x + colOcup.ancho - 3, y + 4.2, { align: "right" });
      y += ALTO_FILA;
    });

    // Total del turno en el mes.
    doc.setDrawColor(COLOR_TINTA);
    doc.setLineWidth(0.4);
    doc.line(MARGEN, y, MARGEN + anchoTabla, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(COLOR_TINTA);
    dibujarFila(doc, y + 4.5, [
      `Total ${NOMBRE_TURNO[tabla.turno].toLowerCase()}`,
      String(tabla.total.dias),
      String(tabla.total.reservas),
      String(tabla.total.pax),
      String(tabla.total.paxPromedio),
      String(tabla.total.asistio),
      `${tabla.total.porcentajeAsistencia}%`,
      "",
    ]);
    // El total de Ocupación (100%, o 0% si no hubo reservas) va a la derecha
    // de su columna, alineado con los números de las píldoras de arriba y
    // sin píldora propia.
    doc.text(`${tabla.total.ocupacion}%`, MARGEN + anchoTabla - 3, y + 4.5, { align: "right" });
    y += ALTO_FILA + 0.5 + SEPARACION_TABLAS;
  });

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
