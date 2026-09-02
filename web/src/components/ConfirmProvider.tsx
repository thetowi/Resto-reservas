"use client";

import { createContext, useCallback, useContext, useState } from "react";

type PeticionConfirm = {
  tipo: "confirm";
  mensaje: string;
  textoConfirmar: string;
  textoCancelar: string;
  resolver: (valor: boolean) => void;
};

type PeticionPrompt = {
  tipo: "prompt";
  mensaje: string;
  resolver: (valor: string | null) => void;
};

type Peticion = PeticionConfirm | PeticionPrompt;

interface OpcionesConfirmar {
  textoConfirmar?: string;
  textoCancelar?: string;
}

interface ConfirmContextValue {
  confirmar: (mensaje: string, opciones?: OpcionesConfirmar) => Promise<boolean>;
  preguntar: (mensaje: string, valorInicial?: string) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

// Reemplazo propio de window.confirm/window.prompt: el dialog nativo del
// navegador no respeta el tema claro/oscuro de la app y bloquea la pestaña
// entera mientras está abierto. Este modal vive en el árbol de React
// (montado una sola vez en el layout raíz) y expone dos funciones basadas
// en promesas, para que el resto del código se lea casi igual que antes:
// `if (!(await confirmar("¿Seguro?"))) return;`. `confirmar` acepta textos
// de botón opcionales (por defecto "Cancelar"/"Aceptar") para las preguntas
// que se leen mejor como Sí/No puntualmente, sin cambiar el default global.
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [peticion, setPeticion] = useState<Peticion | null>(null);
  const [valor, setValor] = useState("");

  const confirmar = useCallback((mensaje: string, opciones?: OpcionesConfirmar) => {
    return new Promise<boolean>((resolver) => {
      setPeticion({
        tipo: "confirm",
        mensaje,
        textoConfirmar: opciones?.textoConfirmar ?? "Aceptar",
        textoCancelar: opciones?.textoCancelar ?? "Cancelar",
        resolver,
      });
    });
  }, []);

  const preguntar = useCallback((mensaje: string, valorInicial = "") => {
    return new Promise<string | null>((resolver) => {
      setValor(valorInicial);
      setPeticion({ tipo: "prompt", mensaje, resolver });
    });
  }, []);

  function cerrar(resultado: boolean | string | null) {
    if (!peticion) return;
    if (peticion.tipo === "confirm") {
      peticion.resolver(resultado === true);
    } else {
      peticion.resolver(typeof resultado === "string" ? resultado : null);
    }
    setPeticion(null);
  }

  return (
    <ConfirmContext.Provider value={{ confirmar, preguntar }}>
      {children}

      {peticion && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-tinta/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-borde bg-superficie p-5 shadow-lg">
            <p className="mb-4 text-sm text-tinta">{peticion.mensaje}</p>

            {peticion.tipo === "prompt" && (
              <input
                autoFocus
                className="mb-4 w-full rounded-lg border border-borde bg-fondo px-3 py-2 text-sm text-tinta"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") cerrar(valor);
                  if (e.key === "Escape") cerrar(null);
                }}
              />
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => cerrar(peticion.tipo === "confirm" ? false : null)}
                className="rounded-lg px-3 py-1.5 text-sm text-tinta-suave hover:bg-arena-suave"
              >
                {peticion.tipo === "confirm" ? peticion.textoCancelar : "Cancelar"}
              </button>
              <button
                type="button"
                autoFocus={peticion.tipo === "confirm"}
                onClick={() => cerrar(peticion.tipo === "confirm" ? true : valor)}
                className="rounded-lg bg-marca px-3 py-1.5 text-sm text-white"
              >
                {peticion.tipo === "confirm" ? peticion.textoConfirmar : "Aceptar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>");
  }
  return ctx;
}