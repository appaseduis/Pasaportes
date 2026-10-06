import { formatFecha } from "@/lib/format";
import EstadoBadge from "@/components/EstadoBadge";
import type { Cita } from "@/lib/types";

export default function CitaCard({ cita, tone = "ok" }: { cita: Cita; tone?: "ok" | "warn" }) {
  const pre = cita.estado === "preinscrita";
  const border = pre ? "border-brand" : tone === "ok" ? "border-ok" : "border-warn";

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
          {cita.hora_presentacion ? (
            <p className="text-3xl font-bold text-brand">{cita.hora_presentacion}</p>
          ) : (
            <p className="text-lg font-semibold text-black/50">Por confirmar</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-black/50">
        <EstadoBadge estado={cita.estado} /> · {pre ? "Turno" : "Orden"} #{cita.orden_registro}
      </div>
      {pre && (
        <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm">
          La fecha y la hora se asignarán más adelante, respetando el orden de inscripción.
        </p>
      )}
      {cita.comentario && (
        <p className="rounded-lg bg-warn/20 px-3 py-2 text-sm"><b>Motivo:</b> {cita.comentario}</p>
      )}
    </div>
  );
}