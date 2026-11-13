"use client";

import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait">
      {/* Sin min-h de pantalla completa: sumado al encabezado y al hueco de la
          barra inferior obligaba a deslizar en el celular aunque la página
          fuera corta. Las pantallas que lo necesitan usan .min-h-pantalla. */}
      <motion.div
        key={pathname}
        initial={false}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="flex flex-col"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
