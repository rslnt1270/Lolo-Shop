"use client";

import React, { useState } from "react";
import { Compass, MapPin, Maximize2, Minimize2 } from "lucide-react";
import { PALETTE } from "./palette";
import type { StoreZone } from "@/lib/virtual-store/types";

interface Props {
  zones: StoreZone[];
  currentZoneId: string;
  cameraYaw: number;
  onSelectZone: (zoneId: string) => void;
}

export function StoreMinimap({
  zones,
  currentZoneId,
  cameraYaw,
  onSelectZone,
}: Props) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const currentZone = zones.find((z) => z.id === currentZoneId) || zones[0];

  // Cálculo del cono de visión (radar) en el minimapa (90 grados de apertura)
  const radarAngleRad = ((cameraYaw - 90) * Math.PI) / 180;
  const radarLength = 28;
  const halfFov = (35 * Math.PI) / 180;

  const leftAngle = radarAngleRad - halfFov;
  const rightAngle = radarAngleRad + halfFov;

  const x1 = currentZone.mapCoords.x + Math.cos(leftAngle) * (radarLength * 0.7);
  const y1 = currentZone.mapCoords.y + Math.sin(leftAngle) * radarLength;
  const x2 = currentZone.mapCoords.x + Math.cos(rightAngle) * (radarLength * 0.7);
  const y2 = currentZone.mapCoords.y + Math.sin(rightAngle) * radarLength;

  return (
    <div className="absolute bottom-5 left-5 z-30 select-none">
      <div className="overflow-hidden rounded-2xl border border-white/40 bg-white/70 shadow-2xl backdrop-blur-xl transition-all duration-300">
        {/* Header con botón para colapsar */}
        <div className="flex items-center justify-between border-b border-black/5 px-3 py-2 text-xs font-semibold text-gray-800">
          <div className="flex items-center gap-1.5">
            <Compass size={14} className="text-turquesa-texto animate-spin-slow" />
            <span>Croquis de la Tienda</span>
          </div>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="rounded p-1 text-gray-400 hover:bg-black/5 hover:text-gray-700 transition-colors"
            title={isCollapsed ? "Expandir mapa" : "Minimizar mapa"}
            aria-label={isCollapsed ? "Expandir plano" : "Minimizar plano"}
          >
            {isCollapsed ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
          </button>
        </div>

        {/* Contenido del plano interactivo */}
        {!isCollapsed && (
          <div className="relative p-2.5">
            <svg
              viewBox="0 0 100 100"
              className="h-36 w-36 sm:h-44 sm:w-44 rounded-xl bg-gray-50/80 border border-gray-200/60 shadow-inner"
            >
              <defs>
                {/* Cuadrícula arquitectónica */}
                <pattern
                  id="minimap-grid"
                  width="10"
                  height="10"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 10 0 L 0 0 0 10"
                    fill="none"
                    stroke="rgba(0,0,0,0.04)"
                    strokeWidth="0.5"
                  />
                </pattern>
                {/* Gradiente del radar */}
                <radialGradient id="radar-gradient" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={PALETTE.turquesa} stopOpacity="0.5" />
                  <stop offset="100%" stopColor={PALETTE.turquesa} stopOpacity="0.02" />
                </radialGradient>
              </defs>

              {/* Fondo con rejilla */}
              <rect width="100" height="100" fill="url(#minimap-grid)" />

              {/* Muros perimetrales y divisiones arquitectónicas */}
              <rect
                x="8"
                y="8"
                width="84"
                height="84"
                rx="6"
                fill="none"
                stroke={PALETTE.borde}
                strokeWidth="1.5"
                strokeDasharray="2 1"
              />

              {/* Zona Calzado (Estantes izquierda) */}
              <rect
                x="12"
                y="18"
                width="16"
                height="38"
                rx="2"
                fill="rgba(246, 149, 98, 0.12)"
                stroke={PALETTE.calzado}
                strokeWidth="0.8"
              />
              <text x="20" y="38" fontSize="4.5" fill={PALETTE.calzadoTexto} textAnchor="middle" fontWeight="bold">
                Sneakers
              </text>

              {/* Zona Percheros (Islas centrales) */}
              <rect
                x="32"
                y="36"
                width="28"
                height="22"
                rx="3"
                fill="rgba(12, 124, 124, 0.1)"
                stroke={PALETTE.turquesaTexto}
                strokeWidth="0.8"
              />
              <text x="46" y="48" fontSize="4.5" fill={PALETTE.tinta} textAnchor="middle" fontWeight="bold">
                Percheros
              </text>

              {/* Zona Mostrador / Caja (Derecha) */}
              <rect
                x="74"
                y="28"
                width="14"
                height="30"
                rx="2"
                fill="rgba(92, 217, 216, 0.15)"
                stroke={PALETTE.turquesaTexto}
                strokeWidth="0.8"
              />
              <text x="81" y="44" fontSize="4.2" fill={PALETTE.tinta} textAnchor="middle" fontWeight="bold">
                Caja
              </text>

              {/* Puerta de Entrada (Abajo centro) */}
              <path
                d="M 40 92 L 60 92"
                stroke={PALETTE.turquesa}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <text x="50" y="97" fontSize="4" fill={PALETTE.turquesa} textAnchor="middle" fontWeight="bold">
                ▲ Acceso
              </text>

              {/* Cono de visión (Radar interactivo) */}
              <path
                d={`M ${currentZone.mapCoords.x} ${currentZone.mapCoords.y} L ${x1} ${y1} A ${radarLength} ${radarLength} 0 0 1 ${x2} ${y2} Z`}
                fill="url(#radar-gradient)"
                stroke={PALETTE.turquesa}
                strokeWidth="0.5"
                strokeOpacity="0.4"
              />

              {/* Puntos de zona clicables */}
              {zones.map((zone) => {
                const isActive = zone.id === currentZoneId;
                return (
                  <g
                    key={zone.id}
                    onClick={() => onSelectZone(zone.id)}
                    className="cursor-pointer transition-transform hover:scale-125"
                    style={{ transformOrigin: `${zone.mapCoords.x}px ${zone.mapCoords.y}px` }}
                  >
                    {isActive ? (
                      <>
                        <circle
                          cx={zone.mapCoords.x}
                          cy={zone.mapCoords.y}
                          r="6.5"
                          fill={PALETTE.turquesa}
                          opacity="0.3"
                          className="animate-ping"
                        />
                        <circle
                          cx={zone.mapCoords.x}
                          cy={zone.mapCoords.y}
                          r="4"
                          fill={PALETTE.turquesaTexto}
                          stroke="white"
                          strokeWidth="1.2"
                        />
                      </>
                    ) : (
                      <circle
                        cx={zone.mapCoords.x}
                        cy={zone.mapCoords.y}
                        r="3"
                        fill={PALETTE.borde}
                        stroke="white"
                        strokeWidth="1"
                      />
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Etiqueta de la zona actual */}
            <div className="mt-2 flex items-center justify-between text-[11px] text-gray-600">
              <span className="flex items-center gap-1 font-medium">
                <MapPin size={11} className="text-turquesa-texto" />
                {currentZone.shortName}
              </span>
              <span className="font-mono text-[9px] text-gray-400">
                {Math.round(normalizeHeading(cameraYaw))}°
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function normalizeHeading(deg: number): number {
  return ((deg % 360) + 360) % 360;
}
