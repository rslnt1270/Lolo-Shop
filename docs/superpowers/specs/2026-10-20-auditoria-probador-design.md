# Auditoría de los specs y el plan del probador virtual (modo cliente y modo personal)

- **Fecha:** 2026-10-20 · **Estado:** hallazgos para decisión del dueño · **Sin secretos** (repo público)
- **Alcance:** `probador-cliente-foto`, `probador-personal-vivo`, `probador-bajo-costo` y `plans/2026-10-19-probador-virtual-roadmap-sprints.md`, contrastados con el repo (`main` en `bed06d2`, rama `feat/next-15` del PR #17) y con la documentación oficial de Cloudflare leída hoy.
- **Contexto nuevo:** el dueño decidió **empezar en Cloudflare Workers con inversión mínima de su cuenta** para mostrar avance, y **migrar a Vercel Pro cuando el cliente acepte la propuesta**.
- **Convención:** **[V]** verificado hoy en documentación oficial o en el repo; **[NV]** no verificado; **[A]** juicio del auditor. Severidad: **Alta** (cambia una decisión o bloquea), **Media** (corregir antes de construir), **Baja** (limpieza).

---

## 1. Veredicto

Los specs son sólidos en privacidad, topes de gasto y separación de proveedores, y las cifras de Cloudflare se confirmaron. Pero **no se puede construir directamente desde ellos** por cuatro razones:

1. Están escritos para Vercel (BotID, `maxDuration`, `x-forwarded-for`, límite de 4.5 MB, Blob, AI Gateway) y la pista inicial será Cloudflare.
2. El modo personal tiene dos versiones contradictorias en los documentos (tres roles con Decart frente a solo owner con modo híbrido).
3. El modelo gratuito de Cloudflare tiene un límite de entrada que afecta la calidad y que los documentos subestiman.
4. La versión de Next en producción tiene vulnerabilidades divulgadas que el PR #17 corrige.

---

## 2. Hallazgos

### Alta

| # | Hallazgo | Evidencia | Acción |
|---|---|---|---|
| A1 | **Next 14.2.35 en producción, sin parche listado.** Cloudflare publicó el 2026-05-07 mitigaciones por vulnerabilidades de React/Next (DoS, bypass de middleware, SSRF, XSS, envenenamiento de caché) y dice que los parches son Next **15.5.16** y **16.2.5**. Next 14 no aparece. El PR #17 usa `next ^15.5.25` | [V] `developers.cloudflare.com/changelog/post/2026-05-06-react-nextjs-vulnerabilities/`; [V] `package.json` de `feat/next-15`. Que 14.x no tenga backport es **[NV]**: solo sé que no figura | Tratar el PR #17 como **tarea de seguridad**, no solo como requisito de Cloudflare. Hacer la prueba manual pendiente y mergear antes del corte de dominio |
| A2 | **Los specs asumen Vercel.** BotID (Doc-Cliente §6.4), `maxDuration` y límite de cuerpo de 4.5 MB (§6.1), IP desde `x-forwarded-for` (§6.4), Fluid Compute, Vercel Blob para `tryOnImageUrl` y AI Gateway para fotos | Specs citados; `lib/image/upload.ts` usa `@vercel/blob` | Introducir una capa de plataforma (`lib/platform/`) con tres funciones: IP del cliente, verificación anti-bot y almacenamiento de imágenes. Tabla de equivalencias en §3. El dominio del probador no debe importar nada propio de una plataforma |
| A3 | **Doc-Personal contradice la decisión del dueño.** §5.3, §11.2 pregunta 1 y §11.3 proponen owner, manager y collaborator, con Decart en vivo como base. El plan ya dice "solo owner" e híbrido, pero el spec sigue sin marca | Plan §2 y fila "Modo personal" | Añadir un aviso "Reemplazado parcialmente" al inicio de Doc-Personal y Doc-Cliente (hecho en este cambio). Fuente de verdad del modo personal: Doc-BajoCosto + plan |
| A4 | **Límite de entrada de FLUX.2 klein-4B en Cloudflare: "todas las imágenes de entrada deben ser menores de 512x512"** (estricto). Una foto de persona de cuerpo entero a 511 px pierde cara, textura y logo. Doc-BajoCosto lo menciona, pero lo trata como riesgo menor y lo usa como proveedor "estándar" del nivel A | [V] changelog del 2026-01-15 de Workers AI | El piloto (Sprint 2) debe medir klein-4B con entradas ≤ 511 px **frente a** klein-9B y a FASHN. Si klein-4B falla, el nivel A queda sin IA para clientes. No prometer al cliente "gratis" hasta ver el piloto |
| A5 | **El modo híbrido cambia la promesa de privacidad.** El dueño pidió "eliminar la fotografía". En el híbrido el fotograma sale a un tercero para procesarse. LoloShop no lo guarda, pero el tercero lo recibe | Doc-BajoCosto §6; plan D3 | Ya está como decisión D3. Mantener como **bloqueo**: sin respuesta escrita del dueño y texto de consentimiento, el modo personal no sube a producción |

### Media

| # | Hallazgo | Evidencia | Acción |
|---|---|---|---|
| M1 | **Colisión de prefijos en el middleware.** El matcher usa exclusión por prefijo (`catalogo`, `login`, `api/bot`…). Doc-Cliente propone excluir `api/probador` para que el cliente llame sin sesión. Pero Doc-Personal pone sus rutas de personal en `/api/probador/token` y `/api/probador/end`. Excluir el prefijo dejaría **las rutas del personal sin la capa de sesión del middleware** | [V] `middleware.ts` | Separar rutas: **cliente** `/api/tryon/*` (público, con enlace firmado) y **personal** `/api/probador/*` (protegido). Cada ruta verifica además sesión/rol/enlace por sí misma. Añadir un test del matcher |
| M2 | **Prisma 5.22 en Workers: resuelto en local.** El cliente estándar falla en workerd (`EvalError`). Funciona con `@prisma/client/wasm` + `@prisma/adapter-pg` + Hyperdrive, con un cliente por petición | [V] spike del 2026-10-20: lectura, escritura y login por rol sobre un Postgres local. Detalle en `2026-10-20-spike-cloudflare-workers-informe.md` | Pendiente de probar contra una rama de Neon real vía Hyperdrive |
| M3 | **Sin `prisma/migrations/` y script `db:push`.** Los specs requieren tablas nuevas (`TryOnUsage`, `ProductImageJob`, campos `tryOn*`) y CLAUDE.md exige `prisma migrate` | [V] `package.json` | Ya está en Sprint 0 (baseline antes de cualquier tabla). Para la prueba en Cloudflare usar una **rama de Neon**, nunca la base de producción |
| M4 | **Modelo de IA de fotos acoplado a AI Gateway (Vercel).** El plan fija Nano Banana 2.1 "vía Vercel AI Gateway", cuyo precio dentro del Gateway no se confirmó. Con la pista de Cloudflare ese camino requiere un proveedor que no esté atado a la plataforma | Plan §1 y §3.2; Doc-FotosIA | Mantener la interfaz de proveedor y decidir proveedor tras el piloto. Mientras tanto no contratar AI Gateway |
| M5 | **El tope "duro" gratuito de Cloudflare tiene dos errores distintos.** Al agotar las 10,000 neuronas diarias devuelve 429 con código 3036 ("cuota diaria"). También hay 429 con código 3040 ("sin capacidad"). Además, en julio de 2026 Cloudflare restringió algunos modelos al plan de pago "para priorizar capacidad" | [V] `workers-ai/platform/errors/` y changelog del 2026-07-28 | La UI debe distinguir 3036 (volver mañana) de 3040 (reintentar). Riesgo de que klein pase a requerir plan de pago: **[NV]**, vigilar el changelog |
| M6 | **Licencia de klein-9B.** Doc-BajoCosto señala pesos no comerciales y "uso comercial vía API". No hay confirmación de que Workers AI cubra el uso comercial | Doc-BajoCosto §3.1 | Preguntar por escrito a Cloudflare antes de usar el 9B en un cliente real |
| M7 | **Límite de tasa sobre Neon por cada petición.** Doc-Cliente §6.4 usa una tabla con `upsert`. En Workers cada petición agrega un viaje a Neon (latencia y conexiones) | Doc-Cliente §6.4 | Aceptable para el MVP. Alternativa en Cloudflare: Rate Limiting binding o KV. Decidir en la prueba |
| M8 | **Aviso de privacidad y marco legal siguen siendo suposición.** La LFPDPPP se cita de resúmenes y no se leyó el texto | Doc-Cliente §5, Doc-Personal §6.4 | Sin cambio: bloqueo de salida a producción del modo cliente hasta revisión de un abogado |

### Baja

| # | Hallazgo | Acción |
|---|---|---|
| B1 | Doc-Cliente §4 dice que FASHN no documenta si cobra fallos. Doc-BajoCosto lo corrigió ("los fallos no consumen créditos") | Aviso de reemplazo incluido |
| B2 | Doc-BajoCosto calcula la salida de klein-4B en 4 teselas. Con 768x1024 son 3 teselas de 512 (según precio por tesela). El cálculo queda conservador | Sin acción |
| B3 | La memoria del proyecto y el plan dicen "Vercel Pro desde el Sprint 0". El dueño cambió el orden | Actualizar el plan (adenda en §5 del plan) |

---

## 3. Equivalencias de plataforma (Vercel frente a Cloudflare)

| Necesidad | Spec (Vercel) | En Cloudflare Workers | Nota |
|---|---|---|---|
| IP del cliente | `x-forwarded-for` | `CF-Connecting-IP` | Envolver en `lib/platform/ip.ts` |
| Anti-bot | BotID | Turnstile (el entorno tiene la skill `turnstile-spin`) | Necesita sitekey y secreto nuevos |
| Tiempo máximo de la ruta | `maxDuration` | Sin tope de reloj mientras el cliente siga conectado; el límite es de CPU | Medir CPU del polling en la prueba |
| Límite de cuerpo | 4.5 MB | Mucho mayor | Mantener la reducción en cliente de todos modos |
| Almacén de prendas | Vercel Blob | R2 (o seguir usando Blob por su API REST) | Tema de la prueba |
| Modelo de imagen | AI Gateway | Binding `env.AI` de Workers AI | Sin token REST |
| Base de datos | Neon vía Prisma | Neon con adaptador serverless | Ver M2 |
| Service worker | next-pwa | Serwist (PR #17) | next-pwa no sirve en Workers |
| Dominio | CNAME gris a Vercel | Dominio personalizado del Worker en `y4ga.app` (la zona ya está en Cloudflare) | La migración posterior a Vercel Pro es un cambio de DNS, con la TTL baja |

Regla de diseño: el código de dominio (`lib/tryon/*`, `lib/probador/*`) solo recibe interfaces. Los adaptadores de plataforma viven aparte, para que el paso a Vercel Pro no toque la lógica.

---

## 4. Pista de Cloudflare: alcance y criterios de salida

**Objetivo:** mostrar avance al cliente con un costo mínimo, sin tocar producción.

**Reglas:**
- Rama desechable `spike/cloudflare-workers` en un `git worktree`, a partir de `feat/next-15` (PR #17). No toca `main` ni producción.
- Base de datos: **rama de Neon** creada por el dueño. Ningún comando contra producción.
- Secretos solo con `wrangler secret put`, tecleados por el dueño. Nada en el repo.
- Dominio: primero `workers.dev`. Un subdominio de `y4ga.app` solo con autorización expresa.

**Criterios go/no-go (todos medidos en la prueba):**
1. `opennextjs-cloudflare build` termina sin errores con la rama del PR #17.
2. Tamaño del Worker dentro del límite del plan elegido.
3. Login por rol (owner, manager, collaborator) funcionando contra la rama de Neon.
4. Movimiento de inventario ±1 por escaneo; alta de producto con foto; `/catalogo` público.
5. PWA instalable con Serwist y sin cachear rutas de API.
6. Uso de CPU por petición dentro del plan (Free: 10 ms; Paid: 30 s por defecto) [V en documentación].

**Resultado del spike local (2026-10-20):** criterios 1, 2 y 3 cumplen; 4 y 5 cumplen en parte; el 6 **no cumple en Free** porque `bcryptjs` cuesta ~67 ms de CPU por login. Ver `2026-10-20-spike-cloudflare-workers-informe.md`.

**Costo esperado:** **US$5 al mes** por Workers Paid. Free no sirve para el login. El límite de tamaño ya no es problema: desde 2026-09-04 son 64 MiB sin tope comprimido en ambos planes [V].

---

## 5. Cambios al plan por sprints

1. **Sprint 0:** agregar la tarea "Prueba de Workers (≤ 8 h)" y mover "consultas a proveedores" al margen de 10 h. D0 pasa a ser "Cloudflare interino o Vercel Pro desde ya".
2. **Sprint 1:** el corte a `loloshop.y4ga.app` sucede en la plataforma elegida en D0. Si es Cloudflare, el dominio se asigna al Worker; el paso a Vercel Pro queda como tarea de migración con TTL baja.
3. **Rutas:** separar `/api/tryon/*` (cliente) y `/api/probador/*` (personal) desde el Sprint 4.
4. **Sprint 2:** el piloto incluye klein-4B (≤ 511 px), klein-9B, Gemini 3.1 Flash Image y FASHN.

(El cambio ya está aplicado como adenda al final del plan.)

---

## 6. Lo que sí quedó confirmado hoy

- Workers AI: 10,000 neuronas diarias gratis en Workers Free y Paid, USD 0.011 por 1,000 neuronas adicionales en Paid. [V]
- klein-4B: 5.37 neuronas por tesela 512x512 de entrada y 26.05 por tesela de salida. [V]
- Hasta 4 imágenes de referencia con nombres `input_image_0..3`. [V]
- Al superar el límite diario, las operaciones fallan con error. [V]
- OpenNext en Cloudflare: middleware soportado; **Node.js en middleware, no**. El middleware de LoloShop es `next-auth/middleware` normal. [V]
- Cloudflare recomienda vinext para proyectos nuevos y OpenNext "para mantener aplicaciones existentes". [V]

## 7. Preguntas para el dueño

1. ¿Autorizas crear una **rama de Neon** solo para la prueba? (Yo no tengo acceso a Neon desde aquí.)
2. ¿Te parece bien mergear el PR #17 tras tu prueba manual, antes de cualquier despliegue de Cloudflare?
3. ¿Quieres mostrar el avance en `workers.dev` o en un subdominio de `y4ga.app`?
4. ¿Aceptas pagar US$5 al mes de Workers Paid si el Worker no cabe en el plan gratis?
