import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// Ajustables. Ojo: varias tablets en la misma red comparten IP pública.
const IP_MAX_FAILS = 10;     // por IP
const IP_WINDOW_MIN = 15;
const GLOBAL_MAX_FAILS = 40; // todas las IPs, por minuto

type Db = ReturnType<typeof createAdminClient>;

export async function getClientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

export async function isBlocked(db: Db, ip: string): Promise<boolean> {
  const sinceIp = new Date(Date.now() - IP_WINDOW_MIN * 60_000).toISOString();
  const sinceGlobal = new Date(Date.now() - 60_000).toISOString();

  const [ipRes, globalRes] = await Promise.all([
    db.from("login_attempts").select("id", { count: "exact", head: true })
      .eq("ip", ip).eq("exitoso", false).gte("created_at", sinceIp),
    db.from("login_attempts").select("id", { count: "exact", head: true })
      .eq("exitoso", false).gte("created_at", sinceGlobal),
  ]);

  return (ipRes.count ?? 0) >= IP_MAX_FAILS || (globalRes.count ?? 0) >= GLOBAL_MAX_FAILS;
}

export async function recordAttempt(db: Db, ip: string, exitoso: boolean, userId: string | null = null) {
  await db.from("login_attempts").insert({ ip, exitoso, logistics_user_id: userId });
}