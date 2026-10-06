"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePin, hashPin, pinLookup } from "@/lib/auth/pin";
import { logAudit } from "@/lib/audit";

const PATH = "/admin/logistica";
const uuid = z.string().uuid();
const val = (fd: FormData, k: string) => fd.get(k)?.toString() ?? "";

export type PinState = { pin?: string; nombre?: string; error?: string } | null;

type Db = ReturnType<typeof createAdminClient>;

async function newUniquePin(db: Db) {
  for (let i = 0; i < 10; i++) {
    const pin = generatePin();
    const lookup = pinLookup(pin);
    const { data } = await db.from("logistics_users").select("id").eq("pin_lookup", lookup).maybeSingle();
    if (!data) return { pin, lookup };
  }
  throw new Error("No se pudo generar un PIN único.");
}

function back(msg: string, type: "ok" | "error" = "ok"): never {
  revalidatePath(PATH);
  redirect(`${PATH}?${type}=${encodeURIComponent(msg)}`);
}

// ---------- Crear usuario ----------
export async function createLogisticsUser(_: PinState, fd: FormData): Promise<PinState> {
  const { user } = await requireAdmin();
  const nombre = z.string().trim().min(2).max(80).safeParse(val(fd, "nombre_interno"));
  if (!nombre.success) return { error: "Escribe un nombre interno (mínimo 2 caracteres)." };

  const db = createAdminClient();
  const { pin, lookup } = await newUniquePin(db);

  const { data, error } = await db
    .from("logistics_users")
    .insert({
      nombre_interno: nombre.data,
      pin_lookup: lookup,
      pin_hash: await hashPin(pin),
      rol: val(fd, "rol") === "oficina" ? "oficina" : "logistica",
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await logAudit("admin", user.id, "LOGISTICA_CREADA", "logistics_users", data.id, { nombre: nombre.data });
  revalidatePath(PATH);
  return { pin, nombre: nombre.data };
}

// ---------- Resetear PIN ----------
export async function resetPin(_: PinState, fd: FormData): Promise<PinState> {
  const { user } = await requireAdmin();
  const id = uuid.safeParse(val(fd, "id"));
  if (!id.success) return { error: "Usuario inválido." };

  const db = createAdminClient();
  const { pin, lookup } = await newUniquePin(db);

  const { data, error } = await db
    .from("logistics_users")
    .update({ pin_lookup: lookup, pin_hash: await hashPin(pin) })
    .eq("id", id.data)
    .select("nombre_interno")
    .single();
  if (error) return { error: error.message };

  await logAudit("admin", user.id, "PIN_RESETEADO", "logistics_users", id.data);
  revalidatePath(PATH);
  return { pin, nombre: data.nombre_interno };
}

// ---------- Activar / desactivar ----------
export async function toggleActivo(fd: FormData) {
  const { user } = await requireAdmin();
  const id = uuid.safeParse(val(fd, "id"));
  if (!id.success) back("Usuario inválido.", "error");
  const activo = val(fd, "activo") === "true";

  const { error } = await createAdminClient()
    .from("logistics_users").update({ activo }).eq("id", id.data);
  if (error) back(error.message, "error");

  await logAudit("admin", user.id, activo ? "LOGISTICA_ACTIVADA" : "LOGISTICA_DESACTIVADA", "logistics_users", id.data);
  back(activo ? "Usuario activado." : "Usuario desactivado.");
}

// ---------- Asignar / retirar jornada ----------
export async function assignJourney(fd: FormData) {
  const { user } = await requireAdmin();
  const p = z.object({ user_id: uuid, journey_id: uuid })
    .safeParse({ user_id: val(fd, "user_id"), journey_id: val(fd, "journey_id") });
  if (!p.success) back("Selecciona una jornada.", "error");

  const { error } = await createAdminClient()
    .from("logistics_user_journeys")
    .upsert(
      { logistics_user_id: p.data.user_id, journey_id: p.data.journey_id, activo: true },
      { onConflict: "logistics_user_id,journey_id" }
    );
  if (error) back(error.message, "error");

  await logAudit("admin", user.id, "LOGISTICA_ASIGNADA", "logistics_users", p.data.user_id, { journey_id: p.data.journey_id });
  back("Jornada asignada.");
}

export async function removeJourney(fd: FormData) {
  const { user } = await requireAdmin();
  const id = uuid.safeParse(val(fd, "id"));
  if (!id.success) back("Asignación inválida.", "error");

  const { data, error } = await createAdminClient()
    .from("logistics_user_journeys").delete().eq("id", id.data)
    .select("logistics_user_id, journey_id").single();
  if (error) back(error.message, "error");

  await logAudit("admin", user.id, "LOGISTICA_RETIRADA", "logistics_users", data.logistics_user_id, { journey_id: data.journey_id });
  back("Usuario retirado de la jornada.");
}
// ---------- Eliminar usuario ----------
export async function deleteLogisticsUser(fd: FormData) {
  const { user } = await requireAdmin();
  const id = uuid.safeParse(val(fd, "id"));
  if (!id.success) back("Usuario inválido.", "error");

  const db = createAdminClient();

  const { count } = await db
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("logistics_user_id", id.data);

  if ((count ?? 0) > 0) {
    back(`No se puede eliminar: registró ${count} cita(s). Desactívalo en su lugar.`, "error");
  }

  const { data, error } = await db
    .from("logistics_users").delete().eq("id", id.data)
    .select("nombre_interno").single();
  if (error) back(error.message, "error");

  await logAudit("admin", user.id, "LOGISTICA_ELIMINADA", "logistics_users", id.data, { nombre: data.nombre_interno });
  back("Usuario eliminado.");
}