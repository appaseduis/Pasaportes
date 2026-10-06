// Prueba de seguridad con la llave PÚBLICA (lo que tiene cualquier navegador)
// Uso: node --env-file=.env.local scripts/security-test.mjs
import { createClient } from "@supabase/supabase-js";

const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });
const FAKE = "00000000-0000-0000-0000-000000000000";

// Lecturas que deben devolver vacío o error
for (const t of ["people", "appointments", "logistics_users", "logistics_user_journeys",
                 "admins", "audit_log", "login_attempts", "journeys", "v_appointments"]) {
  const { data, error } = await anon.from(t).select("*").limit(1);
  check(`Leer ${t} → bloqueado`, !!error || (data ?? []).length === 0, error?.message ?? `${data?.length ?? 0} filas`);
}

// Escrituras que deben fallar
const w1 = await anon.from("people").insert({ numero_documento: "123456", primer_apellido: "X", primer_nombre: "Y", telefono: "3000000000" });
check("Insertar persona → bloqueado", !!w1.error, w1.error?.message);

const w2 = await anon.from("appointments").insert({ journey_id: FAKE, journey_date_id: FAKE, time_slot_id: FAKE, person_id: FAKE, orden_registro: 1, metodo_registro: "manual" });
check("Insertar cita → bloqueado", !!w2.error, w2.error?.message);

const w3 = await anon.from("time_slots").update({ ocupados: 0 }).neq("id", FAKE).select();
check("Modificar contadores → bloqueado", !!w3.error || (w3.data ?? []).length === 0, w3.error?.message ?? "0 filas afectadas");

const w4 = await anon.from("journeys").update({ capacidad_max_por_horario: 999 }).neq("id", FAKE).select();
check("Modificar jornadas → bloqueado", !!w4.error || (w4.data ?? []).length === 0, w4.error?.message ?? "0 filas afectadas");

// RPC críticas
const r1 = await anon.rpc("assign_appointment", {
  p_logistics_user_id: FAKE, p_journey_id: FAKE, p_numero_documento: "123456",
  p_primer_apellido: "X", p_segundo_apellido: null, p_primer_nombre: "Y",
  p_segundo_nombre: null, p_telefono: "3000000000", p_metodo: "manual",
});
check("Ejecutar assign_appointment → bloqueado", !!r1.error, r1.error?.message);

const r2 = await anon.rpc("reset_journey", { p_journey_id: FAKE, p_confirmacion: "x" });
check("Ejecutar reset_journey → bloqueado", !!r2.error, r2.error?.message);

const r3 = await anon.rpc("appointment_json", { p_appointment_id: FAKE });
check("Ejecutar appointment_json → bloqueado", !!r3.error, r3.error?.message);

// Lo único permitido: horarios de jornadas ACTIVAS (sin datos personales)
const ok = await anon.from("time_slots").select("id, capacidad, ocupados").limit(1);
check("Leer horarios activos → permitido (esperado)", !ok.error, ok.error?.message ?? "ok");

console.log("\n============ SEGURIDAD (llave pública) ============");
for (const r of results) console.log(`${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? "TODAS LAS PRUEBAS PASARON" : `${failed} PRUEBA(S) FALLARON`}\n`);
process.exit(failed ? 1 : 0);