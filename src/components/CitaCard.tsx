import { formatFecha } from "@/lib/format";
import type { Cita } from "@/lib/types";

export default function CitaCard({ cita, tone = "ok" }: { cita: Cita; tone?: "ok" | "warn" }) {
  const border = tone === "ok" ? "border-ok" : "border-warn";
  return (
    <div className={`card border-l-8 ${border} space-y-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg font-bold">{cita.nombre_completo}</p>
        <p className="text-sm text-black/60">C.C. {cita.numero_documento}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-xs text-black/60">Jornada</p>
          <p className="font-medium">{cita.jornada}</p>
        </div>
        <div>
          <p className="text-xs text-black/60">Fecha</p>
          <p className="font-medium capitalize">{formatFecha(cita.fecha)}</p>
        </div>
        <div>
          <p className="text-xs text-black/60">Hora de presentación</p>
          <p className="text-3xl font-bold text-brand">{cita.hora_presentacion}</p>
        </div>
      </div>
      <p className="text-xs uppercase text-black/50">
        Estado: {cita.estado} · Orden #{cita.orden_registro}
      </p>
    </div>
  );
}