import BrandStripe from "@/components/BrandStripe";
import { requireOficina } from "@/lib/auth/guards";
import ConsultaOficina from "./consulta-oficina";

export default async function OficinaPage() {
  const ctx = await requireOficina();

  return (
    <main className="min-h-screen">
      <header className="bg-brand text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <div>
            <p className="text-xs opacity-80">Oficina</p>
            <p className="font-bold leading-tight">Consulta de citas</p>
          </div>
          <span className="ml-auto text-sm opacity-80">{ctx.nombreInterno}</span>
          <a href="/logistica/salir" className="rounded-lg bg-white/15 px-3 py-1 text-sm hover:bg-white/25">
            Salir
          </a>
        </div>
        <BrandStripe />
      </header>
      <div className="mx-auto max-w-3xl p-4">
        <ConsultaOficina />
      </div>
    </main>
  );
}