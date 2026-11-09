# LoloShop: spec maestro del próximo salto (tienda digital y probador)

- **Fecha:** 2026-10-27 · **Estado:** propuesta para aprobación del dueño · **Sin secretos** (repo público)
- **Reemplaza como referencia de orden:** la adenda del plan de 2026-10-19 (§10 y §11). Los specs de detalle siguen vigentes donde no se contradigan (ver §9).
- **Convención:** **[V]** verificado en el repo, en la documentación o en la sesión; **[C]** claim de proveedor o sin verificar; **[A]** juicio propio; **[D]** decisión del dueño.

---

## 1. Visión

LoloShop es una PWA de inventario y ventas para dos tiendas físicas con catálogo en línea. El próximo salto lleva la tienda física al navegador:

1. **Catálogo digital:** los productos reales de la tienda, dados de alta escaneando sus etiquetas, con foto.
2. **Tienda digital:** fotos reales del local convertidas en un recorrido navegable, con los productos en su repisa.
3. **Visualizaciones de producto:** riel de perchero, hotspots y ficha que convierte (ver `2026-10-27-visualizacion-catalogo-ideas.md`).
4. **Probador virtual:** la prenda se prueba en vivo (modo personal del owner) y por foto (modo cliente), después de que lo anterior funcione.

**Orden de trabajo [D]:** catálogo → tienda → visualizaciones → probador. La demo no usa IA.

---

## 2. Estado actual [V]

