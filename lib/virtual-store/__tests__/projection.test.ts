import { describe, it, expect } from "vitest";
import { normalizeAngle, projectSphericalToScreen } from "../projection";

describe("Virtual Store 3D Projection", () => {
  it("normaliza ángulos correctamente al rango [-180, 180]", () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(90)).toBe(90);
    expect(normalizeAngle(180)).toBe(180);
    expect(normalizeAngle(270)).toBe(-90);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(-90)).toBe(-90);
    expect(normalizeAngle(-190)).toBe(170);
  });

  it("proyecta un punto en el centro de la pantalla cuando la cámara mira directamente hacia él", () => {
    const width = 1000;
    const height = 600;
    const fov = 75;

    const proj = projectSphericalToScreen(0, 0, 0, 0, fov, width, height);

    expect(proj.visible).toBe(true);
    expect(proj.x).toBe(500);
    expect(proj.y).toBe(300);
    expect(proj.deltaYaw).toBe(0);
    expect(proj.deltaPitch).toBe(0);
  });

  it("marca como no visible los puntos que están a espaldas de la cámara", () => {
    const width = 1000;
    const height = 600;
    const fov = 75;

    // Punto detrás (180 grados de diferencia)
    const proj = projectSphericalToScreen(180, 0, 0, 0, fov, width, height);
    expect(proj.visible).toBe(false);
  });

  it("calcula desplazamientos horizontales y verticales esperados", () => {
    const width = 1000;
    const height = 600;
    const fov = 75;

    // Punto hacia la derecha (yaw = 20)
    const projRight = projectSphericalToScreen(20, 0, 0, 0, fov, width, height);
    expect(projRight.visible).toBe(true);
    expect(projRight.x).toBeGreaterThan(500);

    // Punto hacia arriba (pitch = 15)
    const projUp = projectSphericalToScreen(0, 15, 0, 0, fov, width, height);
    expect(projUp.visible).toBe(true);
    expect(projUp.y).toBeLessThan(300); // En coordenadas de pantalla, Y disminuye hacia arriba
  });
});
