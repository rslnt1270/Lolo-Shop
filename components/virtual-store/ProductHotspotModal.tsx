"use client";

import React, { useId, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { X, MapPin, Check } from "lucide-react";
import { ProductCard3D } from "@/components/products/ProductCard3D";
import type { PublicProduct } from "@/lib/data/public-projection";
import { useDialog } from "./useDialog";
import { getWhatsAppNumber, productInquiryMessage, whatsAppLink } from "@/lib/public/whatsapp";

interface Props {
  product: PublicProduct | null;
  /** Solo en el recorrido de prueba; en el catálogo público no se pasa. */
  shelfLabel?: string;
  onClose: () => void;
}

export function ProductHotspotModal({ product, shelfLabel, onClose }: Props) {
  if (!product) return null;
  // Con `key` la talla elegida se reinicia al cambiar de producto.
  return <ModalBody key={product.id} product={product} shelfLabel={shelfLabel} onClose={onClose} />;
}

function ModalBody({ product, shelfLabel, onClose }: { product: PublicProduct; shelfLabel?: string; onClose: () => void }) {
  // Solo datos públicos: tallas con disponible sí/no, nunca SKU ni conteos (ER §2.7).
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const titleId = useId();
  const reduceMotion = useReducedMotion();
  const sizes = product.sizes;
  const firstAvailable = sizes.findIndex((s) => s.available);
  const [selectedSizeIdx, setSelectedSizeIdx] = useState(firstAvailable >= 0 ? firstAvailable : 0);
  const currentSize = sizes[selectedSizeIdx];
  const available = currentSize?.available ?? false;

  const number = getWhatsAppNumber();
  const waLink = number ? whatsAppLink(number, productInquiryMessage(product, currentSize?.size)) : null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
    >
      <div onClick={onClose} className="absolute inset-0 bg-black/40" aria-hidden="true" />

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.25 }}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/60 bg-white p-6 shadow-2xl sm:rounded-3xl"
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900"
          aria-label="Cerrar modal"
        >
          <X size={18} aria-hidden="true" />
        </button>

        {shelfLabel && (
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 font-mono text-[11px] font-semibold text-primary">
              <MapPin size={12} aria-hidden="true" />
              {shelfLabel}
            </span>
          </div>
        )}

        <div className="mb-4">
          <ProductCard3D
            title={product.title}
            brand={product.brand}
            imageUrl={product.imageUrl}
            publicCode={product.publicCode}
            price={currentSize?.price ?? product.price}
            waLink={waLink}
            titleId={titleId}
          />
        </div>

        {sizes.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-600">Talla:</p>
            <div className="flex flex-wrap gap-2.5">
              {sizes.map((sz, i) => (
                <button
                  key={sz.size}
                  onClick={() => setSelectedSizeIdx(i)}
                  aria-pressed={i === selectedSizeIdx}
                  aria-label={sz.available ? sz.size : `${sz.size}, agotada`}
                  className={`min-h-[48px] min-w-[48px] rounded-xl border px-3 py-1.5 font-mono text-sm font-medium transition-all ${
                    i === selectedSizeIdx
                      ? "border-loloteal bg-loloteal text-white shadow-sm"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                  } ${sz.available ? "" : "line-through decoration-2 opacity-60"}`}
                >
                  {sz.size}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">Tachada = agotada</p>
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-3.5 text-xs text-gray-600">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-800">Disponibilidad en tienda:</span>
            <span className={`inline-flex items-center gap-1 font-bold ${available ? "text-emerald-700" : "text-[#9A3B2E]"}`}>
              {available && <Check size={13} aria-hidden="true" />}
              {available ? "Disponible" : "Agotado en tienda"}
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
