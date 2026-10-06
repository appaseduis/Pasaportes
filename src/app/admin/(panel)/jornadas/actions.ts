"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";

const LIST = "/admin/jornadas";
const detail = (id: string) => `${LIST}/${id}`;

const uuid = z.string().uuid();
const posInt = z.coerce.number().int().positive();
const hora = z.string().regex(/^\d{2}:\d{2}$/);
const fechaRx = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);


const val = (fd: FormData, k: string) => fd.get(k)?.toString() ?? "";

function fail(path: string, msg: string): never {
  redirect(`${path}?error=${encodeURIComponent(msg)}`);
}

function done(path: string, error: { message: string } | null, ok: string): never {
  revalidatePath(path);
  if (error) fail(path, error.message);
  redirect(`${path}?ok=${encodeURIComponent(ok)}`);
}

function journeyId(fd: FormData): string {
  const r = uuid.safeParse(val(fd, "journey_id"));
  if (!r.success) fail(LIST, "Jornada inválida.");
  return r.data;
}

const toMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const fromMin = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// ---------- JORNADAS ----------
// Número positivo opcional: vacío → null
const optPos = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.coerce.number().int().positive().nullable()
);

const journeySchema = z.object({
  modo: z.enum(["agenda", "preinscripcion"]),
  nombre: z.string().trim().min(3).max(120),
  capacidad_total_objetivo: posInt,
  capacidad_max_por_horario: posInt,
  modulos: optPos,
  minutos_por_persona: optPos,
});

function parseJourney(fd: FormData, path: string) {
  const p = journeySchema.safeParse({
    nombre: val(fd, "nombre"),
    modo: val(fd, "modo") || "agenda",
    capacidad_total_objetivo: val(fd, "capacidad_total_objetivo"),
    capacidad_max_por_horario: val(fd, "capacidad_max_por_horario"),
    modulos: val(fd, "modulos"),
    minutos_por_persona: val(fd, "minutos_por_persona"),
  });
  if (!p.success) fail(path, "Revisa los datos de la jornada.");
  return p.data;
}

export async function createJourney(fd: FormData) {
  const { supabase } = await requireAdmin();
  const data = parseJourney(fd, LIST);
  const { data: row, error } = await supabase.from("journeys").insert(data).select("id").single();
  if (error) fail(LIST, error.message);
  revalidatePath(LIST);
  redirect(detail(row.id));
}

export async function updateJourney(fd: FormData) {
  const { supabase } = await requireAdmin();
  const id = journeyId(fd);
  const data = parseJourney(fd, detail(id));
  const { error } = await supabase.from("journeys").update(data).eq("id", id);
  done(detail(id), error, "Jornada actualizada.");
}

export async function setJourneyEstado(fd: FormData) {
  const { supabase } = await requireAdmin();
  const id = journeyId(fd);
  const estado = z.enum(["activa", "inactiva"]).safeParse(val(fd, "estado"));
  if (!estado.success) fail(detail(id), "Estado inválido.");
  const { error } = await supabase.from("journeys").update({ estado: estado.data }).eq("id", id);
  done(detail(id), error, estado.data === "activa" ? "Jornada activada." : "Jornada desactivada.");
}

// ---------- FECHAS ----------
export async function addDate(fd: FormData) {
  const { supabase } = await requireAdmin();
  const jid = journeyId(fd);
  const p = z.object({ fecha: fechaRx, capacidad_total: posInt })
    .safeParse({ fecha: val(fd, "fecha"), capacidad_total: val(fd, "capacidad_total") });
  if (!p.success) fail(detail(jid), "Revisa la fecha y su capacidad.");
  const { error } = await supabase.from("journey_dates").insert({ journey_id: jid, ...p.data });
  done(detail(jid), error, "Fecha agregada.");
}

export async function updateDate(fd: FormData) {
  const { supabase } = await requireAdmin();
  const jid = journeyId(fd);
  const p = z.object({ id: uuid, capacidad_total: posInt, estado: z.enum(["activa", "inactiva"]) })
    .safeParse({ id: val(fd, "id"), capacidad_total: val(fd, "capacidad_total"), estado: val(fd, "estado") });
  if (!p.success) fail(detail(jid), "Datos de fecha inválidos.");
  const { id, ...rest } = p.data;
  const { error } = await supabase.from("journey_dates").update(rest).eq("id", id).eq("journey_id", jid);
  done(detail(jid), error, "Fecha actualizada.");
}

export async function deleteDate(fd: FormData) {
  const { supabase } = await requireAdmin();
  const jid = journeyId(fd);
  const id = uuid.safeParse(val(fd, "id"));
  if (!id.success) fail(detail(jid), "Fecha inválida.");
  const { error } = await supabase.from("journey_dates").delete().eq("id", id.data).eq("journey_id", jid);
  done(detail(jid), error ? { message: "No se puede eliminar: la fecha tiene citas asignadas." } : null, "Fecha eliminada.");
}

// ---------- HORARIOS ----------
export async function generateSlots(fd: FormData) {
  const { supabase } = await requireAdmin();
  const jid = journeyId(fd);
  const p = z.object({
    journey_date_id: uuid, desde: hora, hasta: hora,
    duracion: posInt.max(600), capacidad: posInt,
  }).safeParse({
    journey_date_id: val(fd, "journey_date_id"), desde: val(fd, "desde"), hasta: val(fd, "hasta"),
    duracion: val(fd, "duracion"), capacidad: val(fd, "capacidad"),
  });
  if (!p.success) fail(detail(jid), "Revisa los datos para generar horarios.");

  const { journey_date_id, desde, hasta, duracion, capacidad } = p.data;
  const rows = [];
  for (let t = toMin(desde); t + duracion <= toMin(hasta); t += duracion) {
    rows.push({ journey_id: jid, journey_date_id, hora_inicio: fromMin(t), hora_fin: fromMin(t + duracion), capacidad });
  }
  if (rows.length === 0) fail(detail(jid), "El rango no alcanza para ningún horario.");

  const { error } = await supabase.from("time_slots").insert(rows);
  done(detail(jid), error, `${rows.length} horario(s) creados.`);
}

export async function updateSlot(fd: FormData) {
  const { supabase } = await requireAdmin();
  const jid = journeyId(fd);
  const p = z.object({ id: uuid, capacidad: posInt, estado: z.enum(["activo", "inactivo"]) })
    .safeParse({ id: val(fd, "id"), capacidad: val(fd, "capacidad"), estado: val(fd, "estado") });
  if (!p.success) fail(detail(jid), "Datos de horario inválidos.");
  const { id, ...rest } = p.data;
  const { error } = await supabase.from("time_slots").update(rest).eq("id", id).eq("journey_id", jid);
  done(detail(jid), error, "Horario actualizado.");
}

export async function deleteSlot(fd: FormData) {
  const { supabase } = await requireAdmin();
  const jid = journeyId(fd);
  const id = uuid.safeParse(val(fd, "id"));
  if (!id.success) fail(detail(jid), "Horario inválido.");
  const { error } = await supabase.from("time_slots").delete().eq("id", id.data).eq("journey_id", jid);
  done(detail(jid), error ? { message: "No se puede eliminar: el horario tiene citas asignadas." } : null, "Horario eliminado.");
}

// ---------- Eliminar jornada ----------
export async function deleteJourney(fd: FormData) {
  const { supabase, user } = await requireAdmin();
  const id = journeyId(fd);

  const { data: j } = await supabase.from("journeys").select("nombre, estado").eq("id", id).maybeSingle();
  if (!j) fail(LIST, "La jornada no existe.");

  if (j.estado === "activa") fail(detail(id), "Desactiva la jornada antes de eliminarla.");

  const { count } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("journey_id", id);
  if ((count ?? 0) > 0) {
    fail(detail(id), `La jornada tiene ${count} cita(s). Reiníciala (exportando antes) para poder eliminarla.`);
  }

  if (val(fd, "confirmacion").trim() !== j.nombre) {
    fail(detail(id), "Escribe el nombre exacto de la jornada para confirmar.");
  }

  const { error } = await supabase.from("journeys").delete().eq("id", id);
  if (error) fail(detail(id), error.message);

  await logAudit("admin", user.id, "JORNADA_ELIMINADA", "journeys", id, { nombre: j.nombre });
  revalidatePath(LIST);
  redirect(`${LIST}?ok=${encodeURIComponent("Jornada eliminada.")}`);
}

// ---------- Reiniciar jornada ----------
export async function resetJourney(fd: FormData) {
  const { supabase } = await requireAdmin();
  const id = journeyId(fd);
  const { data, error } = await supabase.rpc("reset_journey", {
    p_journey_id: id,
    p_confirmacion: val(fd, "confirmacion").trim(),
  });
  if (error) fail(detail(id), error.message);
  done(detail(id), null, `Jornada reiniciada: ${data} cita(s) eliminada(s).`);
}

// ---------- Asignar horarios a preinscritos ----------
export async function assignPending(fd: FormData) {
  const { supabase } = await requireAdmin();
  const id = journeyId(fd);
  const { data, error } = await supabase.rpc("assign_pending_slots", { p_journey_id: id });
  if (error) fail(detail(id), error.message);

  const r = data as { asignadas: number; pendientes: number };
  done(
    detail(id),
    null,
    r.pendientes
      ? `${r.asignadas} asignado(s). Quedan ${r.pendientes} sin horario: agrega más horarios y repite.`
      : `${r.asignadas} preinscrito(s) asignados. La jornada pasó a modo agenda.`
  );
}