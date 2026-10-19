"use client";

import { useEffect, useState } from "react";

// Logo del restaurante para la intro de /reservar (opción A del mockup
// barrancas-intro): se lee el SVG de la portada (LOGOS_CLIENTE.portada, el
// mismo que se ve después) y se separa en piezas para animarlas:
//   marca  → la B (se dibuja con un trazo y se rellena)
//   acento → la onda dorada (corre de izquierda a derecha)
//   letras → «BARRANCAS», una por una (suben)
//   sub    → «RESTAURANT» (se acomoda)
// La regla es genérica para otros restaurantes: el acento es el primer
// trazo de color (ni blanco ni negro); lo de antes es la marca, el trazo de
// después son las letras y lo que queda, la bajada. Si el SVG no tiene esa
// forma, se muestra el logo entero apareciendo (ver onListo / respaldo).

interface Partes {
  viewBox: string;
  marca: { d: string; fill: string }[];
  acento: { d: string; fill: string } | null;
  letras: { d: string; fill: string }[];
  sub: { d: string; fill: string }[];
}

const NEUTROS = new Set(["#fff", "#ffffff", "white", "#000", "#000000", "black", "#111", "#111111"]);

type Caja = { x0: number; x1: number; y0: number; y1: number };

// Caja de un subtrazo con comandos absolutos (M/L/C/Z): los números van de a
// pares x,y. Si hay comandos relativos o de otro tipo, no se puede separar.
function caja(d: string): Caja | null {
  if (/[a-zHVSQTA]/.test(d.replace(/[eE][-+]?\d/g, ""))) return null;
  const n = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  if (n.length < 2) return null;
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (let i = 0; i + 1 < n.length; i += 2) {
    x0 = Math.min(x0, n[i]);
    x1 = Math.max(x1, n[i]);
    y0 = Math.min(y0, n[i + 1]);
    y1 = Math.max(y1, n[i + 1]);
  }
  return { x0, x1, y0, y1 };
}

// Separa un trazo de texto en letras: cada subtrazo ("M…") es una letra o un
// hueco de una letra (el centro de la A o de la R), que va con la letra que
// lo contiene.
function separarLetras(d: string): string[] | null {
  const subs = d.match(/M[^M]+/g);
  if (!subs || subs.length < 2) return null;
  const items = subs.map((s) => ({ s, c: caja(s) }));
  if (items.some((i) => !i.c)) return null;
  const grupos: { c: Caja; partes: string[] }[] = [];
  for (const it of [...items].sort((a, b) => (b.c!.x1 - b.c!.x0) * (b.c!.y1 - b.c!.y0) - (a.c!.x1 - a.c!.x0) * (a.c!.y1 - a.c!.y0))) {
    const c = it.c!;
    const dueno = grupos.find((g) => c.x0 >= g.c.x0 - 0.5 && c.x1 <= g.c.x1 + 0.5 && c.y0 >= g.c.y0 - 0.5 && c.y1 <= g.c.y1 + 0.5);
    if (dueno) dueno.partes.push(it.s);
    else grupos.push({ c, partes: [it.s] });
  }
  return grupos.sort((a, b) => a.c.x0 - b.c.x0).map((g) => g.partes.join(" "));
}

function partir(texto: string): Partes | null {
  const doc = new DOMParser().parseFromString(texto, "image/svg+xml");
  const svg = doc.querySelector("svg");
  const viewBox = svg?.getAttribute("viewBox");
  if (!svg || !viewBox) return null;
  const paths = [...svg.querySelectorAll("path")].map((p) => ({ d: p.getAttribute("d") ?? "", fill: (p.getAttribute("fill") ?? "#fff").toLowerCase() }));
  const iAcento = paths.findIndex((p) => !NEUTROS.has(p.fill));
  if (iAcento < 1 || iAcento + 1 >= paths.length) return null;
  const texto1 = paths[iAcento + 1];
  const letras = separarLetras(texto1.d)?.map((d) => ({ d, fill: texto1.fill })) ?? [texto1];
  return { viewBox, marca: paths.slice(0, iAcento), acento: paths[iAcento], letras, sub: paths.slice(iAcento + 2) };
}

export default function IntroLogoCliente({ src, alt, onListo }: { src: string; alt: string; onListo: () => void }) {
  const [partes, setPartes] = useState<Partes | "imagen" | null>(null);

  useEffect(() => {
    let vigente = true;
    // Si el logo tarda, se usa la imagen tal cual para no dejar la intro en negro.
    const respaldo = setTimeout(() => vigente && setPartes((p) => p ?? "imagen"), 1200);
    fetch(src)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((t) => vigente && setPartes((p) => (p === null ? (partir(t) ?? "imagen") : p)))
      .catch(() => vigente && setPartes((p) => p ?? "imagen"));
    return () => {
      vigente = false;
      clearTimeout(respaldo);
    };
  }, [src]);

  useEffect(() => {
    if (partes) onListo();
  }, [partes, onListo]);

  if (!partes) return null;
  if (partes === "imagen") {
    // eslint-disable-next-line @next/next/no-img-element -- SVG estatico de public/
    return <img className="ri-logo ri-logo-img" src={src} alt={alt} />;
  }
  return (
    <svg className="ri-logo" viewBox={partes.viewBox} role="img" aria-label={alt}>
      {partes.marca.map((p, i) => (
        <path key={`m${i}`} className="ri-marca" d={p.d} fill={p.fill} stroke={p.fill} pathLength={1} />
      ))}
      {partes.acento && <path className="ri-acento" d={partes.acento.d} fill={partes.acento.fill} />}
      {partes.letras.map((p, i) => (
        <path key={`l${i}`} className="ri-letra" style={{ "--i": i } as React.CSSProperties} d={p.d} fill={p.fill} />
      ))}
      {partes.sub.map((p, i) => (
        <path key={`s${i}`} className="ri-sub" d={p.d} fill={p.fill} />
      ))}
    </svg>
  );
}
