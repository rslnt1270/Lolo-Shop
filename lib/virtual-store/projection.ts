/**
 * Normaliza un ángulo en grados al rango [-180, 180)
 */
export function normalizeAngle(angle: number): number {
  let normalized = (angle % 360 + 360) % 360;
  if (normalized > 180) {
    normalized -= 360;
  }
  return normalized;
}

export interface ProjectedPoint {
  x: number;
  y: number;
  visible: boolean;
  scale: number;
  deltaYaw: number;
  deltaPitch: number;
}

/**
 * Proyecta coordenadas esféricas (yaw, pitch) en el espacio 2D de la pantalla
 * basado en la orientación de la cámara (cameraYaw, cameraPitch, fov) y dimensiones del viewport.
 */
export function projectSphericalToScreen(
  targetYaw: number,
  targetPitch: number,
  cameraYaw: number,
  cameraPitch: number,
  fov: number,
  viewWidth: number,
  viewHeight: number
): ProjectedPoint {
  const deltaYaw = normalizeAngle(targetYaw - cameraYaw);
  const deltaPitch = targetPitch - cameraPitch;

  // Si está detrás de la cámara (fuera de ±90° respecto al centro de visión), no es visible
  if (Math.abs(deltaYaw) > 85) {
    return {
      x: -9999,
      y: -9999,
      visible: false,
      scale: 0.5,
      deltaYaw,
      deltaPitch,
    };
  }

  // Conversión a radianes
  const radFov = (fov * Math.PI) / 180;
  // Distancia focal en píxeles
  const focalLength = (viewWidth / 2) / Math.tan(radFov / 2);

  const radYaw = (deltaYaw * Math.PI) / 180;
  const radPitch = (deltaPitch * Math.PI) / 180;

  const screenX = viewWidth / 2 + Math.tan(radYaw) * focalLength;
  const screenY = viewHeight / 2 - Math.tan(radPitch) * focalLength;

  // Factor de escala por perspectiva (los objetos en el borde se escalan suavemente)
  const distFromCenter = Math.sqrt(
    Math.pow((screenX - viewWidth / 2) / (viewWidth / 2), 2) +
    Math.pow((screenY - viewHeight / 2) / (viewHeight / 2), 2)
  );
  const scale = Math.max(0.65, Math.min(1.15, 1 - distFromCenter * 0.15));

  const padding = 60;
  const visible =
    screenX >= -padding &&
    screenX <= viewWidth + padding &&
    screenY >= -padding &&
    screenY <= viewHeight + padding;

  return {
    x: Math.round(screenX),
    y: Math.round(screenY),
    visible,
    scale,
    deltaYaw,
    deltaPitch,
  };
}
