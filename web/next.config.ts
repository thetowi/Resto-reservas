import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El botoncito "N" de Next.js (solo aparece en la compu, con npm run dev)
  // iba abajo a la izquierda y tapaba el usuario de la barra lateral.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
