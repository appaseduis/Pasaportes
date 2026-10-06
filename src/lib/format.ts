export function formatFecha(
  fecha: string,
  opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "2-digit", month: "long", year: "numeric" }
) {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-CO", opts);
}

export const hhmm = (t: string) => t.slice(0, 5);