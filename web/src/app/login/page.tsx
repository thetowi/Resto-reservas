"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, ApiError } from "@/lib/api";
import { setSesion } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const res = await login(username.trim().toLowerCase(), password);
      setSesion(res.token, res.nombre, res.rol);
      router.push(res.debeCambiarPassword ? "/cambiar-password" : "/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
            className="w-full max-w-sm rounded-2xl border border-borde bg-superficie p-8 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-marca text-lg font-bold text-arena">
            B
          </div>
          <div>
            <div className="text-sm font-bold tracking-wide">BARRANCAS</div>
            <div className="text-xs text-tinta-suave">Restaurant · Reservas</div>
          </div>
        </div>

        <label className="mb-1 block text-xs font-medium text-tinta-suave">Usuario</label>
        <input
          className="mb-4 w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-sm text-tinta"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoCapitalize="none"
        />

        <label className="mb-1 block text-xs font-medium text-tinta-suave">Contraseña</label>
        <input
          type="password"
          className="mb-5 w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-sm text-tinta"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <div className="mb-4 rounded-lg bg-ocupada-suave px-3 py-2 text-sm text-ocupada">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={cargando}
          className="w-full rounded-lg bg-marca py-2.5 text-sm text-white disabled:opacity-60"
        >
          {cargando ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
