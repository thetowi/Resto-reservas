import type { Metadata } from "next";
import "./globals.css";
import { NOMBRE_CLIENTE } from "@/lib/marca";

import { ConfirmProvider } from "@/components/ConfirmProvider";
import AppConBarra from "@/components/AppConBarra";

export const metadata: Metadata = {
  // "capax" es el producto; el cliente de esta instancia va al lado (ver
  // lib/marca.ts). Los íconos de la pestaña y de la app son
  // app/favicon.ico, app/icon.png y app/apple-icon.png.
  title: `Capax · ${NOMBRE_CLIENTE}`,
  description: `Reservas y carta de ${NOMBRE_CLIENTE}`,
  applicationName: "Capax",
};

// Fija el tema (claro/oscuro) ANTES del primer render, leyendo la
// preferencia guardada en localStorage o, si el usuario nunca eligio nada
// todavia, el modo oscuro del sistema operativo. Va como script inline y
// bloqueante a proposito (no un componente de React) para evitar el
// "flash" de tema incorrecto que se veria si esto corriera recien despues
// de hidratar.
const TEMA_SCRIPT = `
(function () {
  try {
    var guardado = localStorage.getItem("barrancas-theme");
    var tema = guardado || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = tema;
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-fondo text-tinta antialiased">
        <ConfirmProvider>
          <AppConBarra />
          {children}
        </ConfirmProvider>
      </body>
    </html>
  );
}