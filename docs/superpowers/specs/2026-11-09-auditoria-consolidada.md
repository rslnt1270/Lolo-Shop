# LoloShop: auditoría consolidada (2026-11-09)

**Alcance:** rama `feat/demo-alta-lote` @ `ca22425` (alta por lote, ventas, catálogo con recorrido), `main` (producción), spec y plan de implementaciones posteriores. Auditoría **estática** con 6 auditores en paralelo (no se ejecutó la app, las pruebas ni la build; nadie leyó secretos ni se conectó a bases).
**Reportes completos** (locales, no versionados): `.superpowers/sdd/2026-11-09-auditoria/01-seguridad.md`, `02-backend-datos.md`, `03-frontend-pwa.md`, `05-pruebas.md`, `06-plataforma.md`; el de spec/plan se resume en §4.

## 1. Resumen por área

| Área | Crít. | Alto | Medio | Bajo | Veredicto |
|---|---|---|---|---|---|
| Seguridad y privacidad | 2 | 6 | 7 | 9 | Ventas sólidas; inventario, alta y webhook con huecos |
| Backend y datos | 0 | 4 | 6 | 7 | Ventas, dashboards y migraciones sólidos; ajustes de stock sin control |
| Frontend y PWA | 0 | 6 | 12 | 9 | Staff usable; catálogo público no cumple móvil/accesibilidad |
| Pruebas | 0 | 4 | 6 | 4 | Buena cobertura de ventas; CI no corre pruebas de base |
| Plataforma | 0 | 3 | 5 | 6 | Hobby, sin pooler, Next 14 con CVE crítico |
| Spec y plan | 0 | 6 | 9 | 6 | P0 bien cubierto; huecos operativos de stock y catálogo |

**Lo que está sólido** (coinciden varios auditores): venta concurrente con descuento condicional atómico, idempotencia por `clientRequestId`, anulación y confirmación por rol/tienda, dashboards, proyección pública `PublicProduct`, migraciones aditivas (el código anterior funciona con el esquema nuevo), pruebas de ventas contra Postgres, ninguna prueba toca la red.

## 2. Hallazgos principales (deduplicados)

Prioridad: **P0** antes de la salida/Buen Fin · **P1** después del Buen Fin, antes del 12-01 · **P2** enero. "Plan" = tarea que ya lo resuelve.

| # | Hallazgo | Origen | Sev. | Plan | Prioridad propuesta |
|---|---|---|---|---|---|
| H1 | Producción (`main`): la acción del catálogo no exige sesión y devuelve `Product[]` completo (SKU, barcode, conteos); explotabilidad sin confirmar | Seg C1 | Crítico (posible) | T5 (salida) | P0: si la salida se pospone, hotfix en `main` |
| H2 | Webhook sin `WHATSAPP_APP_SECRET` acepta POST sin firma y responde con el token de Meta a `from`/`phone_number_id` del atacante | Seg C2, Pruebas A2 | Crítico (condicional) | T2 parcial | P0: T2 + fijar `phone_number_id` y validar origen |
| H3 | `adjustInventory` sin `available + delta >= 0` ni CHECK; "Salida" en `/escanear` = venta invisible; sin tipo ni nota | Back H1, Seg A3, Plan A1 | Alto | No | P0 mitigación (instrucción "toda venta por /pos"); arreglo P0 si cabe, si no primera P1 |
| H4 | Inventario, alta e imágenes usan el rol/tienda del JWT (30 días); manager con tienda opera en la otra | Back H2, Seg A1–A2 | Alto | No | P0/P1 junto con H3 |
| H5 | `prisma/seed.ts` sin guarda: contra producción repone contraseñas de desarrollo y crea `loc-1`/`loc-2` | Back H3 | Alto | No | P0 (guarda de entorno, 0.5 h) |
| H6 | Catálogo con datos inventados (número falso, prendas/repisas de ejemplo, textos "Ghost Puffer"/"Aparta aquí") | Front H-1 | Alto | T1, T3, T8 parcial | P0 (ampliar T3) |
| H7 | Catálogo público: objetivos < 44 px, iconos sin nombre, modal/cajón sin `role="dialog"`/Esc/foco, `PageTransition` en blanco hasta hidratar, sin `prefers-reduced-motion` | Front H-2..H-4 | Alto | No | P0 lo mínimo (diálogo, 44 px, sin blanco); resto P1 |
| H8 | `/`, `/productos`, `/etiquetas` se rompen con sesión vencida; no hay `error.tsx`/`loading.tsx`; login con mayúscula automática y botón bloqueado al fallar la red | Front H-5, H-6 | Alto | No | P0 (login y sesión) |
| H9 | Una talla = un producto; no se puede agregar talla a un producto | Back H4, Plan A3 | Alto | No | **Decisión del dueño**; P1 temprano |
| H10 | No se puede editar precio, título, departamento ni desactivar; departamentos del relleno vacíos | Plan A2 | Alto | No | P0 mínimo (precio y desactivar) o P1 |
| H11 | Vercel Hobby (uso comercial prohibido; límites de ancho de banda/Blob) | Plat A1 | Alto | No | **Decisión del dueño** antes de la salida |
| H12 | Sin pooler de Neon ni `connection_limit`; `DIRECT_URL` ausente en Vercel | Plat A2 | Alto | No | P0 (usar URL `-pooler` en la app; directa solo para migrar) |
| H13 | Next 14.2.35 con CVE crítico (DoS) y 10 altos | Plat A3, Seg | Alto | T16 parcial (enero) | P1: evaluar parche menor de Next 14 antes; PR #17 en enero |
| H14 | Sin plan de contingencia en el Buen Fin (caída, sin internet, quién vigila) | Plan A5 | Alto | No | P0 (sección en la guía, 1 h) |
| H15 | Carga de ClubAlva: 1 día entre salida y Buen Fin | Plan A6 | Alto | Parcial | **Decisión del dueño**: plan B |
| H16 | `test:db` no corre en CI; alta y proyección pública solo con mocks/fixtures | Pruebas A1, A3, A4 | Alto | No | P1 |
| H17 | Barrido de blobs (T11) puede borrar fotos de producción si corre contra otra base; Preview comparte store de Blob | Plan A4, M5 | Alto | T11 sin salvaguardas | Antes de T11 |
| H18 | PWA cachea `/api/*` y páginas (incl. `/catalogo`) hasta 24 h; `public/__tests__` en precaché; equipos con PWA vieja tras el deploy | Front M, Plan M4 | Medio | No | P0: paso de recarga en la guía; P1 reglas del SW |
| H19 | Fase G de producción no verifica WhatsApp, webhook ni catálogo; faltan variables en F.7 y en Vercel | Plan M3, Plat M4 | Medio | Parcial | P0 (ampliar T4/T5) |
| H20 | WhatsApp Business (1.13) sin tarea; bot (Cloud API) y botón `wa.me` llegan a números distintos | Plan M1, M2 | Medio | No | P1 (tarea nueva) |
| H21 | Sin SEO/Open Graph en `/catalogo`; sin aviso de privacidad (LFPDPPP) | Plan M6, M7 | Medio | No | OG P0 opcional (1 h); privacidad P1 |
| H22 | Traspasos entre tiendas e historial de movimientos (RF-INV-09 P1) | Plan M9 | Medio | No | P1 |
| H23 | Node 24 en Vercel vs 20 en CI, sin `engines`; lint no corre en CI | Plat M1–M2 | Medio | T6 parcial | P1 |
| H24 | Defectos de orden del plan (T8 rompe prueba de T3; T9 depende de T18; mocks faltantes en T3/T15) | Plan M8 | Medio | — | Corregir el plan |
| H25 | Turquesas duplicadas; `#2DD4BF` con texto blanco ≈ 1.9:1 | Front M | Medio | No | P1 (tokens) |

## 3. Decisiones que necesita el dueño

1. **Tallas (H9):** ¿cada talla es una opción del mismo producto (recomendado, el modelo ya lo permite) o productos separados?
2. **Vercel (H11):** ¿pasar a Pro antes del Buen Fin (costo mensual) o asumir el riesgo de Hobby?
3. **Fecha de salida** y **plan B de ClubAlva (H15):** cargar solo lo más vendido; fotos de catálogo solo en Lomas.
4. **Si la salida se pospone:** ¿hotfix de H1 en `main`?
5. **Edición de precio (H10):** ¿la necesitas para el Buen Fin (promociones)?

## 4. Spec y plan: correcciones necesarias

- Agregar tareas: H3+H4 (ajustes seguros y rol de la base), H5, H8, H10, H12, H14, H20 (1.13), H21, H22, y P0 mínimo de H7.
- Ampliar T2 (H2: `phone_number_id` fijo, firma ausente/longitud distinta), T3 (H6: textos fijos de siluetas y "Apartar"), T4/T5 (H18, H19), T1 (número con lada `52` obligatoria), T11 (H17).
- Corregir orden (H24) y quitar del plan la pregunta de WhatsApp ya resuelta.
- Calendario: P1 completo (≈ 75 h con los huecos) no cabe antes del 12-01; lo visual 3D (T8, T19, T20) e imágenes (T9, T11, T18) pasan a enero.

## 5. Secuencia recomendada

1. **Hoy:** decisiones de §3 e instrucción operativa "toda venta por `/pos`".
2. **P0 de código (≈ 10–12 h):** T1, T2 ampliada, T3 ampliada, H5, H8, H12, P0 de H7; si cabe, H3+H4 y precio (H10).
3. **Guía de salida:** contingencia (H14), recarga de PWA (H18), Fase G ampliada (H19).
4. **Salida:** T4 (preview) → T5 (producción) en ventana nocturna, respaldo fresco ese día.
5. **Después del Buen Fin:** H3/H4 si no salieron, H9, H10, devoluciones, borrador de `/pos`, CI con `test:db`, WhatsApp Business, privacidad, traspasos.
6. **Enero:** imágenes, recorrido 3D, Next 15/16, analítica.
