import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import Alerts from "@/components/Alerts";
import EstadoBadge from "@/components/EstadoBadge";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { formatFecha, hhmm } from "@/lib/format";
import {
  updateJourney, setJourneyEstado, addDate, updateDate, deleteDate,
  generateSlots, updateSlot, deleteSlot, deleteJourney, resetJourney,
} from "../actions";
import Collapsible from "@/components/Collapsible";
import CapacityCalculator from "@/components/CapacityCalculator";
import SlotGenerator from "@/components/SlotGenerator";

type Slot = { id: string; hora_inicio: string; hora_fin: string; capacidad: number; ocupados: number; estado: string };
type DateRow = { id: string; fecha: string; capacidad_total: number; estado: string; time_slots: Slot[] };

const H = ({ n, v }: { n: string; v: string }) => <input type="hidden" name={n} value={v} />;

export default async function JornadaDetalle({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireAdmin();

  const { data: j } = await supabase.from("journeys").select("*").eq("id", id).maybeSingle();
  if (!j) notFound();

  const { data } = await supabase
    .from("journey_dates")
    .select("id, fecha, capacidad_total, estado, time_slots(id, hora_inicio, hora_fin, capacidad, ocupados, estado)")
    .eq("journey_id", id)
    .order("fecha")
    .order("hora_inicio", { referencedTable: "time_slots" });

  const dates = (data ?? []) as DateRow[];
  const activeSlots = (d: DateRow) => d.time_slots.filter((s) => s.estado === "activo");
  const sumFechas = dates.filter((d) => d.estado === "activa").reduce((a, d) => a + d.capacidad_total, 0);
  const sumSlotsDate = (d: DateRow) => activeSlots(d).reduce((a, s) => a + s.capacidad, 0);
  const sumSlots = dates.filter((d) => d.estado === "activa").reduce((a, d) => a + sumSlotsDate(d), 0);
  const ocupados = dates.reduce((a, d) => a + d.time_slots.reduce((b, s) => b + s.ocupados, 0), 0);

  const stat = (label: string, value: number, okCond = true) => (
    <div className="card p-3">
      <p className="text-xs text-black/60">{label}</p>
      <p className={`text-xl font-bold ${okCond ? "text-ink" : "text-danger"}`}>{value}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/jornadas" className="text-sm text-brand hover:underline">← Jornadas</Link>
        <h1 className="text-2xl font-bold text-brand">{j.nombre}</h1>
        <EstadoBadge estado={j.estado} />
        <form action={setJourneyEstado} className="ml-auto">
          <H n="journey_id" v={j.id} />
          {j.estado === "activa" ? (
            <>
              <H n="estado" v="inactiva" />
              <ConfirmSubmit className="btn-danger" message="¿Desactivar la jornada? Logística no podrá registrar.">
                Desactivar
              </ConfirmSubmit>
            </>
          ) : (
            <>
              <H n="estado" v="activa" />
              <button className="btn-primary">Activar</button>
            </>
          )}
        </form>
      </div>

      <Alerts error={sp.error} ok={sp.ok} />

      <div className="grid gap-3 sm:grid-cols-4">
        {stat("Capacidad objetivo", j.capacidad_total_objetivo)}
        {stat("Suma de fechas", sumFechas, sumFechas === j.capacidad_total_objetivo)}
        {stat("Suma de horarios", sumSlots, sumSlots === sumFechas)}
        {stat("Citas asignadas", ocupados)}
      </div>

      <form action={updateJourney} className="card grid gap-3 sm:grid-cols-4 sm:items-end">
        <H n="journey_id" v={j.id} />
        <div className="sm:col-span-2">
          <label className="label">Nombre</label>
          <input name="nombre" defaultValue={j.nombre} className="input" required />
        </div>
        <div>
          <label className="label">Capacidad objetivo</label>
          <input name="capacidad_total_objetivo" type="number" min={1} defaultValue={j.capacidad_total_objetivo} className="input" required />
        </div>
          <input type="hidden" name="capacidad_max_por_horario" value={j.capacidad_max_por_horario} />
        <div />
        <CapacityCalculator
          modulos={j.modulos}
          minutos={j.minutos_por_persona}
          max={j.capacidad_max_por_horario}
        />
        <button className="btn-outline sm:col-span-4 sm:justify-self-end">Guardar cambios</button>
      </form>

      <form action={addDate} className="card grid gap-3 sm:grid-cols-3 sm:items-end">
        <H n="journey_id" v={j.id} />
        <div>
          <label className="label">Nueva fecha</label>
          <input name="fecha" type="date" className="input" required />
        </div>
        <div>
          <label className="label">Capacidad de la fecha</label>
          <input name="capacidad_total" type="number" min={1} className="input" required />
        </div>
        <button className="btn-primary">Agregar fecha</button>
      </form>

            {dates.map((d) => {
        const suma = sumSlotsDate(d);
        const occ = d.time_slots.reduce((a, s) => a + s.ocupados, 0);
        return (
          <Collapsible
            key={d.id}
            id={d.id}
            summary={
              <>
                <span className="font-semibold capitalize">{formatFecha(d.fecha)}</span>
                <EstadoBadge estado={d.estado} />
                <span className={`text-sm font-medium ${
                  suma === d.capacidad_total ? "text-ok" : suma > d.capacidad_total ? "text-danger" : "text-ink"}`}>
                  Horarios: {suma} / {d.capacidad_total}
                </span>
                {suma === d.capacidad_total ? (
                  <span className="rounded-full bg-ok/15 px-2 py-0.5 text-xs font-semibold text-ok">✓ Cuadra</span>
                ) : suma > d.capacidad_total ? (
                  <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-semibold text-danger">
                    ⚠ Excede por {suma - d.capacidad_total}
                  </span>
                ) : (
                  <span className="rounded-full bg-warn/30 px-2 py-0.5 text-xs font-semibold text-ink">
                    ⚠ Faltan {d.capacidad_total - suma}
                  </span>
                )}
                <span className="text-sm text-black/60">
                  Ocupados: {occ} / {suma}
                </span>
              </>
            }
          >
            <div className="flex flex-wrap items-end gap-3">
              <form action={updateDate} className="flex flex-wrap items-end gap-3">
                <H n="journey_id" v={j.id} /><H n="id" v={d.id} />
                <div>
                  <label className="label">Capacidad</label>
                  <input name="capacidad_total" type="number" min={1} defaultValue={d.capacidad_total} className="input w-28" />
                </div>
                <div>
                  <label className="label">Estado</label>
                  <select name="estado" defaultValue={d.estado} className="input">
                    <option value="activa">activa</option>
                    <option value="inactiva">inactiva</option>
                  </select>
                </div>
                <button className="btn-outline">Guardar</button>
              </form>
              <form action={deleteDate} className="ml-auto">
                <H n="journey_id" v={j.id} /><H n="id" v={d.id} />
                <ConfirmSubmit className="text-sm text-danger hover:underline" message="¿Eliminar esta fecha y sus horarios?">
                  Eliminar fecha
                </ConfirmSubmit>
              </form>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-brand/5 text-left">
                  <tr>
                    <th className="p-2">Horario</th>
                    <th className="p-2">Ocupados</th>
                    <th className="p-2">Capacidad / Estado</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {d.time_slots.map((s) => (
                    <tr key={s.id} className="border-t border-black/5">
                      <td className="p-2 font-medium">{hhmm(s.hora_inicio)} – {hhmm(s.hora_fin)}</td>
                      <td className="p-2">
                        <span className={s.ocupados >= s.capacidad ? "font-semibold text-danger" : ""}>
                          {s.ocupados} / {s.capacidad}
                        </span>
                      </td>
                      <td className="p-2">
                        <form action={updateSlot} className="flex items-center gap-2">
                          <H n="journey_id" v={j.id} /><H n="id" v={s.id} />
                          <input name="capacidad" type="number" min={1}
                            defaultValue={s.capacidad} className="input w-20 py-1" />
                          <select name="estado" defaultValue={s.estado} className="input w-28 py-1">
                            <option value="activo">activo</option>
                            <option value="inactivo">inactivo</option>
                          </select>
                          <button className="text-brand hover:underline">Guardar</button>
                        </form>
                      </td>
                      <td className="p-2 text-right">
                        <form action={deleteSlot}>
                          <H n="journey_id" v={j.id} /><H n="id" v={s.id} />
                          <ConfirmSubmit className="text-danger hover:underline" message="¿Eliminar este horario?">
                            Eliminar
                          </ConfirmSubmit>
                        </form>
                      </td>
                    </tr>
                  ))}
                  {!d.time_slots.length && (
                    <tr><td colSpan={4} className="p-3 text-center text-black/50">Sin horarios.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <SlotGenerator
              action={generateSlots}
              journeyId={j.id}
              dateId={d.id}
              modulos={j.modulos}
              minutos={j.minutos_por_persona}
              max={j.capacidad_max_por_horario}
              capacidadFecha={d.capacidad_total}
              sumaActual={suma}
            />
          </Collapsible>
        );
      })}
              <section className="card space-y-4 border border-danger/30">
        <h2 className="font-semibold text-danger">Zona de peligro</h2>

        {/* Reiniciar */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Reiniciar jornada</p>
          <p className="text-xs text-black/60">
            Elimina las <b>{ocupados}</b> cita(s) y deja la disponibilidad en cero. Conserva fechas,
            horarios, capacidades y usuarios de logística. <b>Exporta los datos antes.</b>
          </p>
          {ocupados > 0 ? (
            <form action={resetJourney} className="flex flex-wrap items-end gap-3">
              <H n="journey_id" v={j.id} />
              <div className="flex-1">
                <label className="label">Escribe <b>{j.nombre}</b> para confirmar</label>
                <input name="confirmacion" className="input" autoComplete="off" required />
              </div>
              <ConfirmSubmit className="btn-danger"
                message={`¿Eliminar las ${ocupados} cita(s) de esta jornada? No se puede deshacer.`}>
                Reiniciar jornada
              </ConfirmSubmit>
            </form>
          ) : (
            <p className="text-xs text-black/40">No hay citas para reiniciar.</p>
          )}
        </div>

        {/* Eliminar */}
        <div className="space-y-2 border-t border-black/5 pt-4">
          <p className="text-sm font-medium">Eliminar jornada</p>
          {j.estado === "activa" ? (
            <p className="text-xs text-black/60">Primero debes <b>desactivarla</b>.</p>
          ) : ocupados > 0 ? (
            <p className="text-xs text-black/60">Primero <b>reiníciala</b> para eliminar sus citas.</p>
          ) : (
            <form action={deleteJourney} className="flex flex-wrap items-end gap-3">
              <H n="journey_id" v={j.id} />
              <div className="flex-1">
                <label className="label">Escribe <b>{j.nombre}</b> para confirmar</label>
                <input name="confirmacion" className="input" autoComplete="off" required />
              </div>
              <ConfirmSubmit className="btn-danger"
                message="¿Eliminar definitivamente la jornada con todas sus fechas y horarios?">
                Eliminar jornada
              </ConfirmSubmit>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}