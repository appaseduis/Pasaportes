import BrandStripe from "@/components/BrandStripe";
import LoginForm from "./login-form";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col">
      <header className="bg-brand px-4 py-4 text-center font-bold text-white">
        Citas Pasaportes · Administración
      </header>
      <BrandStripe />
      <div className="flex flex-1 items-center justify-center p-4">
        <LoginForm initialError={error === "no_admin" ? "Este usuario no tiene permisos de administrador." : null} />
      </div>
    </main>
  );
}