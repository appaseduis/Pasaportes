import { requireAdmin } from "@/lib/auth/guards";
import { formatFecha, hhmm } from "@/lib/format";
import EstadoBadge from "@/components/EstadoBadge";
import DashboardLive from "./dashboard-live";
import Availability from "@/app/logistica/registro/availability";
import type { SlotView } from "@/lib/types";

type Slot = { id: string; hora_inicio: string; capacidad: number; ocupados: number; estado: string };
type DateRow = { id: string; fecha: string; estado: string; time_slots: Slot[] };
type Recent = {
  id: string; created_at: string; nombre_completo: string; numero_documento: string;
  fecha: string; hora_inicio: string; logistica: string | null; metodo_registro: string;
};

function Bar({ occ, cap }: { occ: number; cap: number }) {
  const pct = cap ? Math.round((occ / cap) * 100) : 0;
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/10">
      <div className={`h-full ${occ >= cap && cap > 0 ? "bg-danger" : "bg-brand"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Status({ occ, cap }: { occ: number; cap: number }) {
  return occ >= cap && cap > 0
    ? <span className="text-xs font-semibold text-danger">COMPLETA</span>
    : <span className="text-xs font-semibold text-ok">{cap - occ} disponibles</span>;
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ j?: string }>;
}) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();

  const { data: journeys } = await supabase
    .from("journeys").select("id, nombre, estado").order("created_at", { ascending: false });

  const journey = journeys?.find((j) => j.id === sp.j)
    ?? journeys?.find((j) => j.estado === "activa")
    ?? journeys?.[0];

  if (!journey) {
    return <p className="card">Aún no hay jornadas. Crea una en <b>Jornadas</b>.</p>;
  }

  const [{ data: datesData }, { data: recentData }] = await Promise.all([
    supabase
      .from("journey_dates")
      .select("id, fecha, estado, time_slots(id, hora_inicio, capacidad, ocupados, estado)")
      .eq("journey_id", journey.id)
      .order("fecha")
      .order("hora_inicio", { referencedTable: "time_slots" }),
    supabase
      .from("v_appointments")
      .select("id, created_at, nombre_completo, numero_documento, fecha, hora_inicio, logistica, metodo_registro")
      .eq("journey_id", journey.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const dates = ((datesData ?? []) as DateRow[])
    .filter((d) => d.estado === "activa")
    .map((d) => ({ ...d, time_slots: d.time_slots.filter((s) => s.estado === "activo") }));

  const capTotal = dates.reduce((a, d) => a + d.time_slots.reduce((b, s) => b + s.capacidad, 0), 0);
  const asignados = dates.reduce((a, d) => a + d.time_slots.reduce((b, s) => b + s.ocupados, 0), 0);
  const disponibles = capTotal - asignados;
  const pct = capTotal ? Math.round((asignados / capTotal) * 100) : 0;
  const recent = (recentData ?? []) as Recent[];
    // Datos para el panel de disponibilidad (mismo formato que logística)
  const slotsView: SlotView[] = dates.flatMap((d) =>
    d.time_slots.map((s) => ({
      id: s.id, fecha: d.fecha, hora_inicio: s.hora_inicio,
      capacidad: s.capacidad, ocupados: s.ocupados, estado: s.estado,
    }))
  );
  const version = slotsView.map((s) => s.ocupados).join("-");

  const kpi = (label: string, value: string | number, color = "text-ink") => (
    <div className="card p-4">
      <p className="text-xs text-black/60">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Encabezado + selector */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-brand">Dashboard</h1>
        <EstadoBadge estado={journey.estado} />
        <DashboardLive journeyId={journey.id} />
        <form method="get" className="ml-auto flex gap-2">
          <select name="j" defaultValue={journey.id} className="input py-1">
            {(journeys ?? []).map((j) => (
              <option key={j.id} value={j.id}>{j.nombre} ({j.estado})</option>
            ))}
          </select>
          <button className="btn-outline py-1">Ver</button>
        </form>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-4">
        {kpi("Total asignados", asignados, "text-brand")}
        {kpi("Capacidad total", capTotal)}
        {kpi("Disponibles", disponibles, disponibles === 0 ? "text-danger" : "text-ok")}
        {kpi("Ocupación", `${pct}%`)}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px] lg:items-start">
        {/* Por fecha y horario */}
        <div className="space-y-4">
          {dates.map((d) => {
            const cap = d.time_slots.reduce((a, s) => a + s.capacidad, 0);
            const occ = d.time_slots.reduce((a, s) => a + s.ocupados, 0);
            return (
              <section key={d.id} className="card space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-semibold capitalize">{formatFecha(d.fecha)}</h2>
                  <span className="ml-auto tabular-nums">{occ} / {cap}</span>
                  <Status occ={occ} cap={cap} />
                </div>
                <Bar occ={occ} cap={cap} />
                <div className="space-y-1.5 border-t border-black/5 pt-3">
                  {d.time_slots.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 text-sm">
                      <span className="w-12 font-mono">{hhmm(s.hora_inicio)}</span>
                      <Bar occ={s.ocupados} cap={s.capacidad} />
                      <span className="w-14 text-right tabular-nums">{s.ocupados}/{s.capacidad}</span>
                      <span className="w-28 text-right"><Status occ={s.ocupados} cap={s.capacidad} /></span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          {!dates.length && <p className="card text-black/50">Esta jornada no tiene fechas activas.</p>}
        </div>

        <div className="space-y-4 lg:sticky lg:top-4">
          <Availability key={version} journeyId={journey.id} initial={slotsView} />
        {/* Registros recientes */}
        <aside className="card space-y-3">
          <h2 className="font-semibold text-brand">Registros recientes</h2>
          {recent.map((r) => (
            <div key={r.id} className="border-t border-black/5 pt-2 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium">{r.nombre_completo}</p>
                <span className="text-xs text-black/50">
                  {new Date(r.created_at).toLocaleTimeString("es-CO", {
                    timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-xs text-black/60">
                C.C. {r.numero_documento} ·{" "}
                <span className="capitalize">{formatFecha(r.fecha, { day: "2-digit", month: "short" })}</span>{" "}
                <b>{hhmm(r.hora_inicio)}</b> · {r.logistica ?? "—"} · {r.metodo_registro}
              </p>
            </div>
          ))}
          {!recent.length && <p className="text-sm text-black/50">Aún no hay registros.</p>}
          </aside>
        </div>
      </div>
    </div>
  );
}