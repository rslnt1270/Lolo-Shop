"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Compass,
  Grid,
  Rotate3d,
  ShoppingBag,
  MapPin,
  Search,
  Sparkles,
  Layers,
  ArrowRight,
  Eye,
} from "lucide-react";
import type { PublicProduct } from "@/lib/data/public-projection";
import type { StoreHotspot, StoreZone } from "@/lib/virtual-store/types";
import { STORE_ZONES, bindProductsToHotspots } from "@/lib/virtual-store/zones";
import { VirtualStoreCanvas } from "./VirtualStoreCanvas";
import { StoreMinimap } from "./StoreMinimap";
import { ProductHotspotModal } from "./ProductHotspotModal";
import { CatalogDrawer } from "./CatalogDrawer";

interface Props {
  initialProducts: PublicProduct[];
  isLoggedIn: boolean;
}

export function VirtualStoreCatalog({ initialProducts, isLoggedIn }: Props) {
  const [viewMode, setViewMode] = useState<"tour" | "grid">("tour");
  const [currentZoneId, setCurrentZoneId] = useState<string>("entrada");
  const [cameraYaw, setCameraYaw] = useState<number>(0);
  const [cameraPitch, setCameraPitch] = useState<number>(-2);
  const [selectedHotspot, setSelectedHotspot] = useState<StoreHotspot | null>(null);
  const [isCatalogDrawerOpen, setIsCatalogDrawerOpen] = useState(false);

  // Mapear productos reales a los puntos espaciales de la tienda física
  const hotspots = bindProductsToHotspots(initialProducts);
  const currentZone = STORE_ZONES.find((z) => z.id === currentZoneId) || STORE_ZONES[0];

  // Cambiar de zona en la tienda con orientación inicial
  const handleSelectZone = (zoneId: string) => {
    const target = STORE_ZONES.find((z) => z.id === zoneId);
    if (!target) return;
    setCurrentZoneId(zoneId);
    setCameraYaw(target.initialYaw);
    setCameraPitch(target.initialPitch);
  };

  // Navegar a un producto específico desde el catálogo o buscador
  const handleSelectProduct = (hotspot: StoreHotspot) => {
    handleSelectZone(hotspot.zoneId);
    setCameraYaw(hotspot.yaw);
    setCameraPitch(hotspot.pitch);
    setSelectedHotspot(hotspot);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#111827] flex flex-col relative overflow-x-hidden selection:bg-loloteal/20">
      {/* Luces y degradados ambientales sutiles */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-[15%] -left-[10%] w-[55vw] h-[55vw] rounded-full bg-loloteal/10 blur-[130px] opacity-70 mix-blend-multiply" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-tertiary-container/15 blur-[140px] opacity-60 mix-blend-multiply" />
      </div>

      {/* Barra Superior Flotante (Glassmorphism) */}
      <header className="sticky top-4 z-40 mx-auto w-[calc(100%-32px)] max-w-6xl rounded-2xl border border-white/60 bg-white/75 p-3.5 shadow-xl backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/loloshop-logo.png"
              alt="LoloShop"
              className="h-9 w-9 rounded-full border border-gray-100 shadow-sm transition-transform group-hover:scale-105"
            />
            <div>
              <span className="font-extrabold text-base tracking-tight text-gray-900 block leading-tight">
                LoloShop
              </span>
              <span className="font-mono text-[10px] text-loloteal font-bold uppercase tracking-wider block">
                Tienda Virtual 3D
              </span>
            </div>
          </Link>
        </div>

        {/* Switcher de Vista: Recorrido 3D vs Cuadrícula */}
        <div className="flex items-center rounded-xl bg-gray-100/80 p-1 border border-gray-200/60 shadow-inner">
          <button
            onClick={() => setViewMode("tour")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              viewMode === "tour"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <Rotate3d size={14} className={viewMode === "tour" ? "text-loloteal" : ""} />
            <span className="hidden sm:inline">Recorrido 3D</span>
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              viewMode === "grid"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <Grid size={14} className={viewMode === "grid" ? "text-loloteal" : ""} />
            <span className="hidden sm:inline">Catálogo</span>
          </button>
        </div>

        {/* Acciones derecha */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCatalogDrawerOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-black px-3.5 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-gray-800 transition-all active:scale-95"
          >
            <ShoppingBag size={14} />
            <span className="hidden md:inline">Ver Productos</span>
            <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-mono">
              {hotspots.length}
            </span>
          </button>

          {isLoggedIn && (
            <Link
              href="/"
              className="rounded-full border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50 transition-colors"
              title="Ir al Dashboard"
            >
              <Compass size={16} />
            </Link>
          )}
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="relative z-10 mx-auto w-[calc(100%-32px)] max-w-6xl py-6 flex-1 flex flex-col">
        {viewMode === "tour" ? (
          /* MODO RECORRIDO VIRTUAL 3D DE LA TIENDA FÍSICA */
          <div className="space-y-4">
            {/* Selector Rápido de Zonas de la Tienda (Pills) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-xs font-mono text-gray-400 uppercase tracking-wider flex-none mr-1">
                Zonas:
              </span>
              {STORE_ZONES.map((zone) => {
                const isActive = zone.id === currentZoneId;
                return (
                  <button
                    key={zone.id}
                    onClick={() => handleSelectZone(zone.id)}
                    className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-all flex-none border ${
                      isActive
                        ? "border-loloteal bg-white text-gray-900 shadow-md ring-2 ring-loloteal/20"
                        : "border-gray-200/80 bg-white/60 text-gray-600 hover:bg-white hover:border-gray-300"
                    }`}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: isActive ? "#3cbfbf" : "#9ca3af" }}
                    />
                    {zone.name}
                  </button>
                );
              })}
            </div>

            {/* Lienzo 3D Inmersivo con Navegación Esférica y Hotspots */}
            <div className="relative">
              <VirtualStoreCanvas
                currentZone={currentZone}
                hotspots={hotspots}
                cameraYaw={cameraYaw}
                cameraPitch={cameraPitch}
                onCameraChange={(yaw, pitch) => {
                  setCameraYaw(yaw);
                  setCameraPitch(pitch);
                }}
                onSelectHotspot={(hs) => setSelectedHotspot(hs)}
                onNavigateToZone={handleSelectZone}
              />

              {/* Minimapa / Croquis Arquitectónico Interactivo */}
              <StoreMinimap
                zones={STORE_ZONES}
                currentZoneId={currentZoneId}
                cameraYaw={cameraYaw}
                onSelectZone={handleSelectZone}
              />
            </div>

            {/* Barra informativa inferior con productos en esta zona */}
            <div className="rounded-2xl border border-white/60 bg-white/80 p-4 shadow-sm backdrop-blur-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-xl bg-loloteal/10 p-2 text-loloteal">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-gray-900">
                      {currentZone.name}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Haz clic en los pines sobre las repisas para inspeccionar en 3D o apartar por WhatsApp.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsCatalogDrawerOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
                  >
                    <Search size={14} className="text-gray-400" />
                    Buscar en Tienda
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* MODO CUADRÍCULA DE CATÁLOGO */
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200/60 pb-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                  Catálogo de Productos
                </h1>
                <p className="text-xs text-gray-500">
                  Explora las prendas y accesorios en exhibición en nuestra sucursal.
                </p>
              </div>

              <button
                onClick={() => setViewMode("tour")}
                className="inline-flex items-center gap-2 rounded-full bg-loloteal px-4 py-2 text-xs font-bold text-white shadow-lg shadow-loloteal/30 hover:bg-[#147E7E] transition-all"
              >
                <Rotate3d size={16} />
                Ver en Recorrido 3D
              </button>
            </div>

            {/* Cuadrícula de Productos */}
            {hotspots.length === 0 && (
              <p className="rounded-3xl border border-white/60 bg-white/90 p-8 text-center text-sm text-gray-600">
                Pronto verás aquí las prendas de la tienda.
              </p>
            )}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {hotspots.map((hs) => (
                <motion.div
                  key={hs.id}
                  whileHover={{ y: -4 }}
                  className="group flex flex-col rounded-3xl border border-white/60 bg-white/90 p-4 shadow-xl backdrop-blur-xl transition-all"
                >
                  <div className="relative mb-3 flex h-48 w-full items-center justify-center overflow-hidden rounded-2xl bg-gray-50">
                    {hs.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={hs.imageUrl}
                        alt={hs.title}
                        className="h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <span className="text-5xl">🛍️</span>
                    )}

                    {/* Badge de ubicación física */}
                    <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur-md">
                      {hs.shelfLabel}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col justify-between">
                    <div>
                      <p className="text-[11px] font-mono uppercase tracking-wider text-loloteal font-bold">
                        {hs.brand}
                      </p>
                      <h3 className="font-bold text-gray-900 text-sm leading-snug mt-0.5">
                        {hs.title}
                      </h3>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-lg font-black text-gray-900">
                        ${hs.price}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleSelectProduct(hs)}
                          className="rounded-xl border border-gray-200 bg-gray-50 p-2 text-gray-600 hover:border-loloteal hover:bg-loloteal/10 hover:text-loloteal transition-all"
                          title="Ubicar en la tienda 3D"
                        >
                          <MapPin size={15} />
                        </button>
                        <button
                          onClick={() => setSelectedHotspot(hs)}
                          className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 transition-all"
                        >
                          Ver en 3D
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Modal / Ficha Técnica 3D del Producto Seleccionado */}
      <ProductHotspotModal
        hotspot={selectedHotspot}
        onClose={() => setSelectedHotspot(null)}
      />

      {/* Cajón Lateral del Catálogo Completo */}
      <CatalogDrawer
        isOpen={isCatalogDrawerOpen}
        onClose={() => setIsCatalogDrawerOpen(false)}
        hotspots={hotspots}
        onSelectProduct={handleSelectProduct}
      />
    </div>
  );
}
