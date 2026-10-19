import type { Metadata } from "next";
import { NOMBRE_PUBLICO } from "@/lib/marca";

// Pagina publica (sin login): titulo propio para la pestaña y para cuando se
// comparte el link por WhatsApp o Instagram.
export const metadata: Metadata = {
  title: `Reservá tu mesa · ${NOMBRE_PUBLICO}`,
  description: `Reservas online de ${NOMBRE_PUBLICO}, sujetas a disponibilidad.`,
  // El manifest es del panel del equipo (abre en "/"): el cliente que guarde
  // el link en su pantalla de inicio tiene que volver a /reservar.
  manifest: null,
  appleWebApp: { capable: true, title: NOMBRE_PUBLICO, statusBarStyle: "default" },
};

export default function ReservarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
