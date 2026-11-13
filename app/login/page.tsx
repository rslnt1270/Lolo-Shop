"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const res = await signIn("credentials", { username: username.trim(), password, redirect: false });
      if (res?.error) {
        setError("Usuario o contraseña incorrectos");
        setIsLoading(false);
      } else {
        router.refresh(); // Fuerza a Next.js a leer las nuevas cookies de sesión
        router.push("/");
      }
    } catch {
      setError("No hay conexión. Revisa tu internet e intenta de nuevo.");
      setIsLoading(false);
    }
  }

  const containerVariants: import("framer-motion").Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants: import("framer-motion").Variants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
  };

  return (
    <main className="flex min-h-pantalla flex-col items-center justify-center bg-niebla p-6">
      <motion.div
        className="w-full max-w-sm rounded-[28px] bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-borde-control"
        variants={containerVariants}
        initial={false}
        animate="visible"
      >
        <motion.div variants={itemVariants} className="flex flex-col items-center justify-center space-y-3 pb-8">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-niebla">
            <img src="/loloshop-logo.png" alt="LoloShop Logo" className="h-14 w-14 drop-shadow-sm" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-tinta">Bienvenido a LoloShop</h1>
            <p className="mt-1 text-sm text-gray-600">Inicia sesión para continuar</p>
          </div>
        </motion.div>
        
        <form onSubmit={onSubmit} className="space-y-5">
          <motion.div variants={itemVariants} className="space-y-4">
            <div>
              <label htmlFor="login-usuario" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600">Usuario</label>
              <input 
                className="w-full rounded-xl border border-borde-control bg-niebla p-3.5 text-sm text-tinta transition-colors focus:border-turquesa-texto focus:bg-white focus:outline-none focus:ring-1 focus:ring-turquesa-texto" 
                id="login-usuario"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Ingresa tu usuario"
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
                required
              />
            </div>
            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600">Contraseña</label>
              <input 
                className="w-full rounded-xl border border-borde-control bg-niebla p-3.5 text-sm text-tinta transition-colors focus:border-turquesa-texto focus:bg-white focus:outline-none focus:ring-1 focus:ring-turquesa-texto" 
                id="login-password"
                name="password"
                autoComplete="current-password"
                type="password" 
                placeholder="••••••••"
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required
              />
            </div>
          </motion.div>
          
          <motion.div variants={itemVariants}>
            {error && (
              <p role="alert" className="mb-3 text-center text-sm font-medium text-red-700">{error}</p>
            )}
            <Button type="submit" loading={isLoading} className="w-full">
              {isLoading ? "Entrando..." : "Entrar"}
            </Button>
          </motion.div>
        </form>
      </motion.div>
    </main>
  );
}
