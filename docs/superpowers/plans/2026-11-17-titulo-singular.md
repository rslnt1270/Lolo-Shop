# Título del alta en singular — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el título sugerido del alta nombre una prenda ("Playera Guess negro") y no una categoría.

**Architecture:** el catálogo de tipos (`lib/domain/product-types-catalog.ts`) gana un campo `singular` por slug y una función `typeSingular(slug, fallback)`. `NewProductForm` arma el título con el singular del tipo elegido. Los nombres en plural siguen igual para listas y filtros. No hay migración.

**Tech Stack:** TypeScript, React 18, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-titulo-singular-design.md` (issue #40)

## Global Constraints

- Solo cambian los títulos de productos **nuevos**; no se toca ningún título ya guardado ni la base.
- `name` (plural) no cambia: lo usan listas, filtros y la siembra de `ProductType`.
- Singulares exactos: los de la tabla del spec (Playera, Blusa, Camisa, Sudadera, Chamarra, Suéter, Jeans, Pantalón, Pants, Leggings, Short, Falda, Vestido, Conjunto, Ropa interior, Traje de baño, Tenis, Zapato, Sandalia, Bota, Gorra, Bolsa, Mochila, Cartera, Cinturón, Calcetines, Lentes, Perfume, Raqueta de pádel).
- Repo público: sin secretos. Conventional Commits.

## Review Focus

- Un tipo creado en la base que no está en el catálogo de código (slug desconocido): el título usa `name` tal cual, sin romperse.
- Tras la primera edición manual del título, cambiar de tipo no lo sobrescribe (comportamiento actual de `titleEdited`); el cambio de fuente no debe reactivar la sincronización.

---

### Task 1: Singular por tipo y título sugerido

**Files:**
- Modify: `lib/domain/product-types-catalog.ts`
- Modify: `components/products/NewProductForm.tsx:494-503`
- Test: `lib/domain/__tests__/product-taxonomy.test.ts` (o un nuevo `product-type-singular.test.ts` en la misma carpeta)
- Test: `components/products/__tests__/` (la prueba existente del formulario de alta, si arma el título)

**Interfaces:**
- Produces: `PRODUCT_TYPE_CATALOG: readonly { slug: string; name: string; singular: string; sortOrder: number }[]`
- Produces: `typeSingular(slug: string | null | undefined, fallback: string): string` — devuelve el `singular` del slug, o `fallback` si el slug no está en el catálogo.

- [ ] **Step 1: Pruebas que fallan**

```ts
it("cada tipo del catálogo tiene singular no vacío", () => {
  for (const t of PRODUCT_TYPE_CATALOG) expect(t.singular.trim()).not.toBe("");
});
it("singulares clave", () => {
  expect(typeSingular("playera", "Playeras")).toBe("Playera");
  expect(typeSingular("pantalon", "Pantalones")).toBe("Pantalón");
  expect(typeSingular("shorts", "Shorts")).toBe("Short");
  expect(typeSingular("traje-de-bano", "Trajes de baño")).toBe("Traje de baño");
  expect(typeSingular("tenis", "Tenis")).toBe("Tenis");
});
it("slug desconocido usa el respaldo", () => {
  expect(typeSingular("nuevo-tipo", "Nuevos tipos")).toBe("Nuevos tipos");
  expect(typeSingular(null, "")).toBe("");
});
it("título sugerido en singular", () => {
  expect(buildSuggestedTitle({ typeName: typeSingular("playera", "Playeras"), brand: "Guess", color: "negro" }))
    .toBe("Playera Guess negro");
});
```

En la prueba del formulario (si existe una que elige tipo y marca): al elegir el tipo `playera` y la marca Guess, el campo título vale "Playera Guess …", no "Playeras …".

- [ ] **Step 2:** `npx vitest run lib/domain` → FALLA (`typeSingular` no existe).
- [ ] **Step 3:** Agregar `singular` a las 29 entradas con la tabla del spec y exportar `typeSingular`. En `NewProductForm`, `typeName: selectedType ? typeSingular(selectedType.slug, selectedType.name) : ""` (`ProductTypeOption` ya trae `slug`); dependencia del efecto: `selectedType?.slug` y `selectedType?.name`.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, `npm run lint` → todo en verde.
- [ ] **Step 5: Commit**

```bash
git add lib/domain/product-types-catalog.ts lib/domain/__tests__ components/products
git commit -m "fix(alta): título sugerido con el tipo en singular

Refs #40"
```
