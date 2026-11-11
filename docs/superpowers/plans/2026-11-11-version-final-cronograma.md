# LoloShop versión final: cronograma maestro (2026-11-11)

> **For agentic workers:** este documento es el cronograma y el mapa de dependencias. Cada subsistema tiene su propio plan detallado en `docs/superpowers/plans/`. Ejecuta cada plan con superpowers:subagent-driven-development o superpowers:executing-plans. Las casillas `- [ ]` marcan el avance.

**Goal:** llegar a la versión final con el alta de producto, el catálogo automático con botón "Publicar" para el sitio web y el POS rápido, todo completo el lunes 16 de noviembre de 2026, para la demo del jueves 19 y la salida a producción con Vercel Pro. La venta sin internet (F) entra después de la demo.

**Specs:**
- `docs/superpowers/specs/2026-11-11-alta-producto-tienda-design.md` (alta, criterios C1–C22, decisiones de §8)
- `docs/superpowers/specs/2026-11-11-paleta-botones-catalogo-design.md` (paleta, botones, catálogo sincronizado, favoritos)
- `docs/superpowers/specs/2026-11-11-alcance-inventario-simplificado-design.md` (alcance, POS, escaneo rápido)
- `docs/superpowers/specs/2026-11-10-taxonomia-productos-design.md` (tarea 3.8)

**Fuentes de esta versión del cronograma:** auditoría cruzada `.superpowers/sdd/2026-11-11-version-final/auditoria-planes.md` y decisiones aprobadas `.superpowers/sdd/2026-11-11-version-final/decisiones.md` (mandan en caso de duda).

**Restricciones globales (de los specs):**
- Repo público: ningún secreto, cadena de conexión ni número real en commits, pruebas o capturas.
- Migraciones solo con `prisma migrate`, aditivas, sin SQL a mano. **Solo dos migraciones nuevas en toda la versión final** (§3).
- Rol y tienda se releen de la base en cada acción; el JWT solo decide botones.
- El stock nunca queda negativo; toda salida es condicional (`available >= n`).
- Lo público pasa solo por `PublicProduct`; sin SKU, sin cifras de existencias.
- Ninguna venta se pierde: el cobro conserva `clientRequestId`.
- Sin despliegue directo a producción de cambios en cobro; primero preview.

## 1. Fechas

Hoy es miércoles 11 de noviembre. La demo es el jueves 19.

| Fecha | Desarrollo (en paralelo, cada plan en su rama) | Mezcla a `main` (en el orden de §3) |
|---|---|---|
| Mié 11 | Planes auditados y corregidos | — |
| Jue 12 | B T1–T4, A completo, G T1 | 1. B base · 2. A · 3. Migración G (`20261111120000_add_product_types`) |
| Vie 13 | H T1 (generada después de 3), G T2–T7, D T1–T2 y T7 (lógica pura, sin dependencias) | 4. Migración H (`<timestamp>_catalog_color_visibility`) |
| Sáb 14 | D T3–T12 sobre G, E T1–T7, C T1–T8 | 5. G (T2–T8) |
| Dom 15 | E T8 (preview + `test:db`), C T9, H T2–T6 | 6. D · 7. E |
| Lun 16 | B T5–T10 por zona | 8. C · 9. B por zonas · **todo completo** |
| Mar 17 | **Revisión completa**: revisor independiente por plan, `npm run test:db`, preview de Vercel | Solo correcciones de la revisión |
| Mié 18 | **Ensayo de la demo** con datos de `ventas-prueba`; visto bueno del dueño | — |
| Jue 19 | **Demo** | — |
| Después | F (venta sin internet), Vercel Pro, runbook H en producción, pruebas en tienda | — |

*Riesgo:* son 55 horas de agente en 5 días de desarrollo (12 al 16). Solo cabe con trabajo en paralelo y con el orden de mezcla fijo de §3, que evita rehacer lógica de negocio.

## 2. Subsistemas y dependencias

| Id | Subsistema | Depende de | Horas (agente) | Va a la demo |
|---|---|---|---|---|
| A | Permisos y limpieza: sin movimientos, sin traspasos, sin correcciones ni mermas; colaborador edita precios y ve solo su tienda; marcas creables | B base | 6 | Sí |
| B | Paleta y botones turquesa. **Base** (T1–T4: tokens, `buttonClasses`, CSS de movimiento, `Button`) y **zonas** (T5–T10) | — (base); planes dueños de cada zona (zonas) | 5 | Sí |
| G | Taxonomía 3.8: `ProductType`, departamentos, estilo y "para". Su T1 es la migración 1 | — | 13 | Sí (objetivo: lista antes del 16) |
| H | Migración 2 única (`Product.color`, `Product.isPublished`, `Product.catalogPhotosCheckedAt`, `Location.isPublic`, `ColorOption`), mapeo al dominio, relleno de visibilidad y runbook | G T1 | 4 | Sí |
| D | Alta de producto: escanear, decisión de catálogo, fotos blancas con análisis, descripción obligatoria, referencia (tipo de G, marca, color), estados, recorrido de 3 pasos, animaciones | A, B base, G, H T1 | 12 | Sí |
| E | POS rápido: cámara encendida, ×N, existencias por talla, "Sin código" (dueño de la búsqueda), "Agregar nuevamente" en `/escanear` | A, B base, G, H T1, D | 7 | Sí |
| C | Proyección pública, elegibilidad, botón "Publicar", filtro del sitio, favoritos locales, sin CTA de WhatsApp | B base, H T1, D | 8 | Sí |
| F | Venta sin internet: cola local, sincronización, aprobación del dueño | E | — | **No: después de la demo** (decisión 9) |

