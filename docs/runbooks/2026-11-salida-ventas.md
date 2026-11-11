# Runbook: salida a producción del módulo de ventas (Neon + Vercel)

Lo ejecuta el dueño, con un asistente al lado. Fuente: `docs/superpowers/specs/2026-11-05-modelo-datos-er.md` §5 (decisión D2).

## Reglas antes de empezar

- **No ejecutar durante el congelamiento del Buen Fin ni en diciembre.** El paso a producción debe estar terminado antes de que empiece el Buen Fin. Durante el congelamiento solo se aplican correcciones urgentes. Si no se alcanza a terminar antes, se pospone hasta pasado el congelamiento; no se improvisa.
- **Solo en horario sin ventas** (tiendas cerradas). Avisar a los colaboradores que el sistema no se usa durante la ventana.
- **Respaldo restaurable verificado el mismo día** (Fase A). Sin respaldo verificado no se toca producción.
- Este repo es **público**. En este documento solo aparecen **nombres** de variables y marcadores como `<NEON_BRANCH_DIRECT_URL>`. Los valores reales van solo en tu terminal o en `.env` local (gitignoreado). Nunca pegarlos en el chat, en un commit ni en un issue.
- Las migraciones son aditivas: el código anterior sigue funcionando con las tablas y columnas nuevas. Por eso el retroceso de código es seguro.
- **El build de Vercel NO corre migraciones.** `package.json` solo tiene `build: next build` y `postinstall: prisma generate`; no hay `vercel.json`. Las migraciones se corren a mano, con la CLI, desde tu máquina (Node), y **antes** de desplegar el código que las usa.

## Marcadores usados

| Marcador | Qué es |
|---|---|
| `<PROD_DATABASE_URL>` | Conexión de producción con *pooler* (la misma de `DATABASE_URL` en Vercel) |
| `<PROD_DIRECT_URL>` | Conexión directa (sin pooler) de producción |
| `<NEON_BRANCH_DATABASE_URL>` / `<NEON_BRANCH_DIRECT_URL>` | Lo mismo, de la rama de Neon de prueba |
| `<NEON_SHADOW_URL>` | Base vacía desechable (otra rama de Neon) para `shadowDatabaseUrl` |

Variables que lee Prisma (`prisma/schema.prisma`): `DATABASE_URL` (app y scripts), `DIRECT_URL` (CLI de migraciones), `SHADOW_DATABASE_URL` (solo `migrate dev`, no se usa aquí).

Quién necesita `DIRECT_URL`: solo `prisma validate` y los comandos `prisma migrate …`, que corres tú desde la terminal. `next build`, `prisma generate` (el `postinstall`) y la app en Vercel **no** la usan: el cliente de Prisma se conecta con `DATABASE_URL`.

Para apuntar la terminal a un destino sin escribir valores en archivos, exporta las variables **en esa terminal** y ciérrala al terminar. Las variables de la terminal tienen prioridad sobre `.env`:

```bash
read -rsp "DATABASE_URL: " DATABASE_URL; export DATABASE_URL; echo
read -rsp "DIRECT_URL: " DIRECT_URL; export DIRECT_URL; echo
```

(`read -s` no muestra lo que pegas ni lo guarda en el historial.) Antes de cada comando de migración, confirma a qué base apuntas (Fase 0).

## Responsables (completar antes de empezar)

Sin responsable asignado, las fases A y B no empiezan (pendiente abierto del ER §5).

- Respaldo y prueba de restauración: ______
- Rama de Neon y `DIRECT_URL`: ______
- Ejecuta los comandos: ______  Acompaña: ______
- Fecha y hora de la ventana sin ventas: ______

---

## Fase 0. Comprobaciones previas (máquina local)

Rama `feat/demo-alta-lote` (o `main` si ya se mergeó), árbol limpio.

```bash
git status --short
npm ci
npx prisma validate
npm test
npx tsc --noEmit
```

Salida esperada: `git status` vacío; `npx prisma validate` dice `The schema at prisma/schema.prisma is valid`; `npm test` y `tsc` terminan sin errores (código 0).
**Continuar si:** todo en verde. Si `prisma validate` falla por variable faltante, exporta `DATABASE_URL`, `DIRECT_URL` con cualquier valor `postgresql://` ficticio solo para validar.

Función auxiliar para confirmar el destino sin imprimir la contraseña:

```bash
node -e 'for (const k of ["DATABASE_URL","DIRECT_URL"]) { const u=new URL(process.env[k]); console.log(k, u.host, u.pathname) }'
```

Salida esperada: el *host* de Neon (con `-pooler` en `DATABASE_URL`, sin él en `DIRECT_URL`) y el nombre de la base. **Verifica que el host corresponde a la rama o a producción que pretendes usar.** Si no coincide, detente.

## Fase A. Respaldo restaurable de producción (paso 0 del ER)

Hacerlo el mismo día de la ventana. Guardar el volcado **fuera del repo** (por ejemplo `~/respaldos/loloshop/`), nunca dentro de la carpeta del proyecto.

```bash
mkdir -p ~/respaldos/loloshop
pg_dump "$DIRECT_URL" --format=custom --no-owner \
  --file ~/respaldos/loloshop/prod-$(date +%F-%H%M).dump
ls -lh ~/respaldos/loloshop/
pg_restore --list ~/respaldos/loloshop/prod-*.dump | head
```

(Con `DIRECT_URL` apuntando a **producción** en esta terminal.) Salida esperada: sin errores; archivo `.dump` con tamaño mayor que cero; `pg_restore --list` muestra las tablas (`User`, `Location`, `Product`, `Variant`, `InventoryLevel`, `Movement`).

Además, anotar en la consola de Neon la hora actual y confirmar que la restauración a un punto en el tiempo está disponible en el plan (ventana de retención). Es un segundo respaldo, no sustituye al volcado.

**Prueba de restauración (obligatoria):** crear una base vacía (rama de Neon nueva o `<NEON_SHADOW_URL>`), restaurar ahí y comparar conteos.

```bash
pg_restore --no-owner --dbname "<NEON_SHADOW_URL>" ~/respaldos/loloshop/prod-*.dump

for t in User Location Product Variant InventoryLevel Movement; do
  echo -n "$t prod: "; psql "$DIRECT_URL" -Atc "SELECT count(*) FROM \"$t\""
  echo -n "$t resto: "; psql "<NEON_SHADOW_URL>" -Atc "SELECT count(*) FROM \"$t\""
done
```

Salida esperada: pares de números idénticos por tabla.
**Continuar si:** la restauración no dio errores y **todos los conteos coinciden**. Si no, repetir el respaldo; no pasar a la siguiente fase.

Después de la prueba, vaciar o borrar la rama usada para restaurar (la base sombra debe quedar vacía si se va a usar como tal).

## Fase B. Rama de Neon desde producción (pasos 1 y 2 del ER)

1. En la consola de Neon, crear una rama desde producción (nombre sugerido `ventas-prueba`). Copiar su conexión con *pooler* y su conexión directa **solo a tu terminal o a `.env` local**.
2. **`DIRECT_URL` no se añade a Vercel.** El build (`next build`), `prisma generate` y la app no la necesitan; solo la usan `prisma validate` y `prisma migrate`, que se corren desde tu terminal. En particular, **nunca** pongas la conexión directa de producción en el entorno **Preview**: un preview con esa variable podría migrar o escribir en producción por error. El Preview usa solo los valores de la **rama** de Neon (Fase D).
3. Exportar en tu terminal los valores de la **rama** (`<NEON_BRANCH_DATABASE_URL>` y `<NEON_BRANCH_DIRECT_URL>`) como se mostró arriba y verificar el *host* con la función auxiliar de la Fase 0.

**Continuar si:** la rama existe y la terminal apunta a la rama.

## Fase C. Ensayo completo en la rama (pasos 3 a 5 del ER)

Terminal apuntando a la **rama**. El baseline `0_init` ya está en el repo (SQL generado por Prisma con `migrate diff`, no escrito a mano; ruling R6); aquí solo se marca y se aplica.

### C1. Detección de drift contra el baseline

Compara la base real con el esquema **tal como era al crearse `0_init`** (commit `2cd54f6`), porque el esquema actual ya incluye tablas nuevas que aún no existen en la base.

```bash
mkdir -p ~/respaldos/loloshop/tmp
git show 2cd54f6:prisma/schema.prisma > ~/respaldos/loloshop/tmp/baseline.prisma
npx prisma migrate diff \
  --from-url "$DIRECT_URL" \
  --to-schema-datamodel ~/respaldos/loloshop/tmp/baseline.prisma \
  --exit-code
echo "codigo de salida: $?"
```

Salida esperada: `No difference detected.` y `codigo de salida: 0`.
**Continuar si:** código 0. Con código 2 se imprime un resumen de diferencias: la base difiere del esquema (residuos de `db push`). **Detenerse**: se corrige el esquema (no la base) y se vuelve a probar; consultar antes de seguir.

### C2. Marcar el baseline como aplicado (no ejecuta SQL)

```bash
npx prisma migrate resolve --applied 0_init
```

Salida esperada: `Migration 0_init marked as applied.`

### C3. Aplicar las migraciones nuevas

```bash
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
```

Salida esperada: el primer `status` lista `*_add_brand_department`, `*_add_sales` y `*_add_product_description_back_image` como pendientes (`Following migrations have not yet been applied`); `deploy` termina con `All migrations have been successfully applied.`; el segundo `status` dice `Database schema is up to date!`.
**Continuar si:** `up to date`. Si `deploy` falla a medias, no reintentar a ciegas: la rama se descarta y se recrea desde producción (Fase B), y se analiza el error.

### C4. Relleno de datos (idempotente)

Usa `DATABASE_URL` (la de la rama).

```bash
npx tsx prisma/scripts/backfill-brand-department.ts
```

Salida esperada: `Relleno listo: N marcas, M productos, 5 departamentos nuevos.` (N = marcas distintas en `Product.brand`; M = productos con marca o código asignado.)
Repetirlo: debe imprimir `Relleno listo: 0 marcas, 0 productos, 0 departamentos nuevos.` (prueba de idempotencia).

Revisar la lista de marcas con el dueño (riesgo: el relleno agrupa mal variantes de escritura):

```bash
psql "$DIRECT_URL" -c 'SELECT name, slug FROM "Brand" ORDER BY name'
psql "$DIRECT_URL" -Atc 'SELECT count(*) FROM "Product" WHERE "publicCode" IS NULL'
psql "$DIRECT_URL" -c "SELECT key, value FROM \"AppSetting\""
```

Salida esperada: marcas sin duplicados evidentes; `0` productos sin `publicCode`; `lowStockThreshold` con valor `2`.
**Continuar si:** el dueño aprueba la lista de marcas.

### C5. Usuarios y tiendas (solo si el ensayo usará inicio de sesión)

Los usuarios de la rama vienen copiados de producción. Verificar cada colaborador (sin él no puede vender):

```bash
psql "$DIRECT_URL" -c 'SELECT u.username, u.role, l.name AS tienda FROM "User" u LEFT JOIN "Location" l ON l.id = u."locationId" ORDER BY u.role, u.username'
```

Salida esperada: cada `collaborator` con una `tienda` no vacía; `owner` y `manager` pueden aparecer sin tienda (el manager sin tienda ve todas). Si hay contraseñas de desarrollo en producción, usar `reset-users.ts` (ver Fase F, paso 2).

## Pooler de Neon (1.11)

La app en Vercel (funciones serverless) se conecta **siempre** por el *pooler* de Neon (PgBouncer en modo transacción). Con Prisma 5.22 (motor con parámetros en la URL), la `DATABASE_URL` con *pooler* lleva estos parámetros de consulta. Aquí solo van los **nombres**; los valores reales viven en Vercel y en tu terminal.

| Parámetro | Para qué | Fuente |
|---|---|---|
| `pgbouncer=true` | Prisma deja de usar sentencias preparadas con nombre, que PgBouncer no comparte entre clientes. La guía lo pide para PgBouncer anterior a 1.21.0; con versiones nuevas y `max_prepared_statements` > 0 es opcional, pero no estorba. | Prisma, "Configure Prisma Client with PgBouncer" (v6) |
| `connection_limit` | Tamaño del pool **por instancia** de `PrismaClient`. En serverless la guía recomienda empezar con `1` y subir solo si hace falta. | Prisma, "Connection pool" (v6), sección serverless |
| `pool_timeout` | Segundos que una consulta espera una conexión libre del pool (por omisión 10). Si se agota, Prisma lanza P2024; la app lo muestra como "La base tardó en responder; reintenta." Dejar el valor por omisión salvo que el ensayo muestre P2024. | Prisma, "Connection pool" (v6) |
| `connect_timeout` (opcional) | Segundos para abrir la conexión. Neon apaga el cómputo sin uso y tarda unos segundos en despertar; subirlo evita fallos en frío. | Neon, "Connect from Prisma to Neon" |

Notas:

- **Verificado el 2026-11-10** en la documentación vigente de Prisma ORM **v6** (la de v7 se publica para el adaptador nuevo, donde `connection_limit` y `pool_timeout` ya no tienen efecto). Prisma 5.22 usa el mismo motor de consultas con parámetros en la URL que v6; **por confirmar** contra una página específica de 5.x, que ya no se publica aparte. Si se migra a Prisma 7 (con adaptador), estos parámetros dejan de aplicarse y el pool se configura en el adaptador.
- Las transacciones interactivas de stock, alta, precio, unión y ventas usan `maxWait` 5 s y `timeout` 10 s (`lib/data/tx-options.ts`). Con `connection_limit=1`, una transacción ocupa la única conexión de la función mientras dura.
- **`DIRECT_URL` solo en local y en migraciones.** Es la conexión sin *pooler*; la usan `prisma validate` y `prisma migrate …` desde tu terminal (`directUrl` de `prisma/schema.prisma`). Nunca va en Vercel (ni Production ni Preview): la app, `next build` y `prisma generate` no la necesitan.
- Comprobación rápida, sin imprimir valores: el *host* de `DATABASE_URL` debe tener `-pooler` (Fase 0) y la consulta debe traer los parámetros:
  ```bash
  node -e 'const u=new URL(process.env.DATABASE_URL); console.log(["pgbouncer","connection_limit","pool_timeout","connect_timeout"].map(k=>k+"="+(u.searchParams.has(k)?"sí":"no")).join(" "))'
  ```

## Fase D. Preview de Vercel contra la rama (paso 6 del ER)

1. En Vercel, configurar para el entorno **Preview** `DATABASE_URL` con la conexión de la **rama** con *pooler* (`<NEON_BRANCH_DATABASE_URL>`, nunca la de producción), además de `NEXTAUTH_SECRET`, `NEXTAUTH_URL` del preview, `BOT_API_KEY`, `BLOB_READ_WRITE_TOKEN` y `WHATSAPP_APP_SECRET`. `DIRECT_URL` no hace falta. Anotar los valores que tenía Preview para devolverlos al terminar.
2. Desplegar la rama `feat/demo-alta-lote` (push o `vercel deploy` sin `--prod`) y esperar a que el build termine en verde.
3. Pruebas de humo en la URL del preview (lista de la Fase G, pero sobre la rama).

**Continuar si:** build en verde y todas las pruebas de humo de la Fase G pasan en el preview.

## Fase E. Visto bueno del dueño

Registro, antes de tocar producción:

- [ ] Respaldo de hoy restaurado y conteos iguales (Fase A)
- [ ] Ensayo en la rama sin errores (Fase C) y lista de marcas aprobada
- [ ] Preview probado (Fase D)
- [ ] Estamos en horario sin ventas y **fuera del congelamiento del Buen Fin**
- [ ] Responsables y hora anotados arriba

Firma del dueño y hora: ______

## Fase F. Producción (repite C y despliega)

Orden obligatorio: **primero la base, después el código**. En una terminal nueva (cerrar la anterior para no arrastrar variables de la rama), exportar los valores de **producción** y verificar el *host* con la función auxiliar de la Fase 0.

1. **Respaldo fresco** si pasó tiempo desde la Fase A (el mismo día y sin ventas entre medias): si hubo ventas o cambios, repetir la Fase A.
2. **Usuarios de producción** (solo si aún usan contraseñas de desarrollo del seed; CLAUDE.md lo exige): con `SEED_PASSWORD_LOLO`, `SEED_PASSWORD_ENCARGADO`, `SEED_PASSWORD_COLAB1`, `SEED_PASSWORD_COLAB2` definidas en tu `.env` local (nunca las del seed del repo público):
   ```bash
   npx tsx prisma/scripts/reset-users.ts
   ```
   Si hay más de una tienda, indicar `LOCATION_COLAB1` y `LOCATION_COLAB2` con el nombre de cada tienda. Salida esperada: líneas de usuarios creados o actualizados sin error.
3. **Drift contra producción** (igual que C1 pero con producción): sale `No difference detected.` y código 0. Si no, detenerse.
4. **Baseline** (no ejecuta SQL):
   ```bash
   npx prisma migrate resolve --applied 0_init
   ```
   Salida esperada: `Migration 0_init marked as applied.`
5. **Migraciones**:
   ```bash
   npx prisma migrate deploy
   npx prisma migrate status
   ```
   Salida esperada: `All migrations have been successfully applied.` y luego `Database schema is up to date!`.
6. **Relleno**: `npx tsx prisma/scripts/backfill-brand-department.ts` con `DATABASE_URL` de producción. Salida: `Relleno listo: ...` con las mismas cifras que en el ensayo (salvo cambios de catálogo desde entonces).
7. **Variables en Vercel (Production)**: confirmar que existen `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `BOT_API_KEY`, `BLOB_READ_WRITE_TOKEN` y **`WHATSAPP_APP_SECRET`** (sin ella el webhook de WhatsApp no valida la firma de Meta y acepta mensajes de cualquiera). `DIRECT_URL` no hace falta en Vercel. Si en la Fase D cambiaste valores de Preview, devolverlos a su estado original.
8. **Desplegar el código**: mergear `feat/demo-alta-lote` a `main` (Vercel despliega a Production) o promover el deploy verificado. Esperar build en verde. Anotar el identificador del deploy **anterior** (para el retroceso).

**Continuar si:** `migrate status` dice `up to date` y el build de producción es verde.

## Fase G. Pruebas de humo (en el preview en la Fase D; en producción tras la F)

- [ ] Iniciar sesión como **owner**.
- [ ] En `/pos`, registrar una **venta en efectivo** de una prenda real o de prueba (anotar el SKU y el stock antes).
- [ ] La venta aparece en `/ventas` con el importe correcto y el stock bajó en 1.
- [ ] Anular esa venta de prueba como owner: en `/ventas`, sección **"Ventas de hoy"**, pulsar **Anular** en su folio, escribir el motivo ("Prueba de salida") y responder **Sí** a "¿La prenda regresó a la tienda?". La venta desaparece de la lista y el stock vuelve al valor anotado. (Si la venta es real, no anularla y dejar constancia.)
- [ ] `/catalogo` **no muestra SKU ni cantidades de stock**.
- [ ] `/api/bot/products` con la cabecera de `BOT_API_KEY` responde y **no incluye SKU ni conteos de stock** (usa tu clave desde una variable de la terminal, sin imprimirla):
      ```bash
      curl -s -H "x-bot-key: $BOT_API_KEY" https://<DOMINIO>/api/bot/products | head -c 600
      ```
      La cabecera es `x-bot-key` (ver `app/api/bot/products/route.ts`). Sin clave debe responder 401.
- [ ] Cada **collaborator** tiene tienda asignada (consulta de C5 contra producción) y puede iniciar sesión y vender en `/pos` solo en su tienda.
- [ ] Una venta SPAY aparece como pendiente y owner/manager puede confirmarla.
- [ ] `npx prisma migrate status` contra producción dice `Database schema is up to date!`.
- [ ] Sin errores en Vercel (Runtime Logs) durante 10 minutos tras las pruebas.

### Guion de la demo: orden de los pasos con datos de `ventas-prueba`

1. **Primero asignar departamentos** en `/productos` (seleccionar y "Asignar departamento") a los productos viejos que no lo tienen.
2. **Después unir duplicados** en `/productos/unir`. La pantalla agrupa por marca, título sin talla y departamento: si se une antes de asignar, los productos sin departamento quedan en su propio grupo y luego no coinciden con los que sí lo tienen. Al unir, las tallas "U" toman la talla escrita al final del título ("Polo - M" → M); revisar el aviso "Quedarán dos tallas…" antes de confirmar.
3. Comprobar en `/ventas` que las cifras son iguales antes y después de unir.

Si alguna casilla falla, evaluar: si es un fallo de código sin datos corruptos, retroceder el deploy (opción 1 abajo); si hay datos dañados, restaurar (opción 2).

## Operación durante el Buen Fin

- **Desactivar la suspensión automática de Neon** (consola de Neon, rama de producción, *Compute*: "Scale to zero"/autosuspend desactivado) desde la víspera hasta que termine el Buen Fin. Con la suspensión activa, el primer cobro tras unos minutos sin uso espera a que la base despierte; con dos tiendas cobrando a la vez eso se nota en caja y puede acabar en "El servidor tardó en responder. Intenta cobrar de nuevo." Al terminar el Buen Fin, volver a activarla (cuesta horas de cómputo).
- Si un cobro responde "El servidor tardó en responder", pulsar **Cobrar** otra vez sin cambiar el carrito: el mismo identificador evita duplicar la venta.

## Retroceso

Decidirlo **antes de empezar** y escribir aquí quién lo autoriza: ______

**Opción 1. Solo código (lo más común).** Las migraciones son aditivas, así que el código anterior funciona con el esquema nuevo.
En Vercel, Deployments, elegir el deploy de producción anterior a la salida y **Promote to Production** (o `vercel rollback`). Esperar a que esté activo y probar el inicio de sesión y `/catalogo`.

**Opción 2. Datos (la base quedó mal).** Hacerlo con las tiendas cerradas y con el deploy anterior ya promovido.
1. Dejar de operar contra producción (pausar ventas).
2. Restaurar el respaldo de la Fase A: con una **rama de Neon nueva** o la base de producción vaciada, `pg_restore --clean --if-exists --no-owner --dbname "<PROD_DIRECT_URL>" ~/respaldos/loloshop/prod-FECHA.dump`, o la restauración a un punto en el tiempo de Neon a la hora anotada antes de la Fase F.
3. Si se restauró a una rama nueva, apuntar `DATABASE_URL` y `DIRECT_URL` de Vercel Production a ella.
4. Redesplegar el deploy anterior (Opción 1) y repetir las pruebas de la Fase G (sin las de ventas).
5. Se pierden las ventas hechas después del respaldo: registrar cuáles para reingresarlas.

Después de cualquier retroceso, no reintentar la salida el mismo día; analizar la causa y volver a empezar por la Fase A.

## Registro de la salida del 2026-11-10

La salida a producción se adelantó al 2026-11-10 por pedido del dueño. Pasos:
- **Fase A:** respaldo con `pg_dump` y restauración de prueba. Los conteos coincidieron. Los 3 avisos de roles de Neon al restaurar son inofensivos.
- **Fase C/F:** drift 0, 4 migraciones aditivas sobre `0_init`, relleno de 5 departamentos y 1 marca, y `reset-users.ts` con las contraseñas de producción.
- **Despliegue:** merge de los PR #29 y #32 y despliegue a Production.
- **Pooler (1.11):** `DATABASE_URL` de Production apunta al host `-pooler`. Vercel la guarda como **sensible**, así que `vercel env pull` no la puede bajar: para regenerarla se parte de la conexión directa del `.env` local.
- **Fase G:** login de owner, manager y los 2 colaboradores; `/productos` y `/escanear` responden 200; `/catalogo` no muestra SKU; el bot responde 401 sin clave.
- **Retroceso:** promover en Vercel el deploy de producción anterior a la salida (`lolo-shop-apuutni7x`). Las migraciones son aditivas, así que la base no se toca.

## Limpieza al terminar

- Cerrar las terminales con variables exportadas.
- Borrar la rama de Neon de prueba y la base sombra cuando ya no hagan falta.
- Conservar el volcado de la Fase A al menos 30 días, fuera del repo.
- Registrar en `CLAUDE.md` (sección de seguridad/despliegue) que el módulo de ventas está en producción, solo con la fecha, sin valores.
