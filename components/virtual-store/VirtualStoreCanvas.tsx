"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Compass,
  ArrowRight,
  Maximize2,
  Minimize2,
  RotateCw,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  Eye,
} from "lucide-react";
import type { StoreHotspot, StoreZone, ZoneConnection } from "@/lib/virtual-store/types";
import { projectSphericalToScreen } from "@/lib/virtual-store/projection";

interface Props {
  currentZone: StoreZone;
  hotspots: StoreHotspot[];
  cameraYaw: number;
  cameraPitch: number;
  onCameraChange: (yaw: number, pitch: number) => void;
  onSelectHotspot: (hotspot: StoreHotspot) => void;
  onNavigateToZone: (targetZoneId: string) => void;
}

export function VirtualStoreCanvas({
  currentZone,
  hotspots,
  cameraYaw,
  cameraPitch,
  onCameraChange,
  onSelectHotspot,
  onNavigateToZone,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1000, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredHotspotId, setHoveredHotspotId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Referencias para arrastre
  const dragStartRef = useRef({ x: 0, y: 0, yaw: cameraYaw, pitch: cameraPitch });

  // Actualizar dimensiones del contenedor
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Manejo de arrastre (Mouse y Touch)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Si se hizo clic en un hotspot o botón interactivo, no iniciar drag
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest(".interactive-hotspot")) {
      return;
    }
    setIsDragging(true);
    setHasInteracted(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      yaw: cameraYaw,
      pitch: cameraPitch,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;

      // Sensibilidad de rotación
      const sensitivity = 0.22;
      const newYaw = dragStartRef.current.yaw - dx * sensitivity;
      const newPitch = Math.max(-32, Math.min(32, dragStartRef.current.pitch + dy * sensitivity));

      onCameraChange(newYaw, newPitch);
    },
    [isDragging, onCameraChange]
  );

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        // Ignorar si no estaba capturado
      }
    }
  };

  // Rotación rápida mediante botones
  const rotateBy = (deltaYaw: number) => {
    setHasInteracted(true);
    onCameraChange(cameraYaw + deltaYaw, cameraPitch);
  };

  // Toggle de pantalla completa
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const fov = 75; // Campo de visión angular horizontal

  // Filtrar hotspots de la zona actual y proyectarlos a pantalla
  const zoneHotspots = hotspots.filter((h) => h.zoneId === currentZone.id);
  const projectedHotspots = zoneHotspots.map((hs) => {
    const proj = projectSphericalToScreen(
      hs.yaw,
      hs.pitch,
      cameraYaw,
      cameraPitch,
      fov,
      dimensions.width,
      dimensions.height
    );
    return { hotspot: hs, proj };
  });

  // Proyectar conexiones con otras zonas (flechas en piso)
  const projectedConnections = currentZone.connections.map((conn) => {
    const proj = projectSphericalToScreen(
      conn.yaw,
      conn.pitch,
      cameraYaw,
      cameraPitch,
      fov,
      dimensions.width,
      dimensions.height
    );
    return { connection: conn, proj };
  });

  // Desplazamiento de fondo para efecto de perspectiva arquitectónica
  const bgShiftX = (cameraYaw * 3.5) % dimensions.width;
  const bgShiftY = cameraPitch * 3;

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`relative w-full h-[65vh] min-h-[480px] max-h-[750px] overflow-hidden rounded-3xl border border-white/50 bg-[#0f171c] select-none touch-none shadow-2xl transition-all ${
        isDragging ? "cursor-grabbing" : "cursor-grab"
      }`}
    >
      {/* 1. Fondo de la Escena Arquitectónica 3D de la Tienda Física */}
      <div
        className="absolute inset-0 pointer-events-none transition-transform duration-75 ease-out"
        style={{
          transform: `translate3d(${-bgShiftX * 0.15}px, ${bgShiftY * 0.25}px, 0)`,
        }}
      >
        {/* Iluminación volumétrica ambiental según la zona */}
        <div
          className="absolute -top-[20%] left-[20%] w-[60vw] h-[60vw] rounded-full blur-[140px] opacity-40 mix-blend-screen"
          style={{ backgroundColor: currentZone.accentColor }}
        />
        <div
          className="absolute bottom-[-10%] right-[10%] w-[50vw] h-[50vw] rounded-full blur-[120px] opacity-25 mix-blend-screen"
          style={{ backgroundColor: "#3cbfbf" }}
        />

        {/* Rejilla arquitectónica del suelo y techo */}
        <svg className="absolute inset-0 w-full h-full opacity-30" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="floor-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f171c" stopOpacity="0.1" />
              <stop offset="60%" stopColor="#3cbfbf" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#0f171c" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          {/* Líneas de fuga del suelo */}
          <line x1="10%" y1="95%" x2="45%" y2="52%" stroke="#3cbfbf" strokeWidth="0.8" opacity="0.3" />
          <line x1="25%" y1="95%" x2="48%" y2="52%" stroke="#3cbfbf" strokeWidth="0.8" opacity="0.3" />
          <line x1="50%" y1="95%" x2="50%" y2="52%" stroke="#3cbfbf" strokeWidth="1" opacity="0.4" />
          <line x1="75%" y1="95%" x2="52%" y2="52%" stroke="#3cbfbf" strokeWidth="0.8" opacity="0.3" />
          <line x1="90%" y1="95%" x2="55%" y2="52%" stroke="#3cbfbf" strokeWidth="0.8" opacity="0.3" />
        </svg>

        {/* Siluetas de mobiliario arquitectónico según la zona */}
        <div className="absolute inset-0 flex items-center justify-center opacity-85">
          {currentZone.id === "entrada" && (
            <div className="relative w-full h-full flex items-center justify-center">
              {/* Maniquí / Vitrina */}
              <div className="w-48 h-80 rounded-2xl bg-gradient-to-t from-gray-900 via-gray-800/80 to-teal-950/40 border border-teal-500/20 shadow-2xl flex flex-col items-center justify-between p-4 backdrop-blur-sm">
                <span className="text-[10px] font-mono tracking-widest text-teal-300 uppercase">
                  Vitrina Principal
                </span>
                <div className="w-24 h-24 rounded-full bg-teal-400/10 border border-teal-300/30 flex items-center justify-center animate-pulse">
                  <Sparkles className="text-teal-300" size={32} />
                </div>
                <span className="text-[11px] font-medium text-gray-300 text-center">
                  Novedades
                </span>
              </div>
            </div>
          )}

          {currentZone.id === "percheros" && (
            <div className="relative w-full h-full flex items-center justify-around px-12">
              {/* Perchero Izquierdo */}
              <div className="w-44 h-72 rounded-xl bg-gradient-to-t from-gray-950 to-gray-800/60 border border-white/10 flex flex-col justify-between p-4 shadow-xl">
                <span className="text-[10px] font-mono text-gray-400">Riel A · Hoodies</span>
                <div className="space-y-1.5 opacity-60">
                  <div className="h-2 w-full bg-white/20 rounded"></div>
                  <div className="h-2 w-3/4 bg-white/20 rounded"></div>
                  <div className="h-2 w-4/5 bg-white/20 rounded"></div>
                </div>
                <span className="text-[10px] text-teal-400">Streetwear Drop</span>
              </div>
              {/* Perchero Derecho */}
              <div className="w-44 h-72 rounded-xl bg-gradient-to-t from-gray-950 to-gray-800/60 border border-white/10 flex flex-col justify-between p-4 shadow-xl">
                <span className="text-[10px] font-mono text-gray-400">Riel B · Playeras</span>
                <div className="space-y-1.5 opacity-60">
                  <div className="h-2 w-full bg-white/20 rounded"></div>
                  <div className="h-2 w-2/3 bg-white/20 rounded"></div>
                </div>
                <span className="text-[10px] text-teal-400">Algodón Heavy</span>
              </div>
            </div>
          )}

          {currentZone.id === "calzado" && (
            <div className="relative w-full h-full flex items-center justify-center">
              {/* Estantería modular de calzado */}
              <div className="w-96 h-80 rounded-2xl bg-gradient-to-t from-gray-950 via-gray-900 to-amber-950/30 border border-orange-500/20 p-6 flex flex-col justify-between shadow-2xl">
                <div className="flex justify-between items-center border-b border-orange-500/20 pb-2">
                  <span className="text-[11px] font-mono uppercase text-orange-300">Sneaker Wall</span>
                  <span className="text-[10px] text-gray-400">Edición Limitada</span>
                </div>
                {/* Repisas con pares */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-16 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs text-gray-300">
                    👟 Sneaker Retro
                  </div>
                  <div className="h-16 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs text-gray-300">
                    👟 Runner Monocromo
                  </div>
                </div>
                <span className="text-[10px] text-center text-orange-400/80">
                  Repisas iluminadas con LED cálido
                </span>
              </div>
            </div>
          )}

          {currentZone.id === "caja" && (
            <div className="relative w-full h-full flex items-center justify-center">
              {/* Mostrador / Caja */}
              <div className="w-96 h-72 rounded-2xl bg-gradient-to-t from-gray-950 via-gray-900 to-cyan-950/40 border border-cyan-500/20 p-6 flex flex-col justify-between shadow-2xl">
                <div className="flex justify-between items-center border-b border-cyan-500/20 pb-2">
                  <span className="text-[11px] font-mono uppercase text-cyan-300">Mostrador & POS</span>
                  <span className="text-[10px] text-emerald-400">Punto de Entrega</span>
                </div>
                <div className="flex items-center justify-around py-4">
                  <div className="text-center">
                    <span className="block text-2xl">🧢</span>
                    <span className="text-[10px] text-gray-400">Gorras</span>
                  </div>
                  <div className="text-center">
                    <span className="block text-2xl">💳</span>
                    <span className="text-[10px] text-gray-400">Terminal</span>
                  </div>
                  <div className="text-center">
                    <span className="block text-2xl">👜</span>
                    <span className="text-[10px] text-gray-400">Accesorios</span>
                  </div>
                </div>
                <span className="text-[10px] text-center text-cyan-400/80">
                  Mostrador de la tienda
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Puntos de Conexión en el Suelo (Waypoints para Caminar entre Zonas) */}
      {projectedConnections.map(({ connection, proj }) => {
        if (!proj.visible) return null;
        return (
          <div
            key={connection.targetZoneId}
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform duration-200 hover:scale-110 active:scale-95"
            style={{ left: `${proj.x}px`, top: `${proj.y}px` }}
            onClick={(e) => {
              e.stopPropagation();
              onNavigateToZone(connection.targetZoneId);
            }}
          >
            <div className="flex flex-col items-center group">
              {/* Aro animado de piso */}
              <div className="relative flex items-center justify-center w-12 h-12 rounded-full bg-loloteal/20 border-2 border-loloteal backdrop-blur-md shadow-lg shadow-loloteal/30 group-hover:bg-loloteal group-hover:text-white transition-all">
                <div className="absolute inset-0 rounded-full border border-loloteal animate-ping opacity-40"></div>
                <ArrowRight size={20} className="text-white transform group-hover:translate-x-0.5 transition-transform" />
              </div>
              {/* Etiqueta flotante */}
              <div className="mt-1.5 rounded-full bg-black/80 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-md border border-white/20 shadow-md whitespace-nowrap">
                {connection.label}
              </div>
            </div>
          </div>
        );
      })}

      {/* 3. Puntos Interactivos (Hotspots de Productos) */}
      {projectedHotspots.map(({ hotspot, proj }) => {
        if (!proj.visible) return null;
        const isHovered = hoveredHotspotId === hotspot.id;

        return (
          <div
            key={hotspot.id}
            className="interactive-hotspot absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-all duration-150"
            style={{
              left: `${proj.x}px`,
              top: `${proj.y}px`,
              transform: `translate(-50%, -50%) scale(${proj.scale})`,
            }}
            onMouseEnter={() => setHoveredHotspotId(hotspot.id)}
            onMouseLeave={() => setHoveredHotspotId(null)}
            onClick={(e) => {
              e.stopPropagation();
              onSelectHotspot(hotspot);
            }}
          >
            {/* Pin pulsante */}
            <div className="relative flex items-center justify-center cursor-pointer group">
              <span className="absolute w-8 h-8 rounded-full bg-primary-fixed/40 animate-ping"></span>
              <div className="relative flex items-center justify-center w-9 h-9 rounded-full bg-white text-gray-900 shadow-xl border-2 border-loloteal transition-transform duration-200 group-hover:scale-125">
                <ShoppingBag size={15} className="text-loloteal" />
              </div>

              {/* Tag con precio y título */}
              <div className="ml-2 hidden sm:flex items-center gap-1.5 rounded-full bg-white/95 backdrop-blur-md px-3 py-1 shadow-lg border border-gray-100 text-xs font-semibold text-gray-900 whitespace-nowrap">
                <span>{hotspot.title}</span>
                <span className="text-loloteal font-bold">${hotspot.price}</span>
              </div>
            </div>

            {/* Tooltip con preview flotante al hacer hover o clic */}
            {isHovered && (
              <div
                className="absolute bottom-full left-1/2 mb-3 -translate-x-1/2 w-52 rounded-2xl bg-white p-3 shadow-2xl border border-gray-100 backdrop-blur-xl z-30 animate-fadeIn cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectHotspot(hotspot);
                }}
              >
                {hotspot.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={hotspot.imageUrl}
                    alt={hotspot.title}
                    className="h-24 w-full rounded-xl object-contain bg-gray-50 mb-2"
                  />
                ) : (
                  <div className="h-20 w-full rounded-xl bg-gray-50 flex items-center justify-center text-3xl mb-2">
                    🛍️
                  </div>
                )}
                <p className="text-xs font-bold text-gray-900 leading-tight mb-1 truncate">
                  {hotspot.title}
                </p>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-primary">${hotspot.price}</span>
                  <span className="flex items-center gap-1 text-loloteal font-medium">
                    <Eye size={12} /> Ver en 3D
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* 4. Overlay de Información de la Zona (Esquina Superior Izquierda) */}
      <div className="absolute top-5 left-5 z-20 pointer-events-none">
        <div className="rounded-2xl border border-white/20 bg-black/60 px-4 py-2.5 backdrop-blur-xl text-white shadow-xl">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-loloteal animate-pulse"></span>
            <span className="text-xs font-mono uppercase tracking-wider text-teal-300">
              Recorrido Virtual
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-bold tracking-tight">
            {currentZone.name}
          </h2>
          <p className="text-[11px] text-gray-300 max-w-xs mt-0.5 line-clamp-1">
            {currentZone.description}
          </p>
        </div>
      </div>

      {/* 5. Controles de Cámara HUD (Esquina Superior Derecha) */}
      <div className="absolute top-5 right-5 z-20 flex items-center gap-2">
        <button
          onClick={() => rotateBy(-45)}
          className="rounded-full border border-white/20 bg-black/50 p-2.5 text-white backdrop-blur-md hover:bg-black/80 transition-all active:scale-95 shadow-lg"
          title="Girar a la izquierda"
          aria-label="Girar izquierda"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={() => rotateBy(45)}
          className="rounded-full border border-white/20 bg-black/50 p-2.5 text-white backdrop-blur-md hover:bg-black/80 transition-all active:scale-95 shadow-lg"
          title="Girar a la derecha"
          aria-label="Girar derecha"
        >
          <ChevronRight size={16} />
        </button>
        <button
          onClick={toggleFullscreen}
          className="rounded-full border border-white/20 bg-black/50 p-2.5 text-white backdrop-blur-md hover:bg-black/80 transition-all active:scale-95 shadow-lg"
          title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      {/* 6. Indicador / Pista de Arrastre para Primeros Usuarios */}
      {!hasInteracted && (
        <div className="absolute bottom-6 right-6 z-20 pointer-events-none animate-bounce">
          <div className="rounded-full bg-white/90 border border-white px-3.5 py-1.5 text-xs font-semibold text-gray-800 shadow-xl backdrop-blur-md flex items-center gap-1.5">
            <RotateCw size={13} className="text-loloteal animate-spin-slow" />
            <span>Arrastra para mirar 360°</span>
          </div>
        </div>
      )}
    </div>
  );
}
