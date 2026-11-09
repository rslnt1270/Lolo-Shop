"use client";

import React, { useState } from "react";
import { Search, X, MapPin, Eye, ShoppingBag } from "lucide-react";
import type { StoreHotspot } from "@/lib/virtual-store/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  hotspots: StoreHotspot[];
  onSelectProduct: (hotspot: StoreHotspot) => void;
}

export function CatalogDrawer({
  isOpen,
  onClose,
  hotspots,
  onSelectProduct,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Todas");

  if (!isOpen) return null;

  const categories = ["Todas", ...Array.from(new Set(hotspots.map((h) => h.category)))];

  const filteredHotspots = hotspots.filter((h) => {
    const matchesSearch =
      h.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.shelfLabel.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === "Todas" || h.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative z-10 w-full max-w-md h-full bg-white/95 backdrop-blur-2xl border-l border-white/60 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <div className="flex items-center gap-2">
            <ShoppingBag className="text-loloteal" size={20} />
            <h3 className="font-bold text-gray-900 text-lg">Catálogo de la Tienda</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            aria-label="Cerrar catálogo"
          >
            <X size={18} />
          </button>
        </div>

        {/* Buscador & Categorías */}
        <div className="p-4 border-b border-gray-100 space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Buscar prendas, calzado, accesorios..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50/70 py-2.5 pl-10 pr-4 text-xs text-gray-800 placeholder-gray-400 focus:border-loloteal focus:bg-white focus:outline-none focus:ring-1 focus:ring-loloteal"
            />
          </div>

          {/* Chips de categorías */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full px-3 py-1 font-medium whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? "bg-primary text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de Productos con su estante en la tienda física */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredHotspots.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-xs">
              No se encontraron productos para esta búsqueda.
            </div>
          ) : (
            filteredHotspots.map((h) => (
              <div
                key={h.id}
                onClick={() => {
                  onSelectProduct(h);
                  onClose();
                }}
                className="group flex items-center gap-3.5 p-3 rounded-2xl border border-gray-100 bg-white hover:border-loloteal/50 hover:shadow-lg transition-all cursor-pointer"
              >
                {/* Miniatura */}
                <div className="h-16 w-16 flex-none rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden border border-gray-100">
                  {h.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={h.imageUrl}
                      alt={h.title}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <span className="text-2xl">🛍️</span>
                  )}
                </div>

                {/* Detalles y ubicación física */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-loloteal">
                    <MapPin size={10} />
                    <span className="truncate">{h.shelfLabel}</span>
                  </div>
                  <h4 className="font-bold text-gray-900 text-xs truncate group-hover:text-loloteal transition-colors">
                    {h.title}
                  </h4>
                  <p className="text-[11px] text-gray-500">{h.brand}</p>
                  <p className="font-extrabold text-gray-900 text-sm mt-0.5">
                    ${h.price}
                  </p>
                </div>

                {/* Botón flotante para ver en 3D */}
                <div className="flex-none opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-loloteal bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
                    <Eye size={12} /> Ver en 3D
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
