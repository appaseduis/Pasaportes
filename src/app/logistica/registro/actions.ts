"use server";

import { revalidatePath } from "next/cache";
import { requireLogistics } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { personSchema, PERSON_FIELDS } from "@/lib/validation/person";
import type { Cita, RegistroState } from "@/lib/types";

export async function registerPerson(_: RegistroState, fd: FormData): Promise<RegistroState> {
  // Usuario y jornada salen de la sesión verificada en BD, nunca del formulario
  const ctx = await requireLogistics();

  const raw = Object.fromEntries(PERSON_FIELDS.map((k) => [k, fd.get(k)?.toString() ?? ""]));
  const p = personSchema.safeParse(raw);

  if (!p.success) {
    return {
      ok: false,
      codigo: "DATOS_INVALIDOS",
      mensaje: p.error.issues[0]?.message ?? "Datos inválidos.",
      values: raw,
      ts: Date.now(),
    };
  }

  const d = p.data;
  const { data, error } = await createAdminClient().rpc("assign_appointment", {
    p_logistics_user_id: ctx.userId,
    p_journey_id: ctx.journeyId,
    p_numero_documento: d.numero_documento,
    p_primer_apellido: d.primer_apellido,
    p_segundo_apellido: d.segundo_apellido || null,
    p_primer_nombre: d.primer_nombre,
    p_segundo_nombre: d.segundo_nombre || null,
    p_telefono: d.telefono,
    p_metodo: d.metodo_registro,
  });

  if (error) {
    console.error("assign_appointment:", error);
    return { ok: false, codigo: "ERROR", mensaje: "Error del servidor. Intenta de nuevo.", values: raw, ts: Date.now() };
  }

  const r = data as { ok: boolean; codigo: string; mensaje: string; cita?: Cita };
  revalidatePath("/logistica/registro");

  return {
    ...r,
    // Conserva lo digitado solo cuando hay que corregir algo
    values: r.ok || r.codigo === "YA_REGISTRADO" ? undefined : raw,
    ts: Date.now(),
  };
}

// ---------- Consulta por cédula (solo jornada de la sesión) ----------
export type ConsultaState = { cita?: Cita; mensaje?: string; ts: number } | null;

export async function lookupByDocument(_: ConsultaState, fd: FormData): Promise<ConsultaState> {
  const ctx = await requireLogistics();
  const doc = (fd.get("numero_documento")?.toString() ?? "").replace(/\D/g, "");

  if (!/^\d{3,15}$/.test(doc)) {
    return { mensaje: "Escribe un número de cédula válido.", ts: Date.now() };
  }

  const db = createAdminClient();

  const { data: person } = await db.from("people").select("id").eq("numero_documento", doc).maybeSingle();

  const { data: appt } = person
    ? await db.from("appointments").select("id")
        .eq("journey_id", ctx.journeyId).eq("person_id", person.id).maybeSingle()
    : { data: null };

  if (!appt) {
    return { mensaje: `No hay cita para la cédula ${doc} en esta jornada.`, ts: Date.now() };
  }

  const { data: cita } = await db.rpc("appointment_json", { p_appointment_id: appt.id });
  return { cita: cita as Cita, ts: Date.now() };
}