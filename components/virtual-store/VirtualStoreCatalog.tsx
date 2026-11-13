"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Compass,
  Grid,
  Rotate3d,
  ShoppingBag,
  Search,
  Sparkles,
} from "lucide-react";
import type { PublicProduct } from "@/lib/data/public-projection";
import type { StoreHotspot, StoreZone } from "@/lib/virtual-store/types";
import { STORE_ZONES, bindProductsToHotspots } from "@/lib/virtual-store/zones";
import { CATALOG_ERROR_TEXT, EMPTY_CATALOG_TEXT } from "@/lib/public/whatsapp";
import { isTourEnabled } from "@/lib/public/tour-flag";
import { VirtualStoreCanvas } from "./VirtualStoreCanvas";
import { StoreMinimap } from "./StoreMinimap";
import { ProductHotspotModal } from "./ProductHotspotModal";
import { PALETTE } from "./palette";
import { CatalogDrawer } from "./CatalogDrawer";
import { CatalogGrid } from "./CatalogGrid";
import { DepartmentChips, departmentsOf } from "./DepartmentChips";

/** Tarjetas por página; "Ver más" suma otras tantas. */
const PAGE_SIZE = 24;

interface Props {
  initialProducts: PublicProduct[];
  isLoggedIn: boolean;
  /** La carga del servidor falló: aviso de error en lugar del texto de catálogo vacío. */
  loadError?: boolean;
}

export function VirtualStoreCatalog({ initialProducts, isLoggedIn, loadError = false }: Props) {
  const [viewMode, setViewMode] = useState<"tour" | "grid">("grid");
  const [currentZoneId, setCurrentZoneId] = useState<string>("entrada");
  const [cameraYaw, setCameraYaw] = useState<number>(0);
  const [cameraPitch, setCameraPitch] = useState<number>(-2);
  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(null);
  const [selectedShelf, setSelectedShelf] = useState<string | undefined>(undefined);
  const [isCatalogDrawerOpen, setIsCatalogDrawerOpen] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const departments = useMemo(() => departmentsOf(initialProducts), [initialProducts]);
  // Un ?depto sin productos públicos equivale a "Todo".
  const urlDepto = searchParams.get("depto");
  const urlSlug = departments.some((d) => d.slug === urlDepto) ? urlDepto : null;
  const [deptoSlug, setDeptoSlug] = useState<string | null>(urlSlug);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setDeptoSlug(urlSlug);
    setVisibleCount(PAGE_SIZE);
  }, [urlSlug]);

  const handleSelectDepto = (slug: string | null) => {
    setDeptoSlug(slug);
    setVisibleCount(PAGE_SIZE);
    router.replace(slug ? `${pathname}?depto=${encodeURIComponent(slug)}` : pathname, { scroll: false });
  };

  const tourEnabled = isTourEnabled(STORE_ZONES);
  const showTour = tourEnabled && viewMode === "tour";

  // Mapear productos reales a los puntos espaciales de la tienda física
  const hotspots = bindProductsToHotspots(initialProducts);
  // El orden ya viene de la fuente (createdAt desc, id asc): filtrar y recortar lo conserva sin repetidos ni huecos.
  const products = deptoSlug ? initialProducts.filter((p) => p.department?.slug === deptoSlug) : initialProducts;
  const shown = products.slice(0, visibleCount);
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
    openHotspot(hotspot);
  };

  // En el recorrido, el modal lleva la etiqueta de repisa; en el catálogo público, no.
  const openHotspot = (hotspot: StoreHotspot) => {
    if (!hotspot.product) return;
    setSelectedProduct(hotspot.product);
    setSelectedShelf(hotspot.shelfLabel);
  };

  const openProduct = (p: PublicProduct) => {
    setSelectedProduct(p);
    setSelectedShelf(undefined);
  };

  // Enlace desde /favoritos: /catalogo#p-<id> abre la ficha de esa prenda (solo si sigue en la lista pública).
  useEffect(() => {
    const m = /^#p-(.+)$/.exec(window.location.hash);
    if (!m) return;
    const found = initialProducts.find((p) => p.id === m[1]);
    if (found) {
      setSelectedProduct(found);
      setSelectedShelf(undefined);
    }
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-pantalla bg-white text-tinta flex flex-col relative overflow-x-hidden selection:bg-turquesa/20">
      {/* Luces y degradados ambientales sutiles */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-[15%] -left-[10%] w-[55vw] h-[55vw] rounded-full bg-turquesa/10 blur-[130px] opacity-70 mix-blend-multiply" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-tertiary-container/15 blur-[140px] opacity-60 mix-blend-multiply" />
      </div>

      {/* Barra Superior Flotante (Glassmorphism) */}
      <header className="sticky top-4 z-40 mx-auto w-[calc(100%-32px)] max-w-6xl rounded-2xl border border-white/60 bg-white/75 p-3.5 shadow-xl backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex min-h-11 items-center gap-2 group">
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
              {tourEnabled && (
                <span className="font-mono text-[10px] text-turquesa-texto font-bold uppercase tracking-wider block">
                  Tienda Virtual 3D
                </span>
              )}
            </div>
          </Link>
        </div>

        {/* Switcher de Vista: solo con el recorrido de prueba habilitado */}
        {tourEnabled && (
        <div className="flex items-center rounded-xl bg-gray-100/80 p-1 border border-gray-200/60 shadow-inner">
          <button
            onClick={() => setViewMode("tour")}
            aria-label="Recorrido 3D"
            className={`flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              viewMode === "tour"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <Rotate3d aria-hidden="true" size={14} className={viewMode === "tour" ? "text-turquesa-texto" : ""} />
            <span className="hidden sm:inline">Recorrido 3D</span>
          </button>
          <button
            onClick={() => setViewMode("grid")}
            aria-label="Catálogo"
            className={`flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              viewMode === "grid"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <Grid aria-hidden="true" size={14} className={viewMode === "grid" ? "text-turquesa-texto" : ""} />
            <span className="hidden sm:inline">Catálogo</span>
          </button>
        </div>
        )}

        {/* Acciones derecha */}
        <div className="flex items-center gap-2">
          {tourEnabled && (
          <button
            onClick={() => setIsCatalogDrawerOpen(true)}
            aria-label="Ver productos"
            className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full bg-black px-3.5 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-gray-800 transition-all active:scale-95"
          >
            <ShoppingBag size={14} />
            <span className="hidden md:inline">Ver Productos</span>
            <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-mono">
              {hotspots.length}
            </span>
          </button>
          )}

          {isLoggedIn && (
            <Link
              href="/"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50"
              aria-label="Ir al panel"
              title="Ir al panel"
            >
              <Compass size={16} aria-hidden="true" />
            </Link>
          )}
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="relative z-10 mx-auto w-[calc(100%-32px)] max-w-6xl py-6 flex-1 flex flex-col">
        {showTour ? (
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
                    className={`flex min-h-11 items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-all flex-none border ${
                      isActive
                        ? "border-turquesa-texto bg-white text-gray-900 shadow-md ring-2 ring-turquesa-texto/20"
                        : "border-gray-200/80 bg-white/60 text-gray-600 hover:bg-white hover:border-gray-300"
                    }`}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: isActive ? PALETTE.turquesa : PALETTE.borde }}
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
                onSelectHotspot={openHotspot}
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
                  <div className="rounded-xl bg-turquesa/10 p-2 text-turquesa-texto">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-gray-900">
                      {currentZone.name}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Haz clic en los pines sobre las repisas para inspeccionar cada prenda.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsCatalogDrawerOpen(true)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
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
                  Prendas disponibles en tienda.
                </p>
              </div>

              {tourEnabled && (
                <button
                  onClick={() => setViewMode("tour")}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-turquesa px-4 py-2 text-xs font-bold text-tinta shadow-lg shadow-turquesa/30 transition-all active:brightness-95"
                >
                  <Rotate3d size={16} />
                  Ver en Recorrido 3D
                </button>
              )}
            </div>

            {initialProducts.length > 0 && (
              <DepartmentChips departments={departments} selected={deptoSlug} onSelect={handleSelectDepto} />
            )}

            {loadError && products.length === 0 ? (
              <p role="alert" className="rounded-3xl border border-white/60 bg-white/90 p-8 text-center text-sm text-gray-700">
                {CATALOG_ERROR_TEXT}
              </p>
            ) : products.length === 0 ? (
              <p className="rounded-3xl border border-white/60 bg-white/90 p-8 text-center text-sm text-gray-600">
                {EMPTY_CATALOG_TEXT}
              </p>
            ) : (
              <>
                <CatalogGrid products={shown} onSelect={openProduct} />
                {shown.length < products.length && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                      className="min-h-[44px] rounded-full bg-turquesa px-6 text-sm font-bold text-tinta transition-colors active:brightness-95 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-turquesa-texto"
                    >
                      Ver más
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Modal / Ficha Técnica 3D del Producto Seleccionado */}
      <ProductHotspotModal
        key={selectedProduct?.id ?? "sin-producto"}
        product={selectedProduct}
        shelfLabel={selectedShelf}
        onClose={() => setSelectedProduct(null)}
      />

      {/* Cajón Lateral del Catálogo Completo */}
      {tourEnabled && (
        <CatalogDrawer
          isOpen={isCatalogDrawerOpen}
          onClose={() => setIsCatalogDrawerOpen(false)}
          hotspots={hotspots}
          onSelectProduct={handleSelectProduct}
        />
      )}
    </div>
  );
}
