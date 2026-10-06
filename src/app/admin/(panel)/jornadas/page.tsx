import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import Alerts from "@/components/Alerts";
import EstadoBadge from "@/components/EstadoBadge";
import { createJourney } from "./actions";

type SP = Promise<{ error?: string; ok?: string }>;

export default async function JornadasPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();

  const [{ data: journeys }, { data: slots }] = await Promise.all([
    supabase.from("journeys")
      .select("id, nombre, estado, capacidad_total_objetivo")
      .order("created_at", { ascending: false }),
    supabase.from("time_slots").select("journey_id, capacidad, ocupados"),
  ]);

  const agg = new Map<string, { cap: number; occ: number }>();
  for (const s of slots ?? []) {
    const a = agg.get(s.journey_id) ?? { cap: 0, occ: 0 };
    a.cap += s.capacidad;
    a.occ += s.ocupados;
    agg.set(s.journey_id, a);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand">Jornadas</h1>
      <Alerts error={sp.error} ok={sp.ok} />

      <form action={createJourney} className="card grid gap-3 sm:grid-cols-4 sm:items-end">
        <div className="sm:col-span-2">
          <label className="label">Nombre</label>
          <input name="nombre" className="input" placeholder="Jornada Octubre 2026" required />
        </div>
        <div>
          <label className="label">Capacidad objetivo</label>
          <input name="capacidad_total_objetivo" type="number" min={1} className="input" required />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Modo</label>
          <select name="modo" defaultValue="agenda" className="input">
            <option value="agenda">Agenda (con fechas y horarios)</option>
            <option value="preinscripcion">Preinscripción (fecha y hora por definir)</option>
          </select>
        </div>
            <input type="hidden" name="capacidad_max_por_horario" value={30} />
        <button className="btn-primary sm:col-span-4 sm:justify-self-end">Crear jornada</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-brand/5 text-left">
            <tr>
              <th className="p-3">Nombre</th>
              <th className="p-3">Estado</th>
              <th className="p-3 text-right">Asignados / Capacidad</th>
              <th className="p-3 text-right">Objetivo</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {(journeys ?? []).map((j) => {
              const a = agg.get(j.id) ?? { cap: 0, occ: 0 };
              return (
                <tr key={j.id} className="border-t border-black/5">
                  <td className="p-3 font-medium">{j.nombre}</td>
                  <td className="p-3"><EstadoBadge estado={j.estado} /></td>
                  <td className="p-3 text-right">{a.occ} / {a.cap}</td>
                  <td className="p-3 text-right">{j.capacidad_total_objetivo}</td>
                  <td className="p-3 text-right">
                    <Link href={`/admin/jornadas/${j.id}`} className="text-brand hover:underline">Configurar</Link>
                  </td>
                </tr>
              );
            })}
            {!journeys?.length && (
              <tr><td colSpan={5} className="p-6 text-center text-black/50">No hay jornadas creadas.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}