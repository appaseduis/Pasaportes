import { requireLogistics } from "@/lib/auth/guards";
import LogisticsHeader from "@/components/LogisticsHeader";
import Consulta from "./consulta";

export default async function ConsultaPage() {
  const ctx = await requireLogistics();
  return (
    <main className="min-h-screen">
      <LogisticsHeader journeyNombre={ctx.journeyNombre} nombreInterno={ctx.nombreInterno} />
      <div className="mx-auto max-w-2xl p-4">
        <Consulta />
      </div>
    </main>
  );
}