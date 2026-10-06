import { requireAdmin } from "@/lib/auth/guards";
import Alerts from "@/components/Alerts";
import EstadoBadge from "@/components/EstadoBadge";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import Collapsible from "@/components/Collapsible";
import { CreateUserForm, ResetPinButton } from "./pin-forms";
import { toggleActivo, assignJourney, removeJourney, deleteLogisticsUser } from "./actions";

type Asig = { id: string; journey_id: string; journeys: { nombre: string; estado: string } };
type LU = { id: string; nombre_interno: string; activo: boolean; rol: string; logistics_user_journeys: Asig[] };

export default async function LogisticaAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();

  const [{ data: users }, { data: journeys }] = await Promise.all([
    supabase
      .from("logistics_users")
      .select("id, nombre_interno, activo, rol, logistics_user_journeys(id, journey_id, journeys(nombre, estado))")
      .order("created_at"),
    supabase.from("journeys").select("id, nombre, estado").neq("estado", "inactiva")
      .order("created_at", { ascending: false }),
  ]);

  const list = (users ?? []) as unknown as LU[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand">Usuarios de logística</h1>
      <Alerts error={sp.error} ok={sp.ok} />
      <CreateUserForm />

      <div className="space-y-3">
        {list.map((u) => {
          const asignadas = new Set(u.logistics_user_journeys.map((a) => a.journey_id));
          const disponibles = (journeys ?? []).filter((j) => !asignadas.has(j.id));
          const n = u.logistics_user_journeys.length;

          return (
            <Collapsible
              key={u.id}
              id={u.id}
              summary={
                <>
                  <span className={`font-semibold ${u.activo ? "" : "text-black/40"}`}>{u.nombre_interno}</span>
                  <EstadoBadge estado={u.activo ? "activo" : "inactivo"} />
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    u.rol === "oficina" ? "bg-brand text-white" : "bg-brand/10 text-brand"}`}>
                    {u.rol === "oficina" ? "OFICINA" : "LOGÍSTICA"}
                  </span>
                  <span className="text-sm text-black/60">
                    {u.rol === "oficina"
                      ? "Todas las jornadas (consulta)"
                      : n === 0 ? "Sin jornadas" : `${n} jornada${n > 1 ? "s" : ""}`}
                  </span>
                </>
              }
            >
            {/* Jornadas */}
              {u.rol === "oficina" ? (
                <p className="text-sm text-black/60">
                  Usuario de oficina: consulta citas de <b>todas</b> las jornadas. No registra.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Jornadas asignadas</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {u.logistics_user_journeys.map((a) => (
                      <form key={a.id} action={removeJourney}
                        className="flex items-center gap-1 rounded-full bg-brand/10 py-0.5 pl-3 pr-1 text-sm">
                        <input type="hidden" name="id" value={a.id} />
                        {a.journeys.nombre}
                        <span className="text-xs text-black/50">({a.journeys.estado})</span>
                        <ConfirmSubmit className="rounded-full px-2 text-danger hover:bg-danger/10"
                          message={`¿Retirar a ${u.nombre_interno} de ${a.journeys.nombre}?`}>
                          ×
                        </ConfirmSubmit>
                      </form>
                    ))}
                    {n === 0 && <span className="text-sm text-black/40">Ninguna</span>}
                  </div>

                  {disponibles.length > 0 && (
                    <form action={assignJourney} className="flex flex-wrap gap-2">
                      <input type="hidden" name="user_id" value={u.id} />
                      <select name="journey_id" className="input max-w-xs py-1 text-sm" required defaultValue="">
                        <option value="" disabled>Asignar jornada…</option>
                        {disponibles.map((j) => (
                          <option key={j.id} value={j.id}>{j.nombre} ({j.estado})</option>
                        ))}
                      </select>
                      <button className="btn-outline px-3 py-1 text-sm">Asignar</button>
                    </form>
                  )}
                </div>
              )}

              {/* Acciones */}
              <div className="flex flex-wrap items-start gap-3 border-t border-black/5 pt-4">
                <div className="flex-1">
                  <ResetPinButton id={u.id} />
                </div>
                <form action={toggleActivo}>
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="activo" value={String(!u.activo)} />
                  {u.activo ? (
                    <ConfirmSubmit className="btn-danger px-3 py-1 text-sm"
                      message="¿Desactivar este usuario? Perderá el acceso de inmediato.">
                      Desactivar
                    </ConfirmSubmit>
                  ) : (
                    <button className="btn-primary px-3 py-1 text-sm">Activar</button>
                  )}
                </form>
                                <form action={deleteLogisticsUser}>
                  <input type="hidden" name="id" value={u.id} />
                  <ConfirmSubmit
                    className="btn px-3 py-1 text-sm text-danger hover:bg-danger/10"
                    message={`¿Eliminar definitivamente a ${u.nombre_interno}? Esta acción no se puede deshacer.`}
                  >
                    Eliminar
                  </ConfirmSubmit>
                </form>
              </div>
            </Collapsible>
          );
        })}
        {!list.length && <p className="card text-center text-black/50">No hay usuarios de logística.</p>}
      </div>
    </div>
  );
}