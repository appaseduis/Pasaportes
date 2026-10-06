import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLogisticsSession } from "@/lib/auth/logistics-session";

// ---------- ADMIN ----------
export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/admin/login?error=no_admin");

  return { supabase, user };
}

// ---------- LOGÍSTICA ----------
// Revalida en BD en cada request: usuario activo + jornada activa + autorización.
export type LogisticsContext = {
  userId: string;
  nombreInterno: string;
  journeyId: string;
  journeyNombre: string;
};

export async function requireLogistics(): Promise<LogisticsContext> {
  const s = await getLogisticsSession();
  if (!s) redirect("/logistica");

  const db = createAdminClient();

  const { data: user } = await db
    .from("logistics_users")
    .select("id, nombre_interno, activo, rol")
    .eq("id", s.lu)
    .maybeSingle();

  if (!user?.activo) redirect("/logistica/salir");
  if (user.rol === "oficina") redirect("/oficina");
  if (!s.journey) redirect("/logistica/jornada");

  const { data: auth } = await db
    .from("logistics_user_journeys")
    .select("journey_id, journeys!inner(id, nombre, estado)")
    .eq("logistics_user_id", s.lu)
    .eq("journey_id", s.journey)
    .eq("activo", true)
    .eq("journeys.estado", "activa")
    .maybeSingle();

  if (!auth) redirect("/logistica/jornada");

  const journey = auth.journeys as unknown as { id: string; nombre: string };

  return {
    userId: user.id,
    nombreInterno: user.nombre_interno,
    journeyId: journey.id,
    journeyNombre: journey.nombre,
  };
}

// ---------- OFICINA (solo consulta) ----------
export async function requireOficina() {
  const s = await getLogisticsSession();
  if (!s) redirect("/logistica");

  const { data: user } = await createAdminClient()
    .from("logistics_users")
    .select("id, nombre_interno, activo, rol")
    .eq("id", s.lu)
    .maybeSingle();

  if (!user?.activo) redirect("/logistica/salir");
  if (user.rol !== "oficina") redirect("/logistica/registro");

  return { userId: user.id as string, nombreInterno: user.nombre_interno as string };
}