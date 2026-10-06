import { redirect } from "next/navigation";
import BrandStripe from "@/components/BrandStripe";
import { getLogisticsSession } from "@/lib/auth/logistics-session";
import PinForm from "./pin-form";

export default async function LogisticaLoginPage() {
  const s = await getLogisticsSession();
  if (s?.journey) redirect("/logistica/registro");
  if (s) redirect("/logistica/jornada");

  return (
    <main className="flex min-h-screen flex-col">
      <header className="bg-brand px-4 py-4 text-center font-bold text-white">
        Citas Pasaportes · Logística
      </header>
      <BrandStripe />
      <div className="flex flex-1 items-center justify-center p-4">
        <PinForm />
      </div>
    </main>
  );
}