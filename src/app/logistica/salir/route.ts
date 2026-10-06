import { NextResponse } from "next/server";
import { clearLogisticsSession } from "@/lib/auth/logistics-session";

export async function GET(request: Request) {
  await clearLogisticsSession();
  return NextResponse.redirect(new URL("/logistica", request.url));
}