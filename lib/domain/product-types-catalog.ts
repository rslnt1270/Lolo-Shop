/**
 * Catálogo de tipos de producto: solo datos (sin imports de servidor).
 * Fuente única de la lista; pendiente de confirmar por el dueño (spec taxonomía §3.3 y §4).
 */

export const PRODUCT_TYPE_CATALOG: readonly { slug: string; name: string; singular: string; sortOrder: number }[] = [
  { slug: "playera", name: "Playeras", singular: "Playera", sortOrder: 1 },
  { slug: "blusa", name: "Blusas", singular: "Blusa", sortOrder: 2 },
  { slug: "camisa", name: "Camisas", singular: "Camisa", sortOrder: 3 },
  { slug: "sudadera", name: "Sudaderas", singular: "Sudadera", sortOrder: 4 },
  { slug: "chamarra", name: "Chamarras", singular: "Chamarra", sortOrder: 5 },
  { slug: "sueter", name: "Suéteres", singular: "Suéter", sortOrder: 6 },
  { slug: "jeans", name: "Jeans", singular: "Jeans", sortOrder: 7 },
  { slug: "pantalon", name: "Pantalones", singular: "Pantalón", sortOrder: 8 },
  { slug: "pants", name: "Pants", singular: "Pants", sortOrder: 9 },
  { slug: "leggings", name: "Leggings", singular: "Leggings", sortOrder: 10 },
  { slug: "shorts", name: "Shorts", singular: "Short", sortOrder: 11 },
  { slug: "falda", name: "Faldas", singular: "Falda", sortOrder: 12 },
  { slug: "vestido", name: "Vestidos", singular: "Vestido", sortOrder: 13 },
  { slug: "conjunto", name: "Conjuntos", singular: "Conjunto", sortOrder: 14 },
  { slug: "ropa-interior", name: "Ropa interior", singular: "Ropa interior", sortOrder: 15 },
  { slug: "traje-de-bano", name: "Trajes de baño", singular: "Traje de baño", sortOrder: 16 },
  { slug: "tenis", name: "Tenis", singular: "Tenis", sortOrder: 17 },
  { slug: "zapato", name: "Zapatos", singular: "Zapato", sortOrder: 18 },
  { slug: "sandalia", name: "Sandalias", singular: "Sandalia", sortOrder: 19 },
  { slug: "bota", name: "Botas", singular: "Bota", sortOrder: 20 },
  { slug: "gorra", name: "Gorras", singular: "Gorra", sortOrder: 21 },
  { slug: "bolsa", name: "Bolsas", singular: "Bolsa", sortOrder: 22 },
  { slug: "mochila", name: "Mochilas", singular: "Mochila", sortOrder: 23 },
  { slug: "cartera", name: "Carteras", singular: "Cartera", sortOrder: 24 },
  { slug: "cinturon", name: "Cinturones", singular: "Cinturón", sortOrder: 25 },
  { slug: "calcetines", name: "Calcetines", singular: "Calcetines", sortOrder: 26 },
  { slug: "lentes", name: "Lentes", singular: "Lentes", sortOrder: 27 },
  { slug: "perfume", name: "Perfumes", singular: "Perfume", sortOrder: 28 },
  { slug: "raqueta-padel", name: "Raquetas de pádel", singular: "Raqueta de pádel", sortOrder: 29 },
];

/** Nombre en singular del tipo (para el título sugerido del alta); `fallback` si el slug no está en el catálogo. */
export function typeSingular(slug: string | null | undefined, fallback: string): string {
  return PRODUCT_TYPE_CATALOG.find((t) => t.slug === slug)?.singular ?? fallback;
}

/** Tipos admitidos por departamento (puente `DepartmentProductType`): 16/12/14/4/9 = 55 pares. */
export const DEPARTMENT_TYPE_SLUGS: Readonly<
  Record<"dama" | "caballero" | "ninos" | "calzado" | "accesorios", readonly string[]>
> = {
  dama: [
    "playera", "blusa", "camisa", "sudadera", "chamarra", "sueter", "jeans", "pantalon",
    "pants", "leggings", "shorts", "falda", "vestido", "conjunto", "ropa-interior", "traje-de-bano",
  ],
  caballero: [
    "playera", "camisa", "sudadera", "chamarra", "sueter", "jeans", "pantalon",
    "pants", "shorts", "conjunto", "ropa-interior", "traje-de-bano",
  ],
  ninos: [
    "playera", "blusa", "camisa", "sudadera", "chamarra", "jeans", "pantalon",
    "pants", "leggings", "shorts", "falda", "vestido", "conjunto", "ropa-interior",
  ],
  calzado: ["tenis", "zapato", "sandalia", "bota"],
  accesorios: [
    "gorra", "bolsa", "mochila", "cartera", "cinturon", "calcetines", "lentes", "perfume", "raqueta-padel",
  ],
};

/** Texto viejo de `Product.category` → slug de tipo (solo los que no son ambiguos). */
export const LEGACY_CATEGORY_TO_TYPE: Readonly<Record<string, string>> = {
  Playeras: "playera",
  Pantalones: "pantalon",
  Hoodies: "sudadera",
  Tenis: "tenis",
  Perfumes: "perfume",
  "Raquetas de Padel": "raqueta-padel",
};

/** Estilos por tipo (spec §3.3); solo "polo" está confirmado por el dueño. */
export const STYLE_OPTIONS: Readonly<Record<string, readonly { slug: string; name: string }[]>> = {
  playera: [
    { slug: "polo", name: "Polo" },
    { slug: "cuello-redondo", name: "Cuello redondo" },
    { slug: "cuello-v", name: "Cuello V" },
    { slug: "sin-mangas", name: "Sin mangas" },
  ],
  camisa: [
    { slug: "polo", name: "Polo" },
    { slug: "de-vestir", name: "De vestir" },
    { slug: "casual", name: "Casual" },
  ],
  sudadera: [
    { slug: "con-capucha", name: "Con capucha" },
    { slug: "sin-capucha", name: "Sin capucha" },
    { slug: "con-cierre", name: "Con cierre" },
  ],
  pants: [
    { slug: "jogger", name: "Jogger" },
    { slug: "recto", name: "Recto" },
  ],
};
