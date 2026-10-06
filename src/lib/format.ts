export function formatFecha(
  fecha: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "2-digit", month: "long", year: "numeric" }
) {
  if (!fecha) return "Por confirmar";
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-CO", opts);
}

export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "—");