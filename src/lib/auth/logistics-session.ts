import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "lg_session";
const MAX_AGE = 60 * 60 * 12; // 12 horas

export type LogisticsSession = { lu: string; journey: string | null };

const secret = () =>
  new TextEncoder().encode(process.env.LOGISTICS_SESSION_SECRET!);

export async function createLogisticsSession(s: LogisticsSession) {
  const token = await new SignJWT({ lu: s.lu, journey: s.journey })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getLogisticsSession(): Promise<LogisticsSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (typeof payload.lu !== "string") return null;
    return {
      lu: payload.lu,
      journey: typeof payload.journey === "string" ? payload.journey : null,
    };
  } catch {
    return null;
  }
}

export async function clearLogisticsSession() {
  (await cookies()).delete(COOKIE);
}