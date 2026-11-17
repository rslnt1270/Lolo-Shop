# Título del alta en singular — diseño corto

Issue: #40 · Fecha: 2026-11-17 · Tamaño: cambio chico

- **Intención:** el título sugerido del alta debe nombrar una prenda, no una categoría: "Playera Guess negro", no "Playeras Guess negro".
- **Causa:** `buildSuggestedTitle` (`lib/domain/product-reference.ts`) usa `ProductType.name`. Ese nombre está en plural en `lib/domain/product-types-catalog.ts` porque sirve para listas y filtros.
- **Metas:** los productos **nuevos** salen con título en singular.
- **No metas:** cambiar los títulos ya registrados (decisión del dueño), cambiar los nombres en plural de listas y filtros, o cambiar la base de datos.

## Enfoques

- **A. Nombre en singular por tipo en el catálogo (elegido).** Se agrega `singular` a cada entrada de `PRODUCT_TYPE_CATALOG` y una función `typeSingular(slug)`. No hay migración: el catálogo vive en el código y es la fuente única.
- **B. Columna `singularName` en `ProductType`.** Pide migración y relleno para un dato que ya vive en el código; se descarta.
- **C. Quitar la "s" final con una regla.** Falla con "Pantalones" → "Pantalone", "Jeans", "Tenis", "Trajes de baño"; se descarta.

## Diseño

- Singulares:

  | Plural | Singular |
  |--------|----------|
  | Playeras | Playera |
  | Blusas | Blusa |
  | Camisas | Camisa |
  | Sudaderas | Sudadera |
  | Chamarras | Chamarra |
  | Suéteres | Suéter |
  | Jeans | Jeans |
  | Pantalones | Pantalón |
  | Pants | Pants |
  | Leggings | Leggings |
  | Shorts | Short |
  | Faldas | Falda |
  | Vestidos | Vestido |
  | Conjuntos | Conjunto |
  | Ropa interior | Ropa interior |
  | Trajes de baño | Traje de baño |
  | Tenis | Tenis |
  | Zapatos | Zapato |
  | Sandalias | Sandalia |
  | Botas | Bota |
  | Gorras | Gorra |
  | Bolsas | Bolsa |
  | Mochilas | Mochila |
  | Carteras | Cartera |
  | Cinturones | Cinturón |
  | Calcetines | Calcetines |
  | Lentes | Lentes |
  | Perfumes | Perfume |
  | Raquetas de pádel | Raqueta de pádel |

- `NewProductForm` pasa `typeSlug` (o el singular ya resuelto) a `buildSuggestedTitle`. Si un tipo no tiene singular, se usa `name`.
- **Pruebas:**
  - cada tipo del catálogo tiene un singular no vacío;
  - el título sugerido para playera, Guess y negro es "Playera Guess negro";
  - el respaldo a `name` funciona cuando falta el singular.
- **Lo que decide quien construye:** si el singular viaja con los tipos que recibe el formulario o se resuelve en el cliente desde el catálogo.
