import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import { formatFecha, hhmm } from "@/lib/format";
import EstadoBadge from "@/components/EstadoBadge";

type SP = Promise<{ j?: string; f?: string; h?: string; e?: string; m?: string; l?: string; q?: string; p?: string }>;

type Row = {
  id: string; orden_registro: number; numero_documento: string; nombre_completo: string;
  telefono: string; fecha: string; hora_inicio: string; estado: string;
  metodo_registro: string; logistica: string | null; created_at: string;
};

const PAGE = 100;

export default async function RegistrosPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();

  const { data: journeys } = await supabase
    .from("journeys").select("id, nombre, estado").order("created_at", { ascending: false });

  const jid = sp.j || journeys?.find((j) => j.estado === "activa")?.id || journeys?.[0]?.id;
  if (!jid) return <p className="card">No hay jornadas creadas.</p>;

  const [{ data: dates }, { data: slots }, { data: lus }] = await Promise.all([
    supabase.from("journey_dates").select("id, fecha").eq("journey_id", jid).order("fecha"),
    supabase.from("time_slots").select("hora_inicio").eq("journey_id", jid),
    supabase.from("logistics_users").select("id, nombre_interno").eq("rol", "logistica").order("nombre_interno"),
  ]);
  const horas = [...new Set((slots ?? []).map((s) => s.hora_inicio as string))].sort();

  let query = supabase.from("v_appointments").select("*", { count: "exact" }).eq("journey_id", jid);
  if (sp.f) query = query.eq("fecha", sp.f);
  if (sp.h) query = query.eq("hora_inicio", sp.h);
  if (sp.e) query = query.eq("estado", sp.e);
  if (sp.m) query = query.eq("metodo_registro", sp.m);
  if (sp.l) query = query.eq("logistics_user_id", sp.l);
  if (sp.q?.trim()) {
    const t = sp.q.trim();
    query = /^\d+$/.test(t)
      ? query.like("numero_documento", `${t}%`)
      : query.ilike("nombre_completo", `%${t.toUpperCase()}%`);
  }

  const page = Math.max(1, Number(sp.p) || 1);
  const { data, count } = await query
    .order("orden_registro")
    .range((page - 1) * PAGE, page * PAGE - 1);

  const rows = (data ?? []) as Row[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    Object.entries({ ...sp, j: jid, ...extra }).forEach(([k, v]) => v && p.set(k, v));
    return `?${p}`;
  };

  const exportQs = (format: "xlsx" | "csv") => {
    const p = new URLSearchParams({ j: jid, format });
    (["f", "h", "e", "m", "l"] as const).forEach((k) => sp[k] && p.set(k, sp[k]!));
    return `/api/admin/export?${p}`;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand">Registros</h1>

      <form method="get" className="card grid gap-3 sm:grid-cols-4 sm:items-end">
        <div className="sm:col-span-2">
          <label className="label">Jornada</label>
          <select name="j" defaultValue={jid} className="input">
            {(journeys ?? []).map((j) => (
              <option key={j.id} value={j.id}>{j.nombre} ({j.estado})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Fecha</label>
          <select name="f" defaultValue={sp.f ?? ""} className="input">
            <option value="">Todas</option>
            {(dates ?? []).map((d) => (
              <option key={d.id} value={d.fecha}>
                {formatFecha(d.fecha, { day: "2-digit", month: "short", year: "numeric" })}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Hora</label>
          <select name="h" defaultValue={sp.h ?? ""} className="input">
            <option value="">Todas</option>
            {horas.map((h) => <option key={h} value={h}>{hhmm(h)}</option>)}
          </select>
        </div>
        <div>
          <th className="p-2">Estado</th>
          <select name="e" defaultValue={sp.e ?? ""} className="input">
            <option value="">Todos</option>
            <option value="asignada">Asignada</option>
            <option value="asistio">Asistió</option>
            <option value="no_asistio">No asistió</option>
            <option value="reprogramado">Reprogramada</option>
          </select>
        </div>
        <div>
          <label className="label">Método</label>
          <select name="m" defaultValue={sp.m ?? ""} className="input">
            <option value="">Todos</option>
            <option value="escaneo">Escaneo</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        <div>
          <label className="label">Logística</label>
          <select name="l" defaultValue={sp.l ?? ""} className="input">
            <option value="">Todos</option>
            {(lus ?? []).map((u) => <option key={u.id} value={u.id}>{u.nombre_interno}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Cédula o nombre</label>
          <input name="q" defaultValue={sp.q ?? ""} className="input" placeholder="Buscar…" />
        </div>
        <div className="flex gap-2 sm:col-span-4 sm:justify-end">
          <Link href="/admin/registros" className="btn-outline">Limpiar</Link>
          <button className="btn-primary">Filtrar</button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-black/60">
          <b>{total}</b> registro(s) · página {page} de {pages}
        </p>
        <div className="ml-auto flex gap-2">
          <a href={exportQs("xlsx")} className="btn-primary">⬇ Exportar Excel</a>
          <a href={exportQs("csv")} className="btn-outline">⬇ CSV</a>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-brand/5 text-left">
            <tr>
              <th className="p-2">#</th>
              <th className="p-2">Cédula</th>
              <th className="p-2">Nombre</th>
              <th className="p-2">Teléfono</th>
              <th className="p-2">Fecha</th>
              <th className="p-2">Hora</th>
              <th className="p-2">Método</th>
              <th className="p-2">Logística</th>
              <th className="p-2">Registrado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-black/5">
                <td className="p-2 tabular-nums">{r.orden_registro}</td>
                <td className="p-2 font-mono">{r.numero_documento}</td>
                <td className="p-2">{r.nombre_completo}</td>
                <td className="p-2 font-mono">{r.telefono}</td>
                <td className="p-2">{formatFecha(r.fecha, { day: "2-digit", month: "short" })}</td>
                <td className="p-2 font-semibold">{hhmm(r.hora_inicio)}</td>
                <td className="p-2"><EstadoBadge estado={r.estado} /></td>
                <td className="p-2 capitalize">{r.metodo_registro}</td>
                <td className="p-2">{r.logistica ?? "—"}</td>
                <td className="p-2 text-xs text-black/60">
                  {new Date(r.created_at).toLocaleString("es-CO", {
                    timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short",
                  })}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={9} className="p-6 text-center text-black/50">Sin registros con estos filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && <Link href={qs({ p: String(page - 1) })} className="btn-outline">← Anterior</Link>}
          {page < pages && <Link href={qs({ p: String(page + 1) })} className="btn-outline">Siguiente →</Link>}
        </div>
      )}
    </div>
  );
}