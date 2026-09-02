"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cambiarPassword, ApiError } from "@/lib/api";
import { haySesion } from "@/lib/auth";

export default function CambiarPasswordPage() {
  const router = useRouter();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!haySesion()) router.replace("/login");
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (nueva.length < 8) {
      setError("La contraseña nueva debe tener al menos 8 caracteres");
      return;
    }
    if (nueva !== repetir) {
      setError("Las dos contraseñas nuevas no coinciden");
      return;
    }

    setCargando(true);
    try {
      await cambiarPassword(actual, nueva);
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña");
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
        <h1 className="mb-1 text-base font-semibold">Cambiar contraseña</h1>
        <p className="mb-5 text-sm text-tinta-suave">
          Es tu primer ingreso: elegí una contraseña nueva antes de continuar.
        </p>

        <label className="mb-1 block text-xs font-medium text-tinta-suave">
          Contraseña actual (la temporal)
        </label>
        <input
          type="password"
          className="mb-4 w-full rounded-lg border border-borde px-3 py-2 text-sm"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          autoFocus
        />

        <label className="mb-1 block text-xs font-medium text-tinta-suave">
          Contraseña nueva
        </label>
        <input
          type="password"
          className="mb-4 w-full rounded-lg border border-borde px-3 py-2 text-sm"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
        />

        <label className="mb-1 block text-xs font-medium text-tinta-suave">
          Repetir contraseña nueva
        </label>
        <input
          type="password"
          className="mb-5 w-full rounded-lg border border-borde px-3 py-2 text-sm"
          value={repetir}
          onChange={(e) => setRepetir(e.target.value)}
        />

        {error && (
          <div className="mb-4 rounded-lg bg-ocupada-suave px-3 py-2 text-sm text-ocupada">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={cargando}
          className="w-full rounded-lg bg-tinta py-2.5 text-sm text-white disabled:opacity-60"
        >
          {cargando ? "Guardando…" : "Guardar y continuar"}
        </button>
      </form>
    </div>
  );
}