| Área | Estado | Dónde |
|---|---|---|
| Inventario, roles, dashboard, escaneo ±1, `/catalogo` | En producción (PR #17 pendiente de merge) | `main`, `feat/next-15` |
| Alta de producto con escáner | Funciona, pero stock inicial fijo en 1, sin categoría, sin modo lote | `app/escanear`, `lib/data/prisma-source.ts` |
| Fotos de producto | Captura, procesamiento y subida a Vercel Blob; original no guardado | `lib/image/*`, `components/products/*` |
| `/catalogo` público | Entrega SKU e inventario al visitante (cambio en árbol de trabajo, no en `main`) | `lib/actions.ts` (`fetchPublicProductsAction`) |
| Recorrido 3D | Trabajo de Antigravity sin commitear, con datos demo y coordenadas inventadas | `lib/virtual-store/`, `components/virtual-store/` |
| Spike Cloudflare Workers | Terminado en local, veredicto "go condicionado". Nada desplegado | Worktree `../LoloShop-cf-spike`, rama `spike/cloudflare-workers` |
| Probador virtual | Solo specs y auditoría. Sin código | `docs/superpowers/specs/2026-10-19-*`, `2026-10-20-auditoria-*` |
| Documentos sin commitear | 3 specs del probador modificados, 4 nuevos (incluidos los del 2026-10-27) | `git status` |

---

## 3. Bloqueantes antes de cualquier demo pública

| # | Bloqueante | Por qué | Dueño |
|---|---|---|---|
| B1 | `/catalogo` no debe exponer SKU ni inventario | Dato de negocio al público. La tarea 5.4 del plan lo exige | Codex, en la rama del recorrido |
| B2 | Quitar datos demo y el stock de respaldo `?? 4` del modal | Muestra stock inventado | Antigravity (rama del recorrido) |
| B3 | Repetir `test`, `lint` y `build` en la rama del recorrido | El reporte de Antigravity no está verificado (build quedó en segundo plano) | Claude |
| B4 | Merge del PR #17 (Next 15.5) tras prueba manual | Next 14 sin parche listado; vulnerabilidades divulgadas | Dueño (prueba) + Claude |
| B5 | **Respaldo restaurable de Neon** y, después, baseline de `prisma migrate`, antes de la migración del original de foto | CLAUDE.md prohíbe SQL a mano y no hay `prisma/migrations/` [V]. Un baseline sin respaldo arriesga producción | Claude + Codex |

---

## 4. Fases del próximo salto

### Fase D1: catálogo digitalizado (demo, parte 1)
Spec de detalle: `2026-10-27-demo-tienda-digital-design.md` §3.
- Modo lote en `/escanear`, categoría obligatoria, stock inicial explícito (D-1), original de la foto guardado.
- Criterio: 10 productos dados de alta con foto en un móvil real, en menos de 10 minutos [A].

### Fase D2: tienda digital (demo, parte 2)
Spec de detalle: `2026-10-27-demo-tienda-digital-design.md` §4 y §5.
Decisión D-9 (opción C, 2026-10-27): dos etapas sobre el mismo componente de recorrido.
1. **Sala virtual (primeras pruebas):** un cuarto diseñado y minimalista, con pestañas por sección y la cámara que se mueve a cada riel o repisa. Referencia: concepto "Nike Virtual Store" (ideas §2.6). Sirve para probar navegación, riel 2.5D y panel de producto sin depender de la captura.
2. **Tienda real (meta profesional):** fotos reales del local **organizadas por sus secciones reales** (playeras, chamarras, accesorios, gorras y las que defina el dueño). Cada sección es una zona del recorrido y muestra los productos de esa categoría. Reemplaza a la sala virtual cuando las panorámicas estén aprobadas.
- Protocolo de captura de fotos (sin personas, sin precios visibles), por sección.
- Panorámicas 360° por sección (R-1). Gaussian Splat queda para después (D-2).
- Recorrido de Antigravity integrado en rama propia, con hotspots medidos sobre fotos reales.
- Las zonas inventadas de `zones.ts` (entrada, percheros, calzado, caja) se sustituyen por las secciones reales.

### Fase D3: visualizaciones de producto
Ideas de `2026-10-27-visualizacion-catalogo-ideas.md` §9, en orden:
1. Riel **2.5D** (D-7): prenda recortada que gira con hover o toque y se levanta con clic, con filtro o paginación por categoría. Necesita el recorte de fondo (D-8).
2. Compra rápida y selector de color (requiere variantes por color).
3. Visor 360° por producto (requiere captura por prenda).

### Fase D4: probador virtual
Specs de detalle: `2026-10-19-probador-*` y `2026-10-19-probador-bajo-costo-design.md`, con las correcciones de la auditoría.
- Modo personal (solo owner): `/probador`, cámara local, sin IA hasta "Capturar". Rutas `/api/probador/*` protegidas.
- Modo cliente: botón "Probar" en el modal del producto. **Depende de D4 (decisión de acceso, §6).**
- Proveedor de IA: decidido por el piloto (plan Sprint 2), no antes.

### Fase D5: operación y dominio
- Hosting: Cloudflare Workers como interino (ver §5), y paso a Vercel Pro cuando el cliente acepte la propuesta [D].
- Dominio `loloshop.y4ga.app`: el corte depende del hosting (D-4) y no cabe antes del Buen Fin. **Se mueve a la primera semana de enero de 2027** (S-E del plan global), con TTL baja. La demo usa la URL del hosting.
- n8n: avisos y respaldos, nunca en el camino crítico (`2026-10-19-n8n-flujos-design.md`).

---

## 5. Arquitectura y decisiones técnicas

| Tema | Decisión | Estado |
|---|---|---|
| Hosting interino | Cloudflare Workers Paid (US$5/mes), OpenNext + Prisma `wasm` + `adapter-pg` + Hyperdrive | [V] en local. Despliegue pendiente de autorización |
| Hosting final | Vercel Pro (US$20/mes) al aceptar el cliente | [D] |
| Límite de CPU | Login con `bcryptjs` ~67 ms (costo 10) y ~265 ms (costo 12) excede los 10 ms de Free. Por eso Paid | [V] |
| Capa de plataforma | `lib/platform/` con IP, anti-bot, almacenamiento. El dominio (`lib/tryon/`, `lib/probador/`, `lib/virtual-store/`) solo recibe interfaces | [A], de la auditoría |
| Almacenamiento de fotos | Vercel Blob hoy; R2 o Blob según hosting (D-4 del spec de la demo) | [D] pendiente |
| Datos del recorrido | Panorámicas y hotspots en la base de datos o en JSON versionado, no fijos en `zones.ts` | [A] |
| Rutas | Cliente `/api/tryon/*` (pública con enlace firmado); personal `/api/probador/*` (protegida) | [V] en auditoría |
| Rama de trabajo | Una rama por herramienta y tarea. Antigravity en `feat/demo-recorrido-3d`; Codex en `feat/demo-*`; docs en `docs:` aparte | [D] regla del plan §4 |
| Prendas en la demo | **2.5D:** foto recortada con giro y profundidad en CSS y `framer-motion`. Sin modelos 3D ni three.js | [D] 2026-10-27 (D-7) |
| Recorte de fondo | Por decidir entre librería en el navegador, servicio externo o recorte manual. Revisar licencia (repo público, uso comercial) y peso | Pendiente (D-8) |

### 5.1 Contrato del recorrido

El recorrido lo construye la sesión de Antigravity. Para que su trabajo y estos specs no se separen, el componente recibe solo estos datos [A]:

```ts
// Proyección pública: lo único que llega al navegador del visitante
interface PublicProduct {
  id: string;
  title: string;
  brand: string;
  category: string;
  price: number;            // precio de la variante principal
  imageUrl: string | null;  // vista previa procesada
  cutoutUrl: string | null; // prenda recortada para el 2.5D (D-8)
  availability: "available" | "sold_out";
}

interface ZoneConfig {
  id: string;
  name: string;              // nombre de la sección real: "Playeras", "Chamarras"...
  kind: "virtual" | "real";  // sala virtual (pruebas) o foto real del local (D-9)
  categories: string[];      // categorías de producto que muestra la sección
  panoramaUrl: string | null;
  initialYaw: number;
  initialPitch: number;
  mapCoords: { x: number; y: number };
  connections: { targetZoneId: string; label: string; yaw: number; pitch: number }[];
}

interface HotspotConfig {
  id: string;
  zoneId: string;
  productId: string;  // elegido, no asignado por índice
  yaw: number;        // medido sobre la foto real
  pitch: number;
  shelfLabel: string;
}
```

Reglas: si `productId` no está en la lista pública, el hotspot se oculta. Las zonas y los hotspots vienen de BD o de JSON versionado, no de constantes en `zones.ts`. Ningún campo de SKU, inventario ni movimientos.

---

## 6. Decisiones del dueño

| # | Decisión | Recomendación | Estado |
|---|---|---|---|
| D-1 | Stock inicial al dar de alta: contado (A) o `1` fijo (B) | A, con 0 por defecto | Pendiente |
| D-2 | Recorrido: panorámicas 360° (R-1) o Gaussian Splat (R-2) en la demo | R-1 | Pendiente |
| D-3 | Fotos de la tienda sin personas ni precios visibles | Sí | Pendiente |
| D-4 | Hosting de la demo (es la puerta P-2 del plan) | Cloudflare interino | Pendiente de autorización de cuenta y de la rama de Neon |
| D-5 | Recorrido público muestra solo "disponible / agotado" | Sí | Pendiente |
| D-6 | Probador en la demo sin IA | Sí | Pendiente |
| D4 | Modo cliente: abierto en `/catalogo` o solo con enlace o QR firmado | Enlace o QR firmado | **Pendiente** (bloquea D4 de fase) |
| D5 | Promociones con juego (cupón rascable, básquet) | Fuera de la demo | Pendiente |
| D-7 | Nivel de 3D de las prendas | 2.5D con recorte | **Decidido 2026-10-27** |
| D-8 | Herramienta de recorte de fondo | Tras la comparación B.9 del plan | Pendiente |
| D-9 | Recorrido: tienda real, sala virtual o híbrido | Híbrido: sala virtual para pruebas, tienda real por secciones como meta | **Decidido 2026-10-27 (opción C)** |
| D-10 | Fotos de la prenda en el alta: solo frontal, o frontal y trasera para el giro 2.5D | Frontal y trasera (trasera opcional) | Pendiente |

---

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Fotos con personas o datos sensibles | Protocolo de captura (demo §4.1) y revisión antes de subir |
| Recorrido con posiciones inventadas | Medir `yaw` y `pitch` sobre fotos reales |
| Stock falso en lo público | B1 y B2, y D-5 |
| Trabajo de tres herramientas choca | Una rama por tarea, PR pequeño, revisión antes de mezclar |
| Build y tests reportados sin verificar | B3 antes de cada merge |
| Riel con muchas prendas se rompe | Filtro y paginación por categoría (ideas §2.1) |
| Costo de IA se sale del plan | Sin IA en la demo. Topes del plan §3 cuando llegue el probador |
| Calidad del try-on con klein-4B (entradas menores de 512 px) | Piloto del plan Sprint 2 antes de elegir proveedor |
| Migración de Vercel a Cloudflare y de vuelta | Código de dominio sin dependencias de plataforma |
| Privacidad de la captura de personas (modo personal) | Sin guardado, aviso al cliente, decisión D3 del plan |

---

## 8. Criterios de éxito de la demo

- Un operador da de alta 10 productos con foto en menos de 10 minutos en un móvil real.
- `/catalogo` no expone SKU ni inventario (test automatizado).
- El recorrido se navega en un móvil real con 10 o más productos en su repisa.
- Ningún dato de stock ni de precio ficticio aparece en lo público.
- `lint`, `test` y `build` en verde en cada rama que se mezcla.

---

## 9. Relación con los documentos existentes

| Documento | Estado con este spec |
|---|---|
| `2026-10-19-probador-cliente-foto-design.md` | Vigente con los cambios de la auditoría. Decisión D4 pendiente |
| `2026-10-19-probador-personal-vivo-design.md` | Reemplazado parcialmente (solo owner, híbrido). Ver aviso en el documento |
| `2026-10-19-probador-bajo-costo-design.md` | Vigente. Fuente de topes y niveles A/B/C |
| `2026-10-19-fotos-producto-ia-design.md` | Vigente para Sprint 3. Piloto manual en Google Flow hecho el 2026-11-05 (§13) y estándar de imagen del catálogo (§14), que aplica desde la Fase D1 |
| `2026-10-19-loloshop-dominio-y4ga-design.md` | Vigente. Corte en Sprint 1 |
| `2026-10-19-n8n-flujos-design.md` | Vigente. Nunca en el camino crítico |
| `2026-10-20-auditoria-probador-design.md` | Vigente como lista de correcciones |
| `2026-10-20-spike-cloudflare-workers-informe.md` | Vigente como resultado del spike local |
| `2026-10-27-demo-tienda-digital-design.md` | Detalle de fases D1 y D2 |
| `2026-10-27-visualizacion-catalogo-ideas.md` | Insumo de fase D3 |
| `plans/2026-10-19-probador-virtual-roadmap-sprints.md` | Plan de sprints del probador. Superado en orden por el plan global |
| `plans/2026-10-27-loloshop-plan-global.md` | Plan vigente del próximo salto |

---

## 10. Equipo de agentes

Definidos en `.claude/agents/` (actualizados el 2026-10-27). Cada uno arranca sin contexto, así que se invoca uno por tarea del plan, con este spec y la tarea como contrato.

| Agente | Responsabilidad | Modelo |
|---|---|---|
| `architect` | Contratos entre módulos, revisión de specs y planes, **seguridad y privacidad** | opus |
| `backend-data` | Prisma, migraciones, `InventoryDataSource`, server actions, proyección pública, `lib/platform/` | opus |
| `frontend-pwa` | Páginas, componentes, escaneo por lote, PWA | sonnet |
| `visual-design` | Sistema visual, layout del catálogo y la ficha, móvil primero, textos | sonnet |
| `visual-3d` | Recorte de fondo, riel 2.5D, recorrido (panorámicas, hotspots, minimapa) | sonnet |
| `qa-testing` | TDD y verificación de ramas (incluidos reportes de Codex y Antigravity) | sonnet |
| `devops-deploy` | Vercel, Cloudflare Workers, secretos, PWA, build | sonnet |

Codex y Antigravity siguen trabajando en paralelo en sus propias ramas. Sus entregas pasan por `qa-testing` y `architect` antes de mezclar.

## 11. Fuera de alcance de este spec

- Gaussian Splat de la tienda (R-2), salvo que D-2 cambie.
- Cobro en línea y carrito (el canal de compra sigue siendo WhatsApp).
- Modo cliente abierto en `/catalogo` sin decidir D4.
- Proveedores de IA para fotos o try-on antes del piloto.
- Consultas de precios y contratos con proveedores (plan 0.8).
