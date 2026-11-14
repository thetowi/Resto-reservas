"use client";

import { useEffect } from "react";

// El link de reservas va siempre en modo claro. El script de app/layout.tsx
// ya lo pone al cargar la página; esto cubre el caso de llegar desde el
// panel sin recargar (y al salir, vuelve el tema que tenía).
export default function TemaClaro() {
  useEffect(() => {
    const raiz = document.documentElement;
    const anterior = raiz.dataset.theme;
    raiz.dataset.theme = "light";
    return () => {
      if (anterior) raiz.dataset.theme = anterior;
    };
  }, []);
  return null;
}
