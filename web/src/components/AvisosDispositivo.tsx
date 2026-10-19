"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, probarPush } from "@/lib/api";
import { activarAvisos, desactivarAvisos, estadoAvisos, esIOS, type EstadoAvisos } from "@/lib/push";

// Tarjeta «Avisos de reservas web» (mockup capax-avisos-y-recordarme, punto
// 2): interruptor para este dispositivo, aviso de prueba y, en el iPhone sin
// instalar, los pasos para agregar capax a la pantalla de inicio. Va en el
// «Más» del celular y en «Mis dispositivos».

const TEXTO: Record<EstadoAvisos, string> = {
  cargando: "…",
  prendido: "Prendidos en este dispositivo",
  apagado: "Apagados en este dispositivo",
  bloqueado: "Bloqueados en este navegador",
  "ios-instalar": "En el iPhone hace falta un paso más",
  "no-soportado": "Este navegador no permite avisos",
};

export default function AvisosDispositivo() {
  const [estado, setEstado] = useState<EstadoAvisos>("cargando");
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const leer = useCallback(() => {
    estadoAvisos()
      .then(setEstado)
      .catch(() => setEstado("no-soportado"));
  }, []);

  useEffect(() => {
    leer();
    // Si se habilitan desde el candado del navegador y se vuelve a la pestaña.
    const alVolver = () => document.visibilityState === "visible" && leer();
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [leer]);

  async function alternar() {
    setOcupado(true);
    setMensaje(null);
    try {
      setEstado(estado === "prendido" ? await desactivarAvisos() : await activarAvisos());
    } catch (e) {
      setMensaje(e instanceof ApiError ? e.message : "No se pudieron activar los avisos. Probá de nuevo.");
      leer();
    } finally {
      setOcupado(false);
    }
  }

  async function probar() {
    setMensaje(null);
    try {
      const { enviados } = await probarPush();
      setMensaje(enviados > 0 ? "Listo: en unos segundos te llega el aviso de prueba." : "No hay ningún dispositivo con avisos para probar.");
    } catch (e) {
      setMensaje(e instanceof ApiError ? e.message : "No se pudo mandar el aviso de prueba.");
    }
  }

  const puedeAlternar = estado === "prendido" || estado === "apagado";

  return (
    <div className="av-tarjeta">
      <div className="av-cab">
        <span className="av-ic" aria-hidden="true">
          <svg viewBox="0 0 24 24" width={19} height={19} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        </span>
        <span className="av-tx">
          <b id="av-titulo">Avisos de reservas web</b>
          <small>{TEXTO[estado]}</small>
        </span>
        {puedeAlternar && (
          <button
            type="button"
            role="switch"
            aria-checked={estado === "prendido"}
            aria-labelledby="av-titulo"
            className={`av-sw ${estado === "prendido" ? "on" : ""}`}
            onClick={alternar}
            disabled={ocupado}
          />
        )}
      </div>

      {estado === "prendido" && (
        <>
          <p className="av-nota">Te avisa cada reserva que entra por el link y cada solicitud para aprobar, aunque capax esté cerrado.</p>
          <button type="button" className="av-probar" onClick={probar}>
            Mandar un aviso de prueba
          </button>
        </>
      )}
      {estado === "apagado" && <p className="av-nota">Prendelos para que este dispositivo te avise cuando entra una reserva por el link.</p>}
      {estado === "ios-instalar" && (
        <div className="av-pasos">
          <b>Para recibir avisos en el {/iPad/.test(navigator.userAgent) ? "iPad" : "iPhone"}:</b>
          <ol>
            <li>
              Abrí capax en <b>Safari</b> y tocá <b>Compartir</b> (el cuadrado con la flecha).
            </li>
            <li>
              Elegí <b>Agregar a inicio</b>.
            </li>
            <li>Abrí capax desde el ícono nuevo, entrá con «Recordarme» y prendé los avisos acá.</li>
          </ol>
        </div>
      )}
      {estado === "bloqueado" && (
        <p className="av-nota">
          {esIOS()
            ? "Habilitalos en Ajustes → Notificaciones → capax y volvé a esta pantalla."
            : "Habilitalos desde el candado de la barra de direcciones (Notificaciones → Permitir) y volvé a esta pantalla."}
        </p>
      )}
      {estado === "no-soportado" && <p className="av-nota">Probá con Chrome, Edge, Firefox o Safari actualizados.</p>}
      {mensaje && (
        <p className="av-msj" role="status">
          {mensaje}
        </p>
      )}
    </div>
  );
}
