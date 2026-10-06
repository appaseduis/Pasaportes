"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { PIN_REGEX, pinLookup, verifyPin, hashPin } from "@/lib/auth/pin";
import { getClientIp, isBlocked, recordAttempt } from "@/lib/auth/rate-limit";
import { createLogisticsSession, getLogisticsSession } from "@/lib/auth/logistics-session";
import { authorizedJourneys } from "@/lib/auth/logistics-journeys";
import { logAudit } from "@/lib/audit";

export type LoginState = { error?: string } | null;

export async function loginPin(_: LoginState, fd: FormData): Promise<LoginState> {
  const pin = fd.get("pin")?.toString() ?? "";
  if (!PIN_REGEX.test(pin)) return { error: "El PIN debe tener 6 dígitos." };

  const db = createAdminClient();
  const ip = await getClientIp();

  if (await isBlocked(db, ip)) {
    return { error: "Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo." };
  }

  const { data: user } = await db
    .from("logistics_users")
    .select("id, pin_hash, activo, rol")
    .eq("pin_lookup", pinLookup(pin))
    .maybeSingle();

  // Mismo costo de tiempo exista o no el usuario
  const valid = user ? await verifyPin(pin, user.pin_hash) : (await hashPin(pin), false);

  if (!user || !valid || !user.activo) {
    await recordAttempt(db, ip, false, user?.id ?? null);
    return { error: "PIN inválido o usuario inactivo." };
  }

  // ---- Oficina: solo consulta, sin jornada ----
  if (user.rol === "oficina") {
    await recordAttempt(db, ip, true, user.id);
    await logAudit("logistica", user.id, "LOGIN_OFICINA", "logistics_users", user.id, { ip });
    await createLogisticsSession({ lu: user.id, journey: null });
    redirect("/oficina");
  }

  // ---- Logística: requiere jornadas activas asignadas ----
  const journeys = await authorizedJourneys(user.id);
  if (journeys.length === 0) {
    await recordAttempt(db, ip, false, user.id);
    return { error: "No tienes jornadas activas asignadas. Contacta al administrador." };
  }

  await recordAttempt(db, ip, true, user.id);
  await logAudit("logistica", user.id, "LOGIN_LOGISTICA", "logistics_users", user.id, { ip });

  if (journeys.length === 1) {
    await createLogisticsSession({ lu: user.id, journey: journeys[0].id });
    redirect("/logistica/registro");
  }

  await createLogisticsSession({ lu: user.id, journey: null });
  redirect("/logistica/jornada");
}

export async function selectJourney(fd: FormData) {
  const s = await getLogisticsSession();
  if (!s) redirect("/logistica");

  const id = z.string().uuid().safeParse(fd.get("journey_id")?.toString());
  if (!id.success) redirect("/logistica/jornada");

  // Nunca confiar en el journey_id del cliente: se verifica la autorización
  const journeys = await authorizedJourneys(s.lu);
  if (!journeys.some((j) => j.id === id.data)) redirect("/logistica/jornada");

  await createLogisticsSession({ lu: s.lu, journey: id.data });
  redirect("/logistica/registro");
}