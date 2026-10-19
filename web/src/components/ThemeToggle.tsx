"use client";

import { useEffect, useId, useState } from "react";

const STORAGE_KEY = "barrancas-theme";

type Tema = "light" | "dark";

function leerTemaActual(): Tema {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

// Boton de modo claro/oscuro con icono animado sol<->luna: un circulo
// principal con una mascara SVG, donde un segundo circulo "cut-out" se
// desliza por encima (via CSS transform) para tallarle la silueta de luna
// creciente; los rayos se desvanecen al mismo tiempo (ver los estilos
// .dark-mode-toggle* en globals.css). El estado real sigue viviendo en el
// atributo data-theme de <html> (lo fija por primera vez el script inline
// de layout.tsx) + localStorage, igual que en la version anterior — lo
// unico que cambia aca es el dibujo del boton.
// className: estilos extra segun donde se use (el link /reservar lo usa
// chico, ver .rv-tema en globals.css).
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [tema, setTema] = useState<Tema>("light");

  useEffect(() => {
    // El tema real recien se conoce en el navegador (lo fija layout.tsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTema(leerTemaActual());
  }, []);

  function alternar() {
    const nuevo: Tema = tema === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nuevo;
    localStorage.setItem(STORAGE_KEY, nuevo);
    setTema(nuevo);
  }

  return (
    <button
      type="button"
      onClick={alternar}
      title={tema === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      aria-label={tema === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className={`dark-mode-toggle ${className}`.trim()}
    >
      <IconoTema oscuro={tema === "dark"} />
    </button>
  );
}
// El dibujo sol <-> luna solo (sin el boton), para usarlo en otros botones
// que ya manejan el tema, como el de la barra lateral (BarraLateral.tsx).
export function IconoTema({ oscuro, className = "" }: { oscuro: boolean; className?: string }) {
  // id de la mascara unico por icono (puede haber mas de uno en la pagina).
  const mascara = `dark-mode-toggle-mask-${useId().replace(/:/g, "")}`;
  return (
    <svg
      className={`dark-mode-toggle__icon ${oscuro ? "dark-mode-toggle__icon--moon" : ""} ${className}`.trim()}
      width="48"
      height="48"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <defs>
        <mask id={mascara}>
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          <circle className="dark-mode-toggle__cut-out" r="6" cx="24" cy="10" fill="black" />
        </mask>
      </defs>
      <circle className="dark-mode-toggle__center-circle" r="6" cx="12" cy="12" fill="currentColor" mask={`url(#${mascara})`} />
      <g className="dark-mode-toggle__rays" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" x2="12" y1="3" y2="1" />
        <line x1="21" x2="23" y1="12" y2="12" />
        <line x1="12" x2="12" y1="21" y2="23" />
        <line x1="1" x2="3" y1="12" y2="12" />
      </g>
      <g className="dark-mode-toggle__rays" stroke="currentColor" strokeWidth="2" strokeLinecap="round" transform="rotate(45 12 12)">
        <line x1="12" x2="12" y1="3" y2="1" />
        <line x1="21" x2="23" y1="12" y2="12" />
        <line x1="12" x2="12" y1="21" y2="23" />
        <line x1="1" x2="3" y1="12" y2="12" />
      </g>
    </svg>
  );
}
