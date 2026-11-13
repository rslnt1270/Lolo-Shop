"use client";

import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform, useMotionTemplate, useReducedMotion } from "framer-motion";
import { formatPrice } from "@/lib/public/format";

interface Props {
  title: string;
  brand: string;
  imageUrl: string | null;
  /** Código público para pedir por WhatsApp; nunca el SKU interno. */
  publicCode: string | null;
  price: number | null;
  /** Enlace a WhatsApp; null si no hay número válido configurado. */
  waLink: string | null;
  /** `id` del título, para que el diálogo que lo contiene se nombre con él. */
  titleId?: string;
}

export function ProductCard3D({ title, brand, imageUrl, publicCode, price, waLink, titleId }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x, { stiffness: 300, damping: 30 });
  const mouseYSpring = useSpring(y, { stiffness: 300, damping: 30 });

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["17.5deg", "-17.5deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-17.5deg", "17.5deg"]);

  const glareX = useTransform(mouseXSpring, [-0.5, 0.5], ["0%", "100%"]);
  const glareY = useTransform(mouseYSpring, [-0.5, 0.5], ["0%", "100%"]);

  const glareBackground = useMotionTemplate`radial-gradient(circle at ${glareX} ${glareY}, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 60%)`;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>) => {
    // Con movimiento reducido no hay inclinación por puntero (ni ratón ni toque).
    if (reduceMotion || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <div style={{ perspective: 1200 }} className="w-full">
      <motion.div
        ref={ref}
        data-testid="product-card-3d"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onPointerDown={handleMouseMove} // Soporte para toque en móvil
        onPointerUp={handleMouseLeave}
        style={reduceMotion ? undefined : { rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="group relative w-full rounded-2xl bg-white shadow-2xl border border-gray-100 flex flex-col cursor-pointer"
        initial={reduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.5 }}
      >
        {/* Efecto de Luz (Glare) Dinámico */}
        <motion.div
          className="absolute inset-0 pointer-events-none rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-50 mix-blend-overlay"
          style={{ background: glareBackground }}
        />
        
        {/* Contenedor Superior (Imagen simulada) */}
        <div 
          className="relative aspect-w-1 aspect-h-1 w-full bg-gradient-to-br from-gray-100 to-gray-50 p-8 h-64 rounded-t-2xl overflow-hidden flex items-center justify-center"
          style={reduceMotion ? undefined : { transform: "translateZ(60px)" }}
        >
          <motion.div
            animate={reduceMotion ? { y: 0 } : { y: [0, -10, 0] }}
            transition={reduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 4, ease: "easeInOut" }}
            className="text-center"
          >
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={title} className="w-full h-full object-contain drop-shadow-2xl" />
            ) : (
              <>
                <span className="block text-6xl mb-4 drop-shadow-lg">👕</span>
                <span className="text-sm font-bold text-gray-400 tracking-widest uppercase">{brand}</span>
              </>
            )}
          </motion.div>
        </div>
        
        {/* Datos del producto */}
        <div className="p-5 flex flex-col flex-grow bg-white rounded-b-2xl" style={reduceMotion ? undefined : { transform: "translateZ(30px)" }}>
          <h3 id={titleId} className="text-xl font-bold text-gray-900 leading-tight mb-2">
            {title}
          </h3>
          {publicCode && (
            <p className="text-xs font-mono text-gray-500 mb-4 bg-gray-50 inline-block px-2 py-1 rounded w-max border border-gray-100">
              Código {publicCode}
            </p>
          )}

          <div className="mt-auto flex flex-col gap-3 border-t border-gray-50 pt-4" style={reduceMotion ? undefined : { transform: "translateZ(40px)" }}>
            {price !== null && <p className="text-2xl font-black text-gray-900">{formatPrice(price)}</p>}

            {waLink ? (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-turquesa px-4 text-base font-semibold text-tinta shadow-sm transition-colors active:brightness-95"
                onClick={(e) => e.stopPropagation()}
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
                Consultar por WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
