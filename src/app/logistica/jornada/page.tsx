import Link from "next/link";
import { redirect } from "next/navigation";
import BrandStripe from "@/components/BrandStripe";
import { getLogisticsSession } from "@/lib/auth/logistics-session";
import { authorizedJourneys } from "@/lib/auth/logistics-journeys";
import { createAdminClient } from "@/lib/supabase/admin";
import { selectJourney } from "../actions";

export default async function SeleccionarJornada() {
  const s = await getLogisticsSession();
  if (!s) redirect("/logistica");

    const { data: user } = await createAdminClient()
    .from("logistics_users").select("activo, nombre_interno, rol").eq("id", s.lu).maybeSingle();
  if (!user?.activo) redirect("/logistica/salir");
  if (user.rol === "oficina") redirect("/oficina");

  const journeys = await authorizedJourneys(s.lu);

  return (
    <main className="flex min-h-screen flex-col">
      <header className="bg-brand px-4 py-4 text-center font-bold text-white">
        Citas Pasaportes · Logística
      </header>
      <BrandStripe />
      <div className="mx-auto w-full max-w-md flex-1 space-y-4 p-4">
        <div className="text-center">
          <p className="text-sm text-black/60">Hola, {user.nombre_interno}</p>
          <h1 className="text-xl font-semibold text-brand">Selecciona la jornada</h1>
        </div>

        {journeys.map((j) => (
          <form key={j.id} action={selectJourney}>
            <input type="hidden" name="journey_id" value={j.id} />
            <button className="card w-full text-left text-lg font-semibold transition hover:border-brand">
              {j.nombre}
            </button>
          </form>
        ))}

        {!journeys.length && (
          <p className="alert-error">No tienes jornadas activas asignadas.</p>
        )}

          <a href="/logistica/salir" className="block text-center text-sm text-danger hover:underline">
          Salir
        </a>
      </div>
    </main>
  );
}