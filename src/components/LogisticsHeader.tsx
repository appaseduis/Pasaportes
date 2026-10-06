import Link from "next/link";
import BrandStripe from "@/components/BrandStripe";
import LogisticsNav from "@/components/LogisticsNav";

export default function LogisticsHeader({
  journeyNombre,
  nombreInterno,
}: {
  journeyNombre: string;
  nombreInterno: string;
}) {
  return (
    <header className="bg-brand text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-3 pb-2">
        <div>
          <p className="text-xs opacity-80">Jornada</p>
          <p className="font-bold leading-tight">{journeyNombre}</p>
        </div>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="opacity-80">{nombreInterno}</span>
          <Link href="/logistica/jornada" className="rounded-lg bg-white/15 px-3 py-1 hover:bg-white/25">
            Cambiar jornada
          </Link>
          <a href="/logistica/salir" className="rounded-lg bg-white/15 px-3 py-1 hover:bg-white/25">
            Salir
          </a>
        </div>
      </div>
      <LogisticsNav />
      <BrandStripe />
    </header>
  );
}