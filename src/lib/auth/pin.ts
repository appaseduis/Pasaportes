import "server-only";
import { createHmac, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

export const PIN_REGEX = /^\d{6}$/;

// Valor determinístico para buscar el usuario por PIN (requiere PEPPER secreto).
export function pinLookup(pin: string): string {
  return createHmac("sha256", process.env.PIN_PEPPER!).update(pin).digest("hex");
}

export function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 12);
}

export function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

export function generatePin(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}