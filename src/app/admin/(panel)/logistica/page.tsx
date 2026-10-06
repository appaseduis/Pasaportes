import { requireAdmin } from "@/lib/auth/guards";
import Alerts from "@/components/Alerts";
import EstadoBadge from "@/components/EstadoBadge";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import Collapsible from "@/components/Collapsible";
import { CreateUserForm, ResetPinButton } from "./pin-forms";
import { toggleActivo, deleteLogisticsUser } from "./actions";

type LU = { id: string; nombre_interno: string; activo: boolean; rol: string };

export default async function LogisticaAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();

  const { data: users } = await supabase
    .from("logistics_users")
    .select("id, nombre_interno, activo, rol")
    .order("created_at");

  const list = (users ?? []) as LU[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand">Usuarios de logística</h1>
      <Alerts error={sp.error} ok={sp.ok} />
      <CreateUserForm />

      <div className="space-y-3">
        {list.map((u) => (
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
                  {u.rol === "oficina" ? "Consulta · todas las jornadas" : "Registro · todas las jornadas"}
                </span>
              </>
            }
          >
            {/* Acceso */}
            <p className="text-sm text-black/60">
              {u.rol === "oficina"
                ? <>Usuario de oficina: consulta y cambia estados en <b>todas</b> las jornadas. No registra.</>
                : <>Acceso a <b>todas las jornadas activas</b>. Para quitarle el acceso, desactívalo.</>}
            </p>

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
        ))}
        {!list.length && <p className="card text-center text-black/50">No hay usuarios de logística.</p>}
      </div>
    </div>
  );
}