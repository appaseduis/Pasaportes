import { createBrowserClient } from "@supabase/ssr";

// Cliente del navegador (login admin y Realtime).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}