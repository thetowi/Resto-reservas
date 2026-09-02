import type { Metadata } from "next";
import "./globals.css";

import { ConfirmProvider } from "@/components/ConfirmProvider";

export const metadata: Metadata = {
  title: "Barrancas · Reservas",
  description: "Sistema de reservas de Barrancas Restaurant",
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
        <ConfirmProvider>{children}</ConfirmProvider>
      </body>
    </html>
  );
}