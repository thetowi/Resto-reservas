// Enlaces directos entre pantallas de administración (ej. desde la ficha de
// un salón en /admin/salones a «Administrar mesas» o «Horarios» de ESE
// salón): ?salon=ID y, en mesas, &vista=sectores. Se lee una sola vez al
// cargar la pantalla; después manda el selector.

export function salonDeLaUrl(salones: { id: number }[]): number | undefined {
  if (typeof window === "undefined") return undefined;
  const id = Number(new URLSearchParams(window.location.search).get("salon"));
  return salones.some((s) => s.id === id) ? id : undefined;
}

export function parametroDeLaUrl(nombre: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(nombre);
}
