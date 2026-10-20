# Integrar la PWA de LoloShop al dominio y4ga.app: investigación y propuesta

**Fecha:** 2026-10-19
**Rol:** arquitectura / DevOps
**Clasificación:** spike. El entregable es una recomendación. No se cambió DNS, Vercel, Cloudflare ni código.
**Repo:** `rslnt1270/Lolo-Shop` (público). Este documento no contiene valores de secretos; los nombres de variables sí aparecen.

> **Convención de evidencia.** **[V]** = verificado hoy, con un comando, una lectura de API en modo solo lectura o la documentación oficial citada. **[C]** = lo afirma el proveedor o un tercero y no se comprobó por separado. **[NV]** = no verificado: hay que confirmarlo antes de actuar. **[A]** = supuesto o decisión del autor.

---

## 1. Resumen y recomendación

**Recomendación (Opción 1):** mantener LoloShop en **Vercel + Neon + Vercel Blob** y publicarlo como **`loloshop.y4ga.app`**. El registro debe ser un `CNAME` en Cloudflare **solo DNS (nube gris)**, apuntando al destino que muestre Vercel. `lolo-shop.vercel.app` sigue funcionando durante una ventana de transición y después redirige con 308 al dominio nuevo. Hay que pasar el proyecto al **plan Pro de Vercel (US$20/mes)**, porque LoloShop es una tienda: el plan Hobby no permite uso comercial. Ese incumplimiento ya existe hoy y no depende del dominio.

Por qué esta opción:
- Es la única que mantiene el punto de venta disponible las 24 horas. La Raspberry Pi 5 **va montada en un coche** y está arriba unas 10-14 h al día [V, doc homelab §3.1]. Un punto de venta y un webhook de WhatsApp no aguantan eso.
- El cambio es **reversible en minutos**. Solo se añade un CNAME y un dominio en Vercel; no hay migración de datos.
- No afecta a `y4ga.app` raíz. El Worker `y4ga` solo tiene rutas `y4ga.app/*`, `www.y4ga.app/*` y `poleana.y4ga.app/api/v1/poleana/*`, y no hay comodín DNS [V].
- La nube gris evita tres problemas reales de la zona: el TLS mínimo 1.3, la regla "Always Use HTTPS" que interfiere con el reto HTTP-01 de Vercel y la doble caché frente al service worker (§4.1).

**Alternativa, si el dueño no acepta pagar Pro:** no conviene la Pi. Habría que evaluar **Cloudflare Workers con OpenNext/vinext** (plan de pago desde US$5/mes [C]), lo que exige adaptar Prisma al driver serverless de Neon y migrar la PWA. Es un proyecto aparte con su propio spike [NV]. Quedarse en Hobby con una tienda incumple los términos de Vercel [V] y no se recomienda.

**Opción 2 (Pi):** se descarta mientras la Pi viaje en el vehículo. **Opción 3 (escalonada):** se acepta como hoja de ruta, con puertas de entrada verificables (§7, fase C). La recomendación de este documento coincide con la revisión de `@agent-architect` en el doc del homelab ("F6 LoloShop es valor negativo").

---

## 2. Estado actual verificado (2026-10-19)

### 2.1 DNS y zona Cloudflare `y4ga.app` [V]
Fuentes: `dig` y la API de Cloudflare en modo solo lectura.

| Elemento | Valor |
|---|---|
| NS | `shane.ns.cloudflare.com`, `joselyn.ns.cloudflare.com` |
| Plan de la zona | **Free Website** |
| SSL/TLS | **Full (strict)** |
| Always Use HTTPS | **on** |
| TLS mínimo | **1.3** (afecta solo a hostnames con proxy) |
| Automatic HTTPS Rewrites | on |
| `y4ga.app`, `www` | AAAA con proxy y Worker `y4ga` (assets + CSP) |
| `api.y4ga.app`, `n8n-local.y4ga.app`, `api-aws.y4ga.app` | CNAME a `*.cfargotunnel.com` (tres túneles distintos) |
| `poleana.y4ga.app`, `p.y4ga.app` | CNAME a Cloudflare Pages |
| `logistic-y4ga`, `uber` | AAAA con proxy |
| `loloshop.y4ga.app`, `tienda.y4ga.app` | **No existen** |
| Comodín `*.y4ga.app` | **No existe** (`zzz-test.y4ga.app` no resuelve) |
| MX | Cloudflare Email Routing (`route{1,2,3}.mx.cloudflare.net`) + DKIM `cf2024-1` + SPF |
| CAA | No hay registros, así que cualquier CA puede emitir; Let's Encrypt de Vercel no queda bloqueado |
| `_vercel` TXT | No existe |

### 2.2 Vercel [V]
- Equipo: "yortega316197595-6380's projects". El nombre sugiere una cuenta personal, probablemente **Hobby** [NV: confirmar en Settings → Billing].
- Proyecto `lolo-shop`: su único dominio es **`lolo-shop.vercel.app`** (verificado, sin redirect).
- `GET https://lolo-shop.vercel.app/` devuelve `307` a `/api/auth/signin?callbackUrl=%2F`. La app está viva.

### 2.3 Aplicación [V, lectura de código en `main` @ `dff0e1b`]
| Pieza | Estado | Relevancia para el dominio |
|---|---|---|
| Next.js | `^14.2.35` con `next-pwa ^5.6.0`. El PR #17 (pendiente) migra a Next 15.5 + React 19 + **Serwist** (`app/sw.ts`) | El SW cambia de implementación. Conviene no mezclar ambos cambios en el mismo corte (§7) |
| `public/manifest.json` | `start_url: "/"`, sin `id` ni `scope` | La identidad de la PWA depende del origen, así que el cambio de origen equivale a una app nueva (§4.2) |
| `next.config.mjs` | Sin `headers()`, sin `images.remotePatterns` | La CSP y Permissions-Policy del probador se añadirán aquí |
| `middleware.ts` | `next-auth/middleware`. Excluye `login`, `catalogo`, `api/auth`, `api/whatsapp`, `api/bot`, `sw.js`, `workbox`, `manifest.json`, `icons` | Es el sitio natural para una redirección por `Host` durante la transición |
| Auth | next-auth v4, **solo CredentialsProvider**, `session: jwt`, `pages.signIn: /login` | **No hay OAuth**, así que no hay callbacks que registrar en terceros |
| Webhook WhatsApp | `app/api/whatsapp/webhook/route.ts` | **Tiene 5 URLs fijas `https://lolo-shop.vercel.app/catalogo`** en los mensajes al cliente (líneas 127-147). Hay que parametrizarlas antes del corte |
| Bot n8n | `app/api/bot/products` con cabecera `x-bot-key` = `BOT_API_KEY` | n8n tiene la URL base configurada en su workflow. No pude verificarla: el MCP `n8n-local` respondió 401 |
| Imágenes | `@vercel/blob` (dominio `*.public.blob.vercel-storage.com`) | No dependen del dominio de la app |
| `.env.example` | `NEXTAUTH_URL="http://localhost:3000"` | El valor en Vercel probablemente sea `https://lolo-shop.vercel.app` [NV] |

### 2.4 Homelab RPi5 [V, según `Project_Y4GA_/docs/investigacion/2026-09-02-integracion-rpi5-homelab.md` y `RESUMEN_SESION_2026-08-31_MIGRACION_RPI5.md`]
- La Pi **va en el vehículo**, con un UPS X1202. Está arriba unas **10-14 h al día** y cae de madrugada. El fundador lo aceptó para YAGA. El mismo documento califica el impacto en LoloShop como **"Alto: una tienda cerrada de madrugada pierde ventas"**.
- **El NVMe no está cifrado** (ext4 sin LUKS) en un equipo robable. El doc dice explícitamente "no meter datos de terceros (Flota, LoloShop)" hasta tener LUKS.
- **El controlador `memory` de cgroups está deshabilitado** porque lo inyecta el firmware, así que `mem_limit` se ignora sin aviso. Con `numa=fake=8`, Ollama puede disparar el OOM killer contra Postgres. Es un prerrequisito explícito de F4-F6.
- El 2026-08-31 la migración **arrancó las BD en limpio y perdió el histórico de producción**: no había backup de EC2 y no se siguió el runbook. Las copias de la Pi siguen siendo locales en el mismo NVMe y falta el destino remoto.
- Las dos EC2 siguen `stopped` como retroceso. El túnel `cloudflared` usa `:latest` y su ingress solo está en el dashboard, sin IaC.

---

## 3. Comparativa de opciones

| Criterio | **Opción 1: Vercel + subdominio** | **Opción 2: self-host en la Pi con Cloudflare Tunnel** | **Opción 3: escalonada** |
|---|---|---|---|
| Disponibilidad | Plataforma gestionada siempre encendida. Neon y Blob gestionados | **~10-14 h/día** mientras la Pi esté en el coche. IP residencial o LTE sin SLA | La de la Opción 1 hasta que se cumplan las puertas |
| Trabajo para el corte | Bajo: 1 CNAME, 1 dominio en Vercel, 3-4 variables de entorno y un PR pequeño | Alto: contenedor standalone ARM64, Postgres, MinIO, migración de imágenes, CI/CD, backups, monitoreo | Bajo ahora y alto después, solo si se activa |
| Riesgo de datos | Bajo (sin migración) | **Alto**: la migración del 08-31 perdió la BD; disco sin cifrar | Controlado por las puertas |
| Seguridad | TLS de Vercel, sin tocar la zona | WAF ModSecurity existente y túnel sin puertos abiertos [V], pero disco sin cifrar y cgroups rotos | n/a |
| Uso comercial | **Requiere Pro** | No aplica (self-host) | Requiere Pro mientras siga en Vercel |
| Reversibilidad | Inmediata (`vercel.app` sigue vivo) | Lenta (hay que volver a sincronizar los datos a Neon) | Alta |
| Webhook de Meta | Estable | Meta reintenta durante 36 h y luego descarta [V]. Con 10-14 h de caída diaria se pierden mensajes | Estable |
| Costo directo/mes | ~US$20 | ~US$0 de plataforma (más tiempo de operación) | ~US$20 |
| Impacto en `y4ga.app` raíz | Ninguno | Comparte host, Postgres, RAM y túnel con YAGA, así que un OOM tumba ambos | Ninguno ahora |

### 3.1 Opción 1: Vercel con `loloshop.y4ga.app`

**DNS y proxy.** Para subdominios con DNS externo, Vercel pide un `CNAME` con un valor propio del proyecto, del tipo `xxxx.vercel-dns-0NN.com`, que se muestra en Settings → Domains. Si el dominio "está en uso por otra cuenta de Vercel", pide además un `TXT` en `_vercel.y4ga.app` [V: <https://vercel.com/docs/domains/working-with-domains/add-a-domain>]. `y4ga.app` no está en Vercel, así que probablemente baste el CNAME [NV].

**Nube gris o naranja.** Vercel dice: *"We recommend connecting directly where possible"* y *"You can keep Cloudflare as your DNS provider without enabling its reverse proxy"* [V: <https://vercel.com/kb/guide/cloudflare-with-vercel>]. Si se usa proxy, Vercel pide:
- **Full (strict)**, nunca Flexible, porque Flexible provoca un bucle de redirecciones. La zona ya está en strict [V].
- **Dejar pasar el reto HTTP-01** en el puerto 80 y excluir `/.well-known/acme-challenge/*` de redirecciones y challenges. La zona tiene **Always Use HTTPS = on**, así que habría que añadir una regla de excepción.
- **Empezar sin caché externa** y no cachear nunca `/.well-known/vercel/*`. Una caché de Cloudflare no se invalida con cada deploy de Vercel y puede servir HTML viejo que apunta a assets inexistentes. Con un SW encima, el riesgo es doble.
- Detrás de un proxy, *"The Bot Protection managed ruleset does not work"*, y el firewall de Vercel pierde señales.

Además, la zona tiene **TLS mínimo 1.3**. Con nube naranja, cualquier cliente que solo hable TLS 1.2 no conecta. Eso incluye Android 9 o anterior y algunos lectores o terminales viejos [C: Android añadió TLS 1.3 en la API 29]. Con nube gris, el TLS lo negocia Vercel y no hereda esa política.

**Decisión: nube gris** [A]. Cloudflare sigue siendo el DNS autoritativo y el resto de la zona no cambia.

**Certificado.** Con nube gris, Vercel emite y renueva Let's Encrypt por HTTP-01 sin intervención [C, comportamiento estándar de Vercel]. No hay CAA que lo bloquee [V].

**Redirección de `lolo-shop.vercel.app`.** En Settings → Domains → Edit → "Redirect to", con varios dominios en el proyecto [V: <https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting>]. Que se pueda aplicar al dominio `*.vercel.app` lo afirma un tercero, no la documentación oficial [C: <https://johnkavanagh.co.uk/articles/redirect-a-default-vercel-subdomain-to-your-custom-domain/>]. La alternativa es una redirección en `middleware.ts` por cabecera `Host`, que además permite excluir `/sw.js`, `/api/whatsapp` y `/api/bot` durante la transición. **Recomiendo el middleware** [A] (§4.2).

**Plan Hobby y uso comercial.** [V: <https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage>]
> "Hobby teams are restricted to non-commercial personal use only. All commercial usage of the platform requires either a Pro or Enterprise plan."

Entre los ejemplos que da: *"Advertising the sale of a product or service"* y *"Any method of requesting or processing payment"*. LoloShop tiene catálogo público, apartado de prendas por WhatsApp y punto de venta, así que **es comercial**. Pro cuesta **US$20/mes e incluye US$20 de crédito de uso** [V: <https://vercel.com/pricing>]. Hobby admite hasta 50 dominios por proyecto [V], así que el dominio en sí no obliga a cambiar de plan. Lo que obliga es el uso comercial.

### 3.2 Opción 2: self-host en la RPi5 con Cloudflare Tunnel

Cambios necesarios, en el orden del doc del homelab (F3, luego cgroups, F4, F6):

| Área | Cambio |
|---|---|
| Prerrequisitos | **LUKS2** en el NVMe, **cgroup memory** habilitado (el flag viene del firmware), apagado limpio del UPS, 30 días limpios, backup remoto 3-2-1 **con restauración probada** |
| Runtime | `output: "standalone"` en `next.config`, imagen `node:22-slim` arm64 y `next start` en un contenedor con `mem_limit≈640m` (que sin cgroups no se aplica) |
| Build ARM64 | GitHub Actions con `docker buildx` (QEMU) o runner arm64 nativo, publicado en GHCR. Prisma con `binaryTargets = ["native","linux-arm64-openssl-3.0.x"]` [NV: confirmar la variante de OpenSSL de la imagen]. Los runners arm64 gratuitos para repos públicos están por confirmar [NV] |
| Despliegue continuo | Hoy es push a `main` y Vercel despliega solo. En la Pi haría falta pull de imagen con tag fijo vía SSH por Cloudflare Access o un agente tipo Watchtower, más un *health gate* y retroceso a la imagen anterior. Sin previews por PR |
| Base de datos | `loloshop_db` + `loloshop_user` en `yaga_postgres`. Migración `pg_dump` (Neon) → `pg_restore`, conteo de filas por tabla y `prisma migrate status` |
| Imágenes | Blob → MinIO (bucket `loloshop-productos`), reescribir `lib/image/upload.ts` con SDK S3 y `forcePathStyle`, **reescribir todas las `Product.imageUrl`** y exponer MinIO por el túnel |
| Bot WhatsApp / n8n | El doc del homelab ya concluye que "Meta reintenta y termina deshabilitando un webhook que cae 10-14 h/día". n8n en la Pi sirve para automatizaciones internas, no como puerta de clientes |
| Monitoreo | Uptime externo (los health checks de Cloudflare son de pago [NV]), alerta del túnel, espacio en disco, `pg_dump` OK |
| Túnel | Nuevo ingress `loloshop.y4ga.app → http://loloshop:3000` en el túnel de la Pi, que hoy solo está en el dashboard sin IaC. Tag de `cloudflared` fijado (hoy usa `latest`) |

**Límites de Cloudflare (plan Free) relevantes:**
- Cuerpo de petición máximo de **100 MB** en Free; por encima devuelve 413 [V: <https://developers.cloudflare.com/workers/platform/limits/#request-limits>]. Las fotos de producto ya se comprimen en el cliente, así que no es un problema.
- Hasta 1.000 túneles por cuenta y **25 réplicas** por túnel; los hostnames públicos solo están limitados por el tamaño de configuración de 1 MB [V: <https://developers.cloudflare.com/cloudflare-one/account-limits/>]. Las réplicas no ayudan, porque solo hay una Pi.
- Si el origen tarda más de 100 s, devuelve un **timeout 524** en planes no Enterprise [NV hoy: <https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/>].
- WebSockets están soportados con proxy en todos los planes [NV hoy: <https://developers.cloudflare.com/network/websockets/>]. LoloShop no los usa. La sesión del probador va del navegador directo a Decart (WebRTC/WSS), no pasa por el origen.
- Si se publicara con nube naranja, el TLS 1.3 mínimo de la zona aplica igual (§3.1).
- El precio de Tunnel no figura en la página técnica. Cloudflare lo anuncia como gratuito [C: <https://www.cloudflare.com/products/tunnel/>].

**Disponibilidad para un punto de venta.** El punto de venta registra movimientos de inventario contra Postgres. Sin backend no hay venta registrable: la PWA puede mostrar el shell, pero no hay cola offline de movimientos implementada [V: no hay background sync en el repo]. Una caída nocturna diaria y la dependencia del coche son **incompatibles con abrir la tienda en horario normal**, salvo que la Pi pase a ser fija en casa con energía continua.

### 3.3 Opción 3: híbrida / escalonada
- **Fase A (ahora):** la Opción 1 completa.
- **Fase B (opcional):** sacar lo que es de Y4GA y tolera caídas. Por ejemplo, automatizaciones internas en n8n que llamen a `https://loloshop.y4ga.app/api/bot/*` con `x-bot-key`. El sentido es Pi → Vercel, nunca al revés para tráfico de clientes.
- **Fase C (condicionada):** migrar el backend a la Pi **solo si** se cumplen todas las puertas de §7.C.
- Se descarta la variante "frontend en Vercel con BD en la Pi a través del túnel". Suma latencia entre Vercel (iad1/sfo) y la Pi, expone Postgres por el túnel y hereda la misma indisponibilidad. No resuelve nada.

---

## 4. Impacto en PWA, auth, webhooks y probador

### 4.1 Resumen por opción
| Tema | Opción 1 (Vercel) | Opción 2 (Pi) |
|---|---|---|
| Manifest / reinstalación | Origen nuevo, app nueva: **hay que reinstalar** (§4.2) | Igual |
| SW / caché | El SW viejo sigue en `vercel.app`; el nuevo arranca vacío | Igual, más el riesgo de `no-store` en nginx (incidente v37/v38 de YAGA) |
| Cookies next-auth | Ligadas al host: **todos hacen login una vez** | Igual, más `X-Forwarded-Proto` correcto detrás del túnel |
| `NEXTAUTH_URL` | `https://loloshop.y4ga.app` | Igual |
| OAuth | No hay (solo Credentials) | No hay |
| Webhook de Meta | Cambiar la callback URL y re-verificar | Igual, pero la disponibilidad lo hace inviable |
| Bot n8n | Cambiar la URL base del workflow; `BOT_API_KEY` sin cambio | Igual |
| Probador (CSP/Decart) | `PROBADOR_ALLOWED_ORIGINS` con el dominio nuevo | Igual; hay que revisar que nginx/WAF no reescriban las cabeceras |
| SEO | `metadataBase` y canonical al dominio nuevo; 308 desde `vercel.app` | Igual |
| Correo | Sin impacto (MX en el apex) | Sin impacto |

### 4.2 PWA: manifest, service worker y reinstalación
- **La identidad de una PWA es su origen.** Si falta `id`, se usa `start_url`, y `id` *"must be same-origin with the start_url"* [V: <https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id>]. No hay forma de "mover" una instalación de `lolo-shop.vercel.app` a `loloshop.y4ga.app`. Cada dispositivo de tienda tiene que **instalar de nuevo** y **borrar el icono viejo**.
- **Añadir `"id": "/"` y `"scope": "/"`** al manifest en el mismo PR [A]. No resuelve este corte, pero fija la identidad para cualquier cambio futuro de ruta dentro del mismo origen.
- **El SW viejo.** En el origen `vercel.app`, el SW de `next-pwa` (o de Serwist tras el PR #17) sigue controlando la PWA instalada. Si la navegación a `/` sale del precache, la app vieja puede abrir con el shell viejo y luego sus `fetch` a `/api/*` reciben 308 hacia otro origen. Eso falla en silencio: CORS sin cabeceras y cookies que no viajan. Por eso:
  1. **No activar la redirección de dominio de Vercel el primer día.** Usar una redirección en `middleware.ts` condicionada por `Host === "lolo-shop.vercel.app"` que **solo** redirija navegaciones HTML y **excluya** `/sw.js`, `/workbox-*`, `/manifest.json`, `/api/whatsapp/*` y `/api/bot/*`. Así el SW viejo puede actualizarse y los integradores siguen funcionando mientras se cambian.
  2. Mostrar un **aviso** en el layout cuando el host sea `vercel.app`, del tipo "LoloShop cambió de dirección: instala desde loloshop.y4ga.app".
  3. Tras 30 días (o cuando todos los dispositivos estén migrados), activar la redirección 308 de dominio en Vercel o ampliar la del middleware a todo [A].
- **Cache Storage del origen nuevo** arranca vacía. No hay datos locales de negocio que migrar: no se usa IndexedDB para movimientos [V: búsqueda en el repo].
- **Orden respecto al PR #17.** Recomiendo **cerrar y estabilizar el PR #17 antes del corte de dominio**, o hacer el corte antes y el PR #17 después, pero nunca en el mismo deploy. Si algo falla, así se sabe si fue el SW nuevo o el origen nuevo [A].

### 4.3 next-auth
- **Cookies.** next-auth v4 usa cookies host-only con prefijo `__Secure-`/`__Host-` en HTTPS (`useSecureCookies` por defecto en `https://`) [V: <https://next-auth.js.org/configuration/options>]. Las sesiones de `vercel.app` no pasan a `loloshop.y4ga.app` y cada usuario hace login una vez. Como la estrategia es JWT, no hay tabla de sesiones que migrar.
- **`NEXTAUTH_SECRET` no cambia**, no hace falta rotarlo.
- **`NEXTAUTH_URL`.** La documentación pide *"set the NEXTAUTH_URL environment variable to the canonical URL of your site"* [V]. La autodetección en Vercel usa variables de sistema del *deployment* y no conoce el dominio personalizado [NV en detalle], así que hay que fijarla explícitamente **solo en Production**: `https://loloshop.y4ga.app`. En Preview hay que dejarla sin definir para que funcione la autodetección, o ajustarla por rama.
- **Login con `redirect: false`** (`app/login/page.tsx:19`) es mismo origen y no se ve afectado. El `callbackUrl` de middleware es relativo (`%2F`) [V].
- **OAuth:** no hay proveedores, así que no hay callbacks que actualizar.

### 4.4 Webhook de WhatsApp (Meta)
- Hay que cambiar la **Callback URL** en la app de Meta (WhatsApp → Configuration) a `https://loloshop.y4ga.app/api/whatsapp/webhook` y re-verificar con el mismo `WHATSAPP_VERIFY_TOKEN`. `WHATSAPP_APP_SECRET` no cambia.
- Meta exige HTTPS con certificado válido y no acepta autofirmados. Reintenta *"over the next 36 hours"* y luego descarta [V: <https://developers.facebook.com/docs/graph-api/webhooks/getting-started>]. No está documentado cuándo deshabilita la suscripción [NV].
- **Hay que corregir las 5 URLs fijas** `https://lolo-shop.vercel.app/catalogo` en `app/api/whatsapp/webhook/route.ts` y sustituirlas por una variable `NEXT_PUBLIC_SITE_URL` (o `APP_BASE_URL` en el servidor) [A]. Si no, el bot seguirá mandando a los clientes al dominio viejo.
- Durante la transición, `/api/whatsapp/*` en `vercel.app` **no se redirige**, porque Meta no sigue redirecciones de forma fiable [NV]. Así, la callback vieja funciona hasta que se cambie.

### 4.5 Bot n8n (`/api/bot/products`, `BOT_API_KEY`)
- Hay que cambiar la URL base en el workflow de n8n. Existe `n8n-local.y4ga.app` en un túnel [V], pero no pude ver el workflow porque el MCP devolvió 401.
- `BOT_API_KEY` no cambia. La cabecera `x-bot-key` no depende del dominio.
- `/api/bot/*` en `vercel.app` no se redirige durante la transición, por la misma razón que el webhook.

### 4.6 Probador virtual (cámara, CSP, Decart)
- `getUserMedia` exige contexto seguro. Ambos dominios son HTTPS, así que se cumple [V para el requisito; el certificado del dominio nuevo se verifica en el paso 4 de §7].
- **Permissions-Policy `camera=(self)`** aplica al **origen nuevo**. El permiso de cámara concedido en `vercel.app` **no se hereda** y el usuario lo concede otra vez [C: los permisos del navegador son por origen].
- **CSP**: `connect-src 'self' https://api.decart.ai wss://*.lkc.decart.ai …`, según el spec del probador §9.1. `'self'` se resuelve solo y no hace falta listar el dominio propio.
- **Decart `allowedOrigins`** valida la cabecera `Origin` del WebSocket (spec `2026-10-19-probador-personal-vivo-design.md` §5.4). Hay que definir `PROBADOR_ALLOWED_ORIGINS` por entorno:
  - Production: `https://loloshop.y4ga.app` y, **solo durante la transición**, `https://lolo-shop.vercel.app`.
  - Preview: las URLs de preview, o desactivar el probador en Preview.
- **El probador conviene lanzarlo ya en el dominio nuevo.** Así no se otorgan permisos de cámara a un origen que va a desaparecer [A].
- Con nube gris no hay riesgo de que Cloudflare altere cabeceras. Con naranja, "Automatic HTTPS Rewrites" no toca la CSP, pero conviene verificarlo [NV].

### 4.7 SEO / canonical
- Hoy no hay `metadataBase` en `app/layout.tsx` [V]. Hay que añadir `metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL)` y `alternates.canonical` en `/catalogo` [A].
- La redirección 308 final consolida la indexación de `vercel.app` hacia el dominio nuevo. `/catalogo` es la única página pública relevante.

### 4.8 Correo
- MX, SPF y DKIM viven en el apex (Email Routing). Un CNAME en `loloshop` no los afecta.
- next-auth no envía correo (no hay EmailProvider). Si se quiere `ventas@y4ga.app`, es una regla de Email Routing aparte; queda fuera de alcance.

### 4.9 `y4ga.app` raíz (no romperlo)
- El Worker `y4ga` tiene rutas exactas (`y4ga.app/*`, `www.y4ga.app/*`) y `workers_dev = false` [V: `Project_Y4GA_/wrangler.toml`]. Un CNAME `loloshop` en nube gris **no pasa por ningún Worker**.
- **Prohibido en este cambio:** tocar SSL/TLS de la zona, Always Use HTTPS, el TLS mínimo, crear un comodín `*` o añadir NS de `_acme-challenge` (solo se necesitarían para comodines). Son ajustes de toda la zona y afectan a YAGA, Poleana y `p.y4ga.app`.

---

## 5. Costos mensuales (USD, 2026-10-19)

| Concepto | Opción 1 | Opción 2 | Opción 3 |
|---|---|---|---|
| Vercel | **Pro US$20** (1 asiento, incluye US$20 de crédito) [V] | US$0 | US$20 |
| Neon Postgres | Plan actual. Free = US$0 [NV: confirmar plan y límites vigentes] | US$0 (en `yaga_postgres`) | Igual que la Opción 1 |
| Vercel Blob | Dentro del crédito Pro [NV: volumen actual] | US$0 (MinIO) | Igual que la Opción 1 |
| Cloudflare (DNS / Tunnel) | US$0 (zona Free) [V] | US$0 [C] | US$0 |
| Dominio `y4ga.app` | Ya pagado, costo compartido | Igual | Igual |
| Energía / datos de la Pi | n/a | Marginal (~5-10 W [C]); datos LTE del plan del coche | n/a |
| Backup remoto (R2/B2) | n/a | ~US$0-1 por pocos GB [NV] | n/a |
| Uptime externo | Opcional, gratis | Necesario, plan gratis o ~US$7 [NV] | Opcional |
| **Total en efectivo** | **~US$20** | **~US$0-8** | **~US$20** |
| Costo oculto | Ninguno relevante | Horas de operación del único dev, ventas perdidas de madrugada y riesgo de pérdida de BD | Ninguno hasta la fase C |

Referencia: quedarse en Hobby cuesta US$0, pero **incumple los términos** y se arriesga a que Vercel pause la cuenta [V: fair-use; la pausa la menciona la KB "Why has my account or deployment been paused?"].

---

## 6. Decisión de nombre de subdominio

| Candidato | A favor | En contra |
|---|---|---|
| **`loloshop.y4ga.app`** | Nombre de marca inequívoco y coherente con el repo, el proyecto Vercel y los mensajes del bot. `y4ga.app` aloja varios productos (YAGA, Poleana, `p.`, `logistic-y4ga`, `uber`) y el nombre deja claro de cuál se trata | Más largo de dictar por teléfono |
| `tienda.y4ga.app` | Corto. Es el que proponía el doc del homelab §8 | Genérico y ambiguo dentro de un dominio multiproducto. Si Y4GA tiene algún día su propia tienda, choca |
| `lolo.y4ga.app` | Muy corto | Pierde la marca completa |

**Decisión del autor: `loloshop.y4ga.app`.** Opcionalmente se puede reservar `tienda.y4ga.app` más adelante como alias con redirección 308 hacia `loloshop` desde Vercel, si el dueño lo quiere para material impreso [A]. No se crea en este cambio.

---

## 7. Plan paso a paso (Opción 1), con verificación y retroceso

> Nada de esto se ejecutó. Cada paso indica quién lo hace, cómo verificarlo y cómo deshacerlo. Las variables se configuran en el dashboard de Vercel; **ningún valor va al repo**.

### Fase 0: preparación (sin impacto en usuarios)
| # | Paso | Verificación | Retroceso |
|---|---|---|---|
| 0.1 | El dueño decide el plan: **pasar a Vercel Pro** | Settings → Billing muestra Pro | Bajar a Hobby (no recomendado) |
| 0.2 | Decidir el orden respecto al PR #17 (antes o después, nunca en el mismo deploy) | Anotado en el PR | n/a |
| 0.3 | PR `feat(dominio)`: (a) `NEXT_PUBLIC_SITE_URL` y uso en las 5 URLs del webhook; (b) `metadataBase` y canonical de `/catalogo`; (c) `id` y `scope` en el manifest; (d) en el middleware, redirección por `Host` **desactivada por flag** (`LEGACY_HOST_REDIRECT=off`) con exclusiones de `sw.js`, `workbox-*`, `manifest.json`, `api/whatsapp`, `api/bot`, `api/auth`; (e) aviso "nueva dirección" cuando el host sea `vercel.app`; (f) `.env.example` con **nombres** nuevos y sin valores | `npm run lint && npm test && npm run build`. En el preview, sin el flag, la app se comporta igual que hoy | Revertir el PR |
| 0.4 | Merge a `main` con `NEXT_PUBLIC_SITE_URL=https://lolo-shop.vercel.app` (todavía el dominio viejo) | Producción idéntica; el bot sigue enviando el mismo enlace | Revertir el commit |

### Fase 1: alta del dominio (sin impacto, el dominio nuevo aún no se anuncia)
| # | Paso | Verificación | Retroceso |
|---|---|---|---|
| 1.1 | Vercel → `lolo-shop` → Settings → Domains → Add `loloshop.y4ga.app` (Production). Anotar el **CNAME exacto** y, si lo pide, el **TXT `_vercel`** | El dashboard muestra "Invalid configuration" con los valores esperados | Quitar el dominio |
| 1.2 | Cloudflare → DNS → `CNAME loloshop → <valor de Vercel>`, **Proxy status: DNS only (gris)**, TTL Auto. Si se pidió, añadir `TXT _vercel` | `dig +short CNAME loloshop.y4ga.app` devuelve el valor de Vercel; `dig +short A loloshop.y4ga.app` **no** devuelve IPs de Cloudflare (104.21.x / 172.67.x) | Borrar el registro |
| 1.3 | Esperar a "Valid Configuration" y a la emisión del certificado | `curl -sI https://loloshop.y4ga.app/` → `HTTP/2 307` a `/api/auth/signin…`, cabecera `server: Vercel`. `openssl s_client -connect loloshop.y4ga.app:443 -servername loloshop.y4ga.app </dev/null 2>/dev/null \| openssl x509 -noout -issuer -subject -dates` → emisor Let's Encrypt, SAN `loloshop.y4ga.app` | Borrar el CNAME; `vercel.app` no se ve afectado |
| 1.4 | **Comprobar que `y4ga.app` no cambió** | `curl -sI https://y4ga.app/` y `https://api.y4ga.app/health` con los mismos códigos que antes del paso 1.2 (tomar línea base antes) | n/a (no se tocó) |

### Fase 2: corte (ventana de bajo uso, con el dueño presente)
| # | Paso | Verificación | Retroceso |
|---|---|---|---|
| 2.1 | En Vercel Production: `NEXTAUTH_URL=https://loloshop.y4ga.app`, `NEXT_PUBLIC_SITE_URL=https://loloshop.y4ga.app` y, si el probador ya existe, `PROBADOR_ALLOWED_ORIGINS=https://loloshop.y4ga.app,https://lolo-shop.vercel.app`. **Redeploy** (las `NEXT_PUBLIC_*` se fijan en el build) | Login en `https://loloshop.y4ga.app/login` → dashboard. DevTools → Cookies: `__Secure-next-auth.session-token` con host `loloshop.y4ga.app` | Restaurar los valores anteriores y redeploy, o *Instant Rollback* al deployment previo |
| 2.2 | Prueba de humo en el dominio nuevo: login con cada rol, escaneo → movimiento ±1, alta de producto con foto (Blob), `/catalogo` público, `/cuenta` | Movimiento registrado en `Movement` (Prisma Studio); la imagen se sube y aparece | Rollback del paso 2.1 |
| 2.3 | Meta → WhatsApp → Configuration → Callback URL `https://loloshop.y4ga.app/api/whatsapp/webhook` y verificar con el mismo verify token | Meta muestra "Verified". Un mensaje de prueba al número genera respuesta con enlace `https://loloshop.y4ga.app/catalogo` | Volver a la callback `https://lolo-shop.vercel.app/api/whatsapp/webhook`, que sigue viva |
| 2.4 | n8n: cambiar la URL base del workflow a `https://loloshop.y4ga.app/api/bot/products` | Ejecución manual con 200 y JSON de productos; sin `x-bot-key` responde 401 | Restaurar la URL vieja |
| 2.5 | Activar `LEGACY_HOST_REDIRECT=on` (redirige solo navegaciones HTML de `vercel.app`) y redeploy | `curl -sI https://lolo-shop.vercel.app/catalogo` → 308 a `https://loloshop.y4ga.app/catalogo`. `curl -sI https://lolo-shop.vercel.app/sw.js` → 200. `/api/whatsapp/webhook` (GET de verificación) sigue respondiendo | `LEGACY_HOST_REDIRECT=off` y redeploy |
| 2.6 | En cada dispositivo de tienda: desinstalar la PWA vieja, abrir `https://loloshop.y4ga.app`, instalar y hacer login | Lista de dispositivos firmada por el dueño (quién, cuándo) | Usar la PWA vieja, que sigue funcionando con el flag en off |

### Fase 3: cierre (a los ~30 días)
| # | Paso | Verificación | Retroceso |
|---|---|---|---|
| 3.1 | Quitar `https://lolo-shop.vercel.app` de `PROBADOR_ALLOWED_ORIGINS` | Un token de Decart solicitado desde `vercel.app` es rechazado | Volver a añadirlo |
| 3.2 | Vercel → Domains → `lolo-shop.vercel.app` → Redirect to `loloshop.y4ga.app` (308), o ampliar el middleware a todo [C: que el dashboard permita redirigir `*.vercel.app`] | `curl -sI https://lolo-shop.vercel.app/` → 308 | Quitar la redirección |
| 3.3 | Actualizar `CLAUDE.md` (dominio canónico), la memoria del proyecto y el README | Commit `docs:` | Revertir |
| 3.4 | Opcional: activar Vercel Firewall o Bot Protection (funciona porque no hay proxy delante) | Panel de Firewall | Desactivar |

### Fase C (Opción 3): puertas para reconsiderar la Pi
Todas son obligatorias y verificables:
1. La Pi está **fija en casa** con energía continua y UPS. El uptime medido por un monitor externo es ≥ 99,5 % durante 30 días.
2. **LUKS2** activo: `lsblk` muestra la capa `crypt`.
3. Controlador `memory` de cgroups habilitado (`grep -w memory /sys/fs/cgroup/cgroup.controllers`) y `mem_limit` aplicado según `docker stats`.
4. Backup 3-2-1 con destino remoto cifrado y **simulacro de restauración** de `loloshop_db` documentado.
5. Runbook de migración Neon → Pi **ensayado en una BD scratch**, con conteo de filas por tabla. Es la lección del 2026-08-31.
6. CI que construye la imagen arm64 con tag fijo, health gate y retroceso automático a la imagen anterior.
7. Plan para el webhook de Meta: o se queda en Vercel como función mínima, o se acepta perder mensajes.

Si alguna puerta no se cumple, LoloShop se queda en Vercel.

---

## 8. Riesgos

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | La PWA vieja instalada queda "huérfana" con el shell viejo y `fetch` a `/api` redirigidos entre orígenes, que fallan en silencio | Media | Alto (ventas no registradas) | Redirección por middleware que excluye `sw.js` y `api/*`, aviso en pantalla, ventana de 30 días y checklist de reinstalación por dispositivo |
| R2 | Seguir en Hobby siendo tienda: Vercel pausa la cuenta | Baja-media | Muy alto | Pasar a Pro antes de anunciar el dominio |
| R3 | La callback de Meta no se actualiza o el bot sigue mandando a `vercel.app` | Media | Medio | Parametrizar las URLs (0.3) y pasos 2.3/2.4 con verificación de un mensaje real |
| R4 | Alguien pone la nube en naranja "por costumbre": rompe HTTP-01, aplica TLS 1.3 mínimo y duplica caché | Media | Medio | Documentarlo aquí y en `CLAUDE.md`. Verificación del paso 1.2 (no deben salir IPs de Cloudflare) |
| R5 | Un cambio de ajustes de toda la zona Cloudflare rompe `y4ga.app` | Baja | Alto (YAGA) | Prohibido en este cambio (§4.9) y línea base del paso 1.4 |
| R6 | `NEXTAUTH_URL` mal puesto en Preview rompe el login de los previews | Media | Bajo | Definirla solo en Production |
| R7 | Corte de dominio y PR #17 (Serwist) en el mismo deploy: diagnóstico imposible | Media | Medio | Orden explícito (0.2) |
| R8 | **Opción 2:** pérdida de BD en la migración, caída diaria, disco sin cifrar, OOM por cgroups | Alta | Muy alto | No ejecutar sin las puertas de §7.C |
| R9 | Permiso de cámara del probador concedido en el origen viejo | Baja | Bajo | Lanzar el probador ya en el dominio nuevo |
| R10 | El CNAME de Vercel cambia de formato (`vercel-dns-0NN.com` frente a `cname.vercel-dns.com`) | Baja | Bajo | Copiar siempre el valor del dashboard, nunca de una guía |

---

## 9. Preguntas para el dueño

1. ¿Confirmas que LoloShop vende o aparta productos? En ese caso es uso comercial y **hay que pasar a Vercel Pro (US$20/mes)**. ¿Quién paga y con qué tarjeta?
2. ¿Te parece bien **`loloshop.y4ga.app`**, o prefieres `tienda.y4ga.app` (o ambos, con uno redirigiendo al otro)?
3. ¿Cuántos dispositivos tienen la PWA instalada y quién los reinstala? ¿Qué ventana de baja actividad prefieres para el corte?
4. ¿Quién tiene acceso a la app de Meta (WhatsApp Business) para cambiar la Callback URL?
5. ¿Quién mantiene el workflow de n8n que consulta `/api/bot/products`, y en qué instancia corre (`n8n-local`)?
6. ¿En qué plan está Neon hoy, y cuántos GB ocupan BD y Blob?
7. ¿El PR #17 (Next 15.5 + Serwist) entra antes o después del cambio de dominio?
8. ¿La Pi va a seguir en el coche? Si algún día queda fija en casa, revisamos la fase C.
9. ¿Quieres que `lolo-shop.vercel.app` redirija para siempre o que deje de anunciarse sin más?

---

## 10. Decisiones del autor

- **[A]** Recomendación: Opción 1 (Vercel con `loloshop.y4ga.app`), con la Opción 3 como hoja de ruta condicionada. La Opción 2 queda descartada mientras la Pi sea móvil.
- **[A]** Nombre: `loloshop.y4ga.app`.
- **[A]** Cloudflare en **nube gris** (DNS only) para este hostname. No se tocan ajustes de la zona.
- **[A]** Transición de unos 30 días con redirección en el middleware que excluye `sw.js`, `workbox-*`, `manifest.json`, `api/auth`, `api/whatsapp` y `api/bot`, antes de la redirección 308 total.
- **[A]** URLs del sitio parametrizadas (`NEXT_PUBLIC_SITE_URL`). Ninguna URL absoluta de dominio en el código.
- **[A]** `NEXTAUTH_URL` fijado solo en Production.
- **[A]** El manifest incorpora `id: "/"` y `scope: "/"`.
- **[A]** El corte de dominio y el PR #17 van en deploys separados.
- **[A]** El probador se lanza en el dominio nuevo, con `allowedOrigins` por entorno.
- **[A]** Si no se paga Pro, la alternativa a estudiar es Cloudflare Workers (OpenNext/vinext), no la Pi.

---

## Fuentes (consultadas el 2026-10-19)
- Vercel con Cloudflare / proxies: <https://vercel.com/kb/guide/cloudflare-with-vercel> [V]
- Vercel, añadir dominio (CNAME por proyecto, TXT `_vercel`, límite Hobby de 50 dominios): <https://vercel.com/docs/domains/working-with-domains/add-a-domain> [V]
- Vercel, redirección de dominios: <https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting> [V]
- Redirección de `*.vercel.app` (tercero): <https://johnkavanagh.co.uk/articles/redirect-a-default-vercel-subdomain-to-your-custom-domain/> [C]
- Vercel, uso comercial en Hobby: <https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage> [V]
- Vercel, precios: <https://vercel.com/pricing> [V]
- Cloudflare, límites de cuerpo de petición por plan: <https://developers.cloudflare.com/workers/platform/limits/#request-limits> [V]
- Cloudflare Tunnel: <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/> [V]
- Cloudflare One, límites de cuenta (túneles, réplicas): <https://developers.cloudflare.com/cloudflare-one/account-limits/> [V]
- Cloudflare error 524: <https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/> [NV hoy]
- Cloudflare WebSockets: <https://developers.cloudflare.com/network/websockets/> [NV hoy]
- Meta Webhooks (HTTPS, reintentos 36 h): <https://developers.facebook.com/docs/graph-api/webhooks/getting-started> [V]
- NextAuth.js v4, opciones (`NEXTAUTH_URL`, `useSecureCookies`): <https://next-auth.js.org/configuration/options> [V]
- MDN, Web App Manifest `id`: <https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id> [V]
- Internas: `Project_Y4GA_/docs/investigacion/2026-09-02-integracion-rpi5-homelab.md`, `RESUMEN_SESION_2026-08-31_MIGRACION_RPI5.md`, `Project_Y4GA_/wrangler.toml`, `docs/superpowers/specs/2026-10-19-probador-*.md`.
