"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MapPin, Check } from "lucide-react";
import { ProductCard3D } from "@/components/products/ProductCard3D";
import type { StoreHotspot } from "@/lib/virtual-store/types";

interface Props {
  hotspot: StoreHotspot | null;
  onClose: () => void;
}

export function ProductHotspotModal({ hotspot, onClose }: Props) {
  const [selectedSizeIdx, setSelectedSizeIdx] = useState(0);

  if (!hotspot) return null;

  // Solo datos públicos: tallas con disponible sí/no, nunca SKU ni conteos (ER §2.7).
  const product = hotspot.product;
  const sizes = product?.sizes ?? [];
  const currentSize = sizes[selectedSizeIdx] ?? sizes[0];
  const price = product?.price ?? hotspot.price;
  const available = currentSize?.available ?? false;

  const codeText = product?.publicCode ? ` (código ${product.publicCode})` : "";
  const sizeText = currentSize ? `, talla ${currentSize.size}` : "";
  const waText = encodeURIComponent(
    `Hola LoloShop, vi "${hotspot.title}"${codeText}${sizeText} en el recorrido de la tienda. ¿Está disponible?`
  );
  const waLink = `https://wa.me/5211234567890?text=${waText}`;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        {/* Backdrop desenfocado */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/40 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-white/60 bg-white/95 p-6 shadow-2xl backdrop-blur-2xl"
        >
          {/* Botón cerrar */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-20 rounded-full bg-gray-100 p-2 text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition-colors"
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>

          {/* Ubicación física en la tienda */}
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 font-mono text-[11px] font-semibold text-primary">
              <MapPin size={12} />
              {hotspot.shelfLabel}
            </span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-600 font-medium">
              {hotspot.category}
            </span>
          </div>

          {/* Tarjeta 3D interactiva */}
          <div className="mb-4">
            <ProductCard3D
              title={hotspot.title}
              brand={hotspot.brand}
              imageUrl={hotspot.imageUrl ?? null}
              publicCode={product?.publicCode ?? null}
              price={price}
              waLink={waLink}
            />
          </div>

          {/* Selector de tallas */}
          {sizes.length > 1 && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <p className="mb-2 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Talla:
              </p>
              <div className="flex flex-wrap gap-2">
                {sizes.map((sz, i) => (
                  <button
                    key={sz.size}
                    onClick={() => setSelectedSizeIdx(i)}
                    aria-pressed={i === selectedSizeIdx}
                    className={`min-h-[44px] min-w-[44px] rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                      i === selectedSizeIdx
                        ? "border-primary bg-primary text-white shadow-sm"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {sz.size}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Disponibilidad: solo sí/no por talla */}
          <div className="mt-4 rounded-2xl bg-gray-50 p-3.5 border border-gray-100 text-xs text-gray-600">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-gray-800">Disponibilidad en tienda:</span>
              <span className={`inline-flex items-center gap-1 font-bold ${available ? "text-emerald-600" : "text-amber-600"}`}>
                {available && <Check size={13} />}
                {available ? "Disponible" : "Agotado en tienda"}
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              Escríbenos por WhatsApp con el código para confirmar talla y existencia.
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
