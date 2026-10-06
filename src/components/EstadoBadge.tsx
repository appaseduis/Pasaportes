const STYLES: Record<string, string> = {
  activa: "bg-ok/15 text-ok",
  activo: "bg-ok/15 text-ok",
  borrador: "bg-warn/25 text-ink",
  inactiva: "bg-black/10 text-black/60",
  inactivo: "bg-black/10 text-black/60",
};

export default function EstadoBadge({ estado }: { estado: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${STYLES[estado] ?? "bg-black/10"}`}>
      {estado}
    </span>
  );
}