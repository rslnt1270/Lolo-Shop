# Runbook: salida a producción de la visibilidad del catálogo (subsistema H)

Documentación solamente. Nada de esto se ejecuta contra producción sin el dueño. Este archivo no contiene hosts ni credenciales: solo nombres de variables (`DATABASE_URL`, `DIRECT_URL`, `SHADOW_DATABASE_URL`). Sigue el patrón de `2026-11-salida-ventas.md`.

## Orden obligatorio

1. Respaldo y prueba de restauración.
2. Migraciones (dos pendientes): `20261111120000_add_product_types` y `20261111150008_catalog_color_visibility`.
3. Relleno de tipos: `backfill-product-types.ts` (debe ir **antes** que el de visibilidad; el script de visibilidad se detiene si ningún producto tiene tipo).
4. Relleno de visibilidad: `backfill-product-visibility.ts` (antes de desplegar el código del catálogo filtrado, o el sitio queda vacío).
5. Despliegue de código. Base primero, código después.

Regla de la lista: ningún producto queda publicado sin `publicar.csv` aprobado por el dueño. Las fotos con fondo de tienda se excluyen con `excluir.csv` para la demo; después, publicar exige fotos nuevas en fondo blanco. Los CSV viven fuera del repo en `~/respaldos/loloshop/visibilidad/`, con encabezado `id`.

## Paso manual del dueño: lista de visibilidad

1. Generar `revision.csv` (solo lectura, con `DIRECT_URL` exportada solo en la terminal):
   ```bash
   mkdir -p ~/respaldos/loloshop/visibilidad
   psql "$DIRECT_URL" --csv -c 'SELECT id, title, brand, "imageUrl" IS NOT NULL AS tiene_frente, "backImageUrl" IS NOT NULL AS tiene_atras, coalesce(trim(description), '"''"') <> '"''"' AS tiene_descripcion FROM "Product" WHERE "mergedIntoId" IS NULL ORDER BY brand, title' > ~/respaldos/loloshop/visibilidad/revision.csv
   ```
2. El dueño anota en `excluir.csv` los productos con fotos de fondo de tienda y confirma la lista por escrito (nombre y fecha). Sin confirmación, se corre sin `--publish` y todo queda sin publicar.
3. `publicar.csv`: ids con frente y atrás en fondo blanco confirmados por el dueño. Solo existe si el dueño lo aprobó. Sin encabezado `id` el script lo rechaza.

## R0. Prerrequisitos
- [ ] Rama con las dos migraciones y los dos scripts mezclada en `main`; `npm test`, `npm run test:db`, `npx tsc --noEmit` en verde.
- [ ] Paso manual del dueño resuelto (CSV aprobados o decisión de no publicar registrada).
- [ ] Ventana fuera de horario de ventas y del congelamiento del Buen Fin; responsables anotados.

## R1. Respaldo
```bash
mkdir -p ~/respaldos/loloshop
pg_dump "$DIRECT_URL" --format=custom --no-owner --file ~/respaldos/loloshop/prod-H-$(date +%F-%H%M).dump
pg_restore --list ~/respaldos/loloshop/prod-H-*.dump | head
```
Esperado: tamaño mayor que cero; la lista incluye `Product`, `Location`, `Variant`, `InventoryLevel`, `Movement`.

## R2. Prueba de restauración
```bash
pg_restore --no-owner --dbname "$SHADOW_DATABASE_URL" ~/respaldos/loloshop/prod-H-*.dump
for t in User Location Product Variant InventoryLevel Movement; do
  echo -n "$t prod: "; psql "$DIRECT_URL" -Atc "SELECT count(*) FROM \"$t\""
  echo -n "$t resto: "; psql "$SHADOW_DATABASE_URL" -Atc "SELECT count(*) FROM \"$t\""
done
```
Esperado: conteos idénticos. Si no, repetir R1. Luego vaciar la base sombra.

## R3. Drift check contra el esquema desplegado
`PREV` es el commit desplegado hoy en producción (confirmarlo en Vercel; no usar el `main` actual).
```bash
mkdir -p ~/respaldos/loloshop/tmp
PREV=<commit-desplegado>
git show "$PREV":prisma/schema.prisma > ~/respaldos/loloshop/tmp/prev.prisma
npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel ~/respaldos/loloshop/tmp/prev.prisma --exit-code; echo "codigo: $?"
```
Esperado: `No difference detected.` y `codigo: 0`. Con código 2 se detiene.

## R4. Migraciones
```bash
npx prisma migrate status    # exactamente 2 pendientes
npx prisma migrate deploy
npx prisma migrate status
```
Esperado: `Database schema is up to date!`. Si `deploy` falla a medias, no reintentar: restaurar R1 en una rama nueva y analizar.

## R5. Rellenos (con `DATABASE_URL` de producción en la misma terminal)
```bash
# R5a. Tipos, dos veces; la segunda reporta 0 en todo
npx tsx prisma/scripts/backfill-product-types.ts
npx tsx prisma/scripts/backfill-product-types.ts
# R5b. Visibilidad, dos veces
npx tsx prisma/scripts/backfill-product-visibility.ts [--publish ~/respaldos/loloshop/visibilidad/publicar.csv] [--unpublish ~/respaldos/loloshop/visibilidad/excluir.csv]
npx tsx prisma/scripts/backfill-product-visibility.ts [mismas opciones]
```
Esperado en R5b: la primera imprime `Visibilidad lista: P publicados, U despublicados, F fotos de tienda excluidas.`; la segunda, `0 publicados, 0 despublicados, 0 fotos de tienda excluidas.` Código de salida 1 = ids no encontrados o no publicables: revisar antes de seguir.

Nota: sin `--publish`, la corrida despublica todo lo publicado. En producción el catálogo ya está vacío, así que no cambia nada.

## R6. Verificación (solo lectura)
```bash
psql "$DIRECT_URL" -Atc 'SELECT count(*) FILTER (WHERE "isPublished") AS publicados, count(*) AS total FROM "Product"'
psql "$DIRECT_URL" -Atc 'SELECT name, type, "isPublic" FROM "Location" ORDER BY name'
psql "$DIRECT_URL" -Atc 'SELECT count(*) FROM "Product" WHERE "isPublished" AND ("imageUrl" IS NULL OR "backImageUrl" IS NULL OR "catalogPhotosCheckedAt" IS NULL)'
psql "$DIRECT_URL" -Atc 'SELECT count(*) FROM "Product" WHERE color IS NOT NULL'
```
Esperado: tiendas con `isPublic = t`; la tercera consulta `0`; `publicados` igual a lo aprobado; la cuarta `0`.

## R7. Despliegue de código
Solo con R4 a R6 correctos. Anotar el identificador del deploy anterior para retroceso.

## R8. Pruebas de humo
- [ ] Login como owner; `/productos` abre sin error.
- [ ] `/catalogo` muestra solo productos publicados y elegibles (fotos revisadas, descripción, existencias en tienda pública).
- [ ] `npx prisma migrate status` dice `Database schema is up to date!`.
- [ ] Runtime Logs de Vercel sin errores de Prisma durante 10 minutos.

## Retroceso
1. **Código:** promover el deploy anterior. Seguro: las columnas son nullable o tienen default.
2. **Visibilidad mal asignada (sin pérdida de datos):** `npx tsx prisma/scripts/backfill-product-visibility.ts --all-false` con `DATABASE_URL` de producción; después, volver a correr con la lista correcta.
3. **Base dañada:** `pg_restore --clean --if-exists --no-owner --dbname "$DIRECT_URL" <respaldo>` o punto en el tiempo de Neon. Se pierden ventas posteriores al respaldo; registrarlas. No reintentar el mismo día.

## Registro
- Autoriza el retroceso: ______
- Firma del dueño y hora: ______
