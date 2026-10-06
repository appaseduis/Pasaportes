"use client";

import { useEffect, useRef } from "react";

// <details> que recuerda si estaba abierto (sessionStorage) tras recargar.
export default function Collapsible({
  id,
  summary,
  children,
}: {
  id: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const key = `open:${id}`;

  useEffect(() => {
    try {
      if (sessionStorage.getItem(key) === "1" && ref.current) ref.current.open = true;
    } catch {}
  }, [key]);

  return (
    <details
      ref={ref}
      className="card group p-0"
      onToggle={(e) => {
        try {
          sessionStorage.setItem(key, e.currentTarget.open ? "1" : "0");
        } catch {}
      }}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 p-4 [&::-webkit-details-marker]:hidden">
        {summary}
        <span className="ml-auto text-brand transition group-open:rotate-180">▾</span>
      </summary>
      <div className="space-y-4 border-t border-black/5 p-4">{children}</div>
    </details>
  );
}