import Link from "next/link";
import BrandStripe from "@/components/BrandStripe";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="bg-brand px-4 py-5 text-center text-white">
        <h1 className="text-2xl font-bold">Citas Pasaportes</h1>
        <p className="text-sm opacity-80">Asignación automática de citas</p>
      </header>
      <BrandStripe />
      <div className="mx-auto grid w-full max-w-2xl flex-1 content-center gap-4 p-4 sm:grid-cols-2">
        <Link href="/logistica" className="card text-center transition hover:border-brand">
          <p className="text-lg font-semibold text-brand">Logística</p>
          <p className="text-sm text-black/60">Registro de personas con PIN</p>
        </Link>
        <Link href="/admin" className="card text-center transition hover:border-brand">
          <p className="text-lg font-semibold text-brand">Administración</p>
          <p className="text-sm text-black/60">Jornadas, usuarios y reportes</p>
        </Link>
      </div>
    </main>
  );
}