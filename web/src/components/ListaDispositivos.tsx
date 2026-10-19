"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import type { DispositivoSesion } from "@/lib/types";

// Lista de «Mis dispositivos» (mockup capax-avisos-y-recordarme, punto 4):
// dónde está la sesión abierta con «Recordarme» y dónde llegan los avisos,
// con «Cerrar sesión» para un celular perdido o una tablet que se cambió.
// La usan /dispositivos (cada uno los suyos) y /admin/usuarios (el admin, los
// de cada cuenta).

function cuando(iso: string) {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60_000);
  if (min < 2) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.round(h / 24);
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

function desde(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

function Icono({ nombre }: { nombre: string }) {
  const compu = /Windows|Mac|Linux/.test(nombre) && !/iPad|Android/.test(nombre);
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {compu ? (
        <>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8M12 16v4" />
        </>
      ) : (
        <>
          <rect x="5" y="2" width="14" height="20" rx="2.5" />
          <path d="M11 18h2" />
        </>
      )}
    </svg>
  );
}

export default function ListaDispositivos({
  cargar,
  quitar,
  vacio = "No hay dispositivos con «Recordarme» ni con avisos.",
}: {
  cargar: () => Promise<DispositivoSesion[]>;
  quitar: (d: DispositivoSesion) => Promise<DispositivoSesion[]>;
  vacio?: string;
}) {
  const [lista, setLista] = useState<DispositivoSesion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);

  const recargar = useCallback(() => {
    cargar()
      .then(setLista)
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudo cargar la lista"));
  }, [cargar]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function onQuitar(d: DispositivoSesion) {
    setQuitando(`${d.tipo}-${d.id}`);
    setError(null);
    try {
      setLista(await quitar(d));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cerrar");
    } finally {
      setQuitando(null);
    }
  }

  if (!lista) return <div className="ld-vacio">{error ?? "Cargando…"}</div>;

  return (
    <div className="ld">
      {error && <div className="ld-error">{error}</div>}
      {lista.length === 0 && <div className="ld-vacio">{vacio}</div>}
      {lista.map((d) => (
        <div key={`${d.tipo}-${d.id}`} className={`ld-fila ${d.esEste ? "este" : ""}`}>
          <span className="ld-ic">
            <Icono nombre={d.nombre} />
          </span>
          <span className="ld-tx">
            <b>{d.esEste ? `Este dispositivo · ${d.nombre}` : d.nombre}</b>
            <small>
              {d.recordado ? `Recordado desde el ${desde(d.desde)}` : `Avisos desde el ${desde(d.desde)}`} · {cuando(d.ultimoUso)}
            </small>
            <span className="ld-chips">
              {d.recordado && <i>Recordado</i>}
              <i className={d.conAvisos ? "" : "gris"}>{d.conAvisos ? "Con avisos" : "Sin avisos"}</i>
            </span>
          </span>
          {!d.esEste && (
            <button type="button" className="ld-cerrar" onClick={() => onQuitar(d)} disabled={quitando === `${d.tipo}-${d.id}`}>
              {d.recordado ? "Cerrar sesión" : "Quitar avisos"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
