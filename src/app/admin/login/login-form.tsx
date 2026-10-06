"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm({ initialError }: { initialError: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Correo o contraseña incorrectos.");
      setLoading(false);
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4">
      <h2 className="text-xl font-semibold text-brand">Iniciar sesión</h2>
      {error && <p className="alert-error">{error}</p>}
      <div>
        <label className="label" htmlFor="email">Correo</label>
        <input id="email" type="email" className="input" required autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="password">Contraseña</label>
        <input id="password" type="password" className="input" required autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <button className="btn-primary w-full" disabled={loading}>
        {loading ? "Ingresando..." : "Ingresar"}
      </button>
    </form>
  );
}