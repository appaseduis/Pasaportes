"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/logistica/registro", label: "Registro" },
  { href: "/logistica/consulta", label: "Consultar cita" },
];

export default function LogisticsNav() {
  const path = usePathname();
  return (
    <nav className="mx-auto flex max-w-6xl gap-1 px-4">
      {TABS.map((t) => {
        const active = path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
              active ? "bg-[#F4F6FB] text-brand" : "text-white/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}