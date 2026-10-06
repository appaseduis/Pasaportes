import Link from "next/link";
import BrandStripe from "@/components/BrandStripe";
import { requireAdmin } from "@/lib/auth/guards";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/jornadas", label: "Jornadas" },
  { href: "/admin/logistica", label: "Logística" },
  { href: "/admin/registros", label: "Registros" },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();

  return (
    <div className="min-h-screen">
      <header className="bg-brand text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="font-bold">Citas Pasaportes</span>
          <nav className="flex flex-wrap gap-4 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="opacity-90 hover:opacity-100 hover:underline">
                {n.label}
              </Link>
            ))}
          </nav>
          <form action="/admin/logout" method="post" className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs opacity-80 sm:inline">{user.email}</span>
            <button className="rounded-lg bg-white/15 px-3 py-1 text-sm hover:bg-white/25">Salir</button>
          </form>
        </div>
        <BrandStripe />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}