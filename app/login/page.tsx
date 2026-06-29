"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await signIn("credentials", { username, password, redirect: false });
    if (res?.error) setError("Usuario o contraseña incorrectos");
    else router.push("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-center">LoloShop</h1>
        <input className="w-full rounded border p-2" placeholder="Usuario"
          value={username} onChange={(e) => setUsername(e.target.value)} />
        <input className="w-full rounded border p-2" type="password" placeholder="Contraseña"
          value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="w-full rounded bg-loloteal p-2 font-semibold text-white" type="submit">
          Entrar
        </button>
      </form>
    </main>
  );
}
