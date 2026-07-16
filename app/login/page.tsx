"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
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
    const res = await signIn("credentials", { username, password, redirect: false });
    if (res?.error) {
      setError("Usuario o contraseña incorrectos");
      setIsLoading(false);
    } else {
      router.refresh(); // Fuerza a Next.js a leer las nuevas cookies de sesión
      router.push("/");
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#F9FAFB] p-6">
      <motion.div
        className="w-full max-w-sm rounded-[28px] bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[rgba(226,232,240,0.5)]"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants} className="flex flex-col items-center justify-center space-y-3 pb-8">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[#2DD4BF]/10">
            <img src="/loloshop-logo.png" alt="LoloShop Logo" className="h-14 w-14 drop-shadow-sm" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-[#18181B]">Bienvenido a LoloShop</h1>
            <p className="mt-1 text-sm text-[#71717A]">Inicia sesión para continuar</p>
          </div>
        </motion.div>
        
        <form onSubmit={onSubmit} className="space-y-5">
          <motion.div variants={itemVariants} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#71717A]">Usuario</label>
              <input 
                className="w-full rounded-xl border border-[rgba(226,232,240,0.5)] bg-[#F9FAFB] p-3.5 text-sm text-[#18181B] transition-colors focus:border-[#2DD4BF] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#2DD4BF]" 
                placeholder="Ingresa tu usuario"
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#71717A]">Contraseña</label>
              <input 
                className="w-full rounded-xl border border-[rgba(226,232,240,0.5)] bg-[#F9FAFB] p-3.5 text-sm text-[#18181B] transition-colors focus:border-[#2DD4BF] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#2DD4BF]" 
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
              <p className="mb-3 text-center text-sm font-medium text-red-500">{error}</p>
            )}
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="relative flex w-full items-center justify-center overflow-hidden rounded-xl bg-[#2DD4BF] p-3.5 font-semibold text-white shadow-sm transition-all hover:bg-[#25B5A3] disabled:opacity-70 disabled:hover:bg-[#2DD4BF]" 
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Entrando...
                </span>
              ) : (
                "Entrar"
              )}
            </motion.button>
          </motion.div>
        </form>
      </motion.div>
    </main>
  );
}