Total para la demo: **55 horas** de agente (F fuera).

## 3. Orden de mezcla (fijo)

1. **B base (T1–T4).** Solo crea archivos y edita `tailwind.config.ts` y `app/globals.css`. Así A, C, D y E usan `Button` y los tokens desde el inicio.
2. **A completo.** Borra `/movimientos`, traspasos, correcciones, mermas y `StockMovementPanel`; B ya no los migra.
3. **Migraciones**, en este orden y en PR propios:
   1. G T1: `prisma/migrations/20261111120000_add_product_types/`.
   2. H T1: `prisma/migrations/<timestamp de generación>_catalog_color_visibility/`, generada con `prisma migrate dev --create-only` **después** de que 3.1 esté en `main` (el timestamp debe ordenar después de `20261111120000`). Es la única migración que crea columnas fuera de G. C y D no crean migraciones.
4. **G T2–T8** (dominio, contrato, acciones, `ClassificationFields`). Ruta crítica de D.
5. **D**, rebasado sobre G: consume `listProductTypesAction`, `ClassificationFields` y `createProductAction` de G y las columnas de H. Sin columna `tipo`.
6. **E**, con preview y `npm run test:db` antes de mezclar (toca el cobro).
7. **C** (proyección, elegibilidad, "Publicar", favoritos).
8. **B zonas:** T5 después de A; T6 después de E; T7 después de A+G+D; T8 después de A+D+E; T9 después de C; **T10 al final**.

Regla: si un plan llega tarde, los que van después **esperan o se rebasan**; nunca se reescribe la lógica de un plan anterior. B es el que se rebasa (cambiar clases cuesta poco).

**Respaldo si G no está lista el 16 (decisión 8):** D se mezcla sobre `main` sin G T2–T8, usando el select `category` actual, sin columna `tipo` nueva (ver plan D, "Respaldo sin G"). La migración 1 (G T1) sí se mezcla el 12, porque H depende de ella. La 3.8 entra después sin migrar datos de D.

## 4. Decisiones aprobadas que cambian el cronograma

(De `decisiones.md`; la numeración es la de ese archivo.)

- **(1) Sitio web = `/catalogo` y recorrido 3D.** Muestra solo productos **elegibles y publicados**. Elegible = foto de frente y de atrás blancas revisadas (`catalogPhotosCheckedAt`), descripción y existencias en una tienda pública. "Listo para catálogo" es el estado interno en `/productos`. Publican owner y manager (servidor); el colaborador no. Dueño: plan C.
- **(2) Cámara abierta en `/pos`:** una prenda sostenida suma una vez por presentación; "×N" con controles para bajar o quitar. Dueño: plan E.
- **(3) `Location.isPublic @default(true)`; `Product.isPublished @default(false)`.** El runbook no marca tiendas. Dueño: plan H.
- **(4) El colaborador ve solo su tienda.** Aviso "Esta prenda no está en tu tienda" sin nombrar la otra. Dueño: plan A.
- **(5) Fotos de tienda viejas:** excluidas por CSV para la demo; publicar exige fotos blancas revisadas (`catalogPhotosCheckedAt`). Dueños: H (relleno) y C (regla).
- **(6) Correcciones, mermas, traspasos y `/movimientos` se quitan** para todos los roles. Devolución = aviso por WhatsApp; el dueño cancela la venta en `/ventas`. Dueño: plan A.
- **(7) "Agregar nuevamente" en `/escanear`,** validando la tienda en el servidor. Dueño: plan E.
- **(8) Respaldo sin 3.8:** ver §3.
- **(9) F después de la demo.**
- **(10) Todo completo el lunes 16;** revisión el 17; ensayo el 18; demo el jueves 19.
- **(11) Reducir movimiento:** el giro de carga se hace más lento (1600 ms por vuelta), no se detiene. Dueño: plan B.
- **Vercel Pro:** no bloquea la demo, que corre en preview. Sí bloquea la producción final. Confirmar antes del 18.
- **Pendiente de confirmación del dueño en el ensayo del 18 (no bloquea el desarrollo):** quitar el CTA de WhatsApp (reversible con `SHOW_WHATSAPP_CTA`), favoritos, orden del catálogo (se queda el actual: más nuevo primero) y el texto "Fotos completas, sin existencias" del alta.
- **Fuera de alcance de la demo:** animaciones de catálogo, ficha y favoritos (paleta §8.2, marcadas pendientes en el spec); conteo físico (1.13).

## 5. Preguntas abiertas para ti

1. ¿Qué método de ejecución quieres? **Subagentes** (un implementador y un revisor por tarea) o **nativo** (implementación y un revisor al final de la rama). Recomiendo subagentes en A, G y D, y nativo en B, C, E y H.

## 6. Próximos pasos inmediatos

- [x] Planes A, B, C, D, E, G y H escritos.
- [x] Auditoría cruzada aplicada a los siete planes (2026-11-11).
- [ ] Jue 12: mezclar B base, A y la migración de G (§3, pasos 1–3.1).
- [ ] Vie 13: generar y mezclar la migración de H (§3, paso 3.2).
- [ ] Plan de F (`2026-11-11-F-venta-sin-internet.md`): se escribe después de la demo.
