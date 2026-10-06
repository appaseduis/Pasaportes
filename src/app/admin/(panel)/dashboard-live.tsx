"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Escucha cambios de la jornada y refresca los datos del servidor.
export default function DashboardLive({ journeyId }: { journeyId: string }) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => router.refresh(), 600);
    };

    const channel = supabase
      .channel(`dash:${journeyId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `journey_id=eq.${journeyId}` },
        refresh)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "time_slots", filter: `journey_id=eq.${journeyId}` },
        refresh)
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [journeyId, router]);

  return (
    <span className={`flex items-center gap-1.5 text-xs ${live ? "text-ok" : "text-black/40"}`}>
      <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-ok" : "bg-black/30"}`} />
      {live ? "En vivo" : "Conectando…"}
    </span>
  );
}