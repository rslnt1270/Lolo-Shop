# LoloShop: flujos de trabajo en n8n para el probador virtual, fotos con IA y operación

**Fecha:** 2026-10-19
**Rol:** arquitectura de automatización
**Clasificación:** diseño. No se creó ni modificó ningún workflow de n8n, no se tocó código de producto ni se gastó dinero. El MCP `n8n-local` responde 401 y no se usó.
**Repo:** `rslnt1270/Lolo-Shop` (público). Aquí solo aparecen **nombres** de variables y credenciales, nunca valores.

> **Convención de evidencia** (la misma de los specs del 2026-10-19). **[V]** verificado hoy leyendo el repo o un spec que lo verificó. **[C]** lo afirma el proveedor o la documentación según conocimiento previo, sin comprobarlo hoy. **[NV]** no verificado: confirmarlo antes de actuar. **[A]** decisión o supuesto del autor.
>
> **Documentos de referencia** (abreviados así en el texto):
> - **Doc-Dominio**: `2026-10-19-loloshop-dominio-y4ga-design.md`
> - **Doc-BajoCosto**: `2026-10-19-probador-bajo-costo-design.md` (niveles A/B/C)
> - **Doc-Cliente**: `2026-10-19-probador-cliente-foto-design.md`
> - **Doc-Personal**: `2026-10-19-probador-personal-vivo-design.md`
> - **Doc-FotosIA**: `2026-10-19-fotos-producto-ia-design.md` (escrito en paralelo por otro agente; se leyó, no se editó)
> - **Doc-Replan**: `2026-07-06-loloshop-replan-costo-minimo-design.md` (bot de WhatsApp sin IA y **sin n8n**)
> - `docs/n8n-image-pipeline.md` y `docs/n8n-whatsapp-plan.md` (planes anteriores; este documento los reemplaza en lo que se contradigan)

---

## 1. Resumen y recomendación

**Idea central: n8n no está en el camino crítico de nada.** Todo lo que toca a un cliente, cobra dinero o protege el presupuesto vive en la app (Vercel + Neon). n8n hace de **back-office**: vigila, concilia, avisa y resume. Si n8n se cae, la tienda, el probador y los topes de gasto siguen funcionando; solo se pierden avisos, y los flujos los recuperan cuando n8n vuelve.

Las razones vienen de hechos ya verificados:
- n8n corre hoy en la **laptop del dueño** (`localhost:5679`) y la RPi5 va en un coche, arriba unas 10–14 h al día [V, Doc-Dominio §2.4]. Ninguno de los dos sirve para algo que deba estar 24/7.
- Doc-Replan ya sacó el webhook de WhatsApp de n8n y lo dejó en `app/api/whatsapp/webhook/route.ts` [V].
- Doc-FotosIA ya ubica el pipeline de fotos dentro de la app (`ProductImageJob`, AI Gateway, pantalla `/productos/revision`) [V].
- Los secretos que importan (`TRYON_LINK_SECRET`, claves de FASHN, Cloudflare, AI Gateway, `BLOB_READ_WRITE_TOKEN`) deben quedarse **solo en Vercel**. Si n8n los tuviera, habría dos sitios que proteger y rotar.

**Recomendación concreta:**

1. **Fotos de producto con IA: en la app, no en n8n** (§4, ficha F01). n8n solo avisa al owner de que hay candidatos pendientes y le manda el enlace a la pantalla de revisión.
2. **Presupuesto: el tope duro lo aplica la app** (reserva antes de llamar al proveedor, como en Doc-Cliente §6.4). n8n vigila cada hora, avisa al 50/80/100 % y puede **apagar** (nunca encender) el probador con una bandera en la BD vía endpoint autenticado (F02).
3. **Modelo "pull" por defecto:** n8n hace solo **llamadas salientes** (a la app, a las APIs de proveedores, a Telegram). La app no llama a n8n: deja eventos en una tabla *outbox* que n8n lee. Así n8n **no necesita exponerse a Internet**, y una laptop dormida no pierde eventos (§3.3).
4. **Hospedaje:** laptop para desarrollo ya. Para producción, un **VPS pequeño (~US$4–6/mes)** con n8n en Docker y sin puertos abiertos, cuando haya al menos 3 flujos en producción, a más tardar cuando se active el nivel B del probador (§3). n8n Cloud es la alternativa sin servidor que mantener (~€24/mes [NV]).
5. **Canal interno: un bot de Telegram** del owner (gratis, sin plantillas ni ventana de 24 h). WhatsApp queda para clientes y lo opera la app (§4, F04).
6. **Imprescindible antes de abrir el probador:** API `/api/ops/*` con autenticación propia (`OPS_API_KEY` + HMAC), F00 (errores de n8n), F02 (guardián de presupuesto) y F05c (respaldo de Neon con prueba de restauración). El respaldo es urgente con o sin probador: el 2026-08-31 ya se perdió una BD por no tener copia [V, Doc-Dominio §2.4].

**Lo que se descarta:** la mayoría de los flujos de "proceso de desarrollo" (resúmenes de commits, checklist de revisión por n8n). Son ruido frente a lo que ya dan GitHub y CI. Solo se conserva un digest diario de inicio de jornada (F06), en "después".

**Esfuerzo total del bloque imprescindible:** ~19–23 h, unas 4–5 jornadas de 5 h (§7).

---

## 2. Arquitectura

### 2.1 Diagrama global (texto)

```
                          CLIENTES                                  PERSONAL / OWNER
   WhatsApp ─────────────────┐                        PWA loloshop.y4ga.app (sesión next-auth)
   (Meta Cloud API)          │                          │  /probador (owner)  /productos/revision (owner)
                             ▼                          ▼
 ┌──────────────────────── VERCEL (Pro) · camino crítico, 24/7 ─────────────────────────────┐
 │  /api/whatsapp/webhook   → menú fijo (Doc-Replan) + emite enlace/QR firmado del probador   │
 │  /api/probador           → TryOnProvider (Cloudflare klein / FASHN) · reserva de gasto    │
 │  acciones de fotos IA    → AI Gateway → candidato en Blob → ProductImageJob (Doc-FotosIA) │
 │  /api/bot/products       → x-bot-key = BOT_API_KEY (solo lectura de catálogo, ya existe)  │
 │  /api/ops/*   (NUEVO)    → x-ops-key = OPS_API_KEY · escrituras con HMAC (OPS_HMAC_SECRET) │
 │  /api/health  (NUEVO)    → sin datos, para monitores externos                             │
 │  Vercel Cron  (NUEVO)    → seguimientos de WhatsApp, limpieza de candidatos y contadores   │
 └───────────────┬──────────────────────────────────────────────┬────────────────────────────┘
                 │ Prisma                                       │ @vercel/blob
                 ▼                                              ▼
   Neon Postgres: Product, Movement, TryOnUsage,          Blob: productos/original|candidatos|aprobadas
   ProductImageJob, AppFlag*, OpsEvent*, OpsAlert*        (NUNCA fotos de personas)
   (* nuevos, ver §4.0)
                 ▲
                 │  HTTPS saliente, solo pull: GET /api/ops/... · POST /api/ops/flags|alerts (HMAC)
                 │
 ┌───────────────┴───────────── n8n (back-office, tolerante a caídas) ──────────────────────┐
 │  dev: laptop :5679        prod: VPS Docker (n8n + Postgres propio), sin puertos abiertos   │
 │  F00 errores · F01 aviso de fotos pendientes · F02 guardián de presupuesto                 │
 │  F03 conciliación con proveedores · F05b DNS/SSL · F05c vigía del respaldo                  │
 │  F05d inventario bajo · F05e reporte semanal · F06 digest de desarrollo                    │
 │  Ajustes: no guardar ejecuciones exitosas · no guardar datos binarios · poda a 7 días      │
 └───────┬───────────────────────────┬───────────────────────────┬──────────────────────────┘
         │ salientes                 │                           │
         ▼                           ▼                           ▼
  Telegram Bot API          APIs de uso/saldo (solo lectura):   Cloudflare API (DNS, solo lectura)
  (chat del owner)          FASHN, Cloudflare GraphQL,          GitHub API (solo lectura)
                            Vercel (deployments, AI Gateway),   R2/S3 (listar respaldos)
                            Decart*, Gemini*  (*[NV])

 FUERA DE n8n (a propósito):
  · Monitor de disponibilidad externo (UptimeRobot / Better Stack, plan gratis) → /api/health
  · Job de respaldo pg_dump | age → R2, como contenedor cron en el host de n8n (n8n solo lo vigila)
```

### 2.2 Reglas de la arquitectura [A]

| # | Regla | Motivo |
|---|---|---|
| R-1 | Ningún flujo de n8n es requisito para vender, escanear, probar ni para respetar un tope de gasto | La disponibilidad de n8n no está garantizada (laptop o Pi) |
| R-2 | n8n nunca recibe, transforma ni guarda **fotos de personas**. Tampoco números de teléfono de clientes | Privacidad (LFPDPPP, Doc-Cliente §5) y superficie mínima |
| R-3 | n8n no tiene claves de los proveedores de generación. Para conciliar solo usa tokens de **lectura de uso o saldo** cuando el proveedor los ofrece | Que n8n no pueda gastar dinero aunque lo comprometan |
| R-4 | Las automatizaciones solo pueden **reducir** exposición (apagar banderas). Encender algo lo hace un humano en la app | Un fallo de n8n no puede abrir el grifo del gasto |
| R-5 | Todo flujo es idempotente y recupera lo perdido: trabaja con cursores o claves de deduplicación guardadas **en la app**, no en la memoria de n8n | La laptop duerme; el VPS puede reiniciarse; n8n puede reinstalarse |
| R-6 | La lógica de negocio (agregados, umbrales, textos del reporte) se calcula en la app y n8n solo da formato y entrega | Se prueba con Vitest como el resto del repo; los workflows quedan delgados |

---

## 3. Hospedaje de n8n

### 3.1 Opciones

| Opción | Costo/mes | Disponibilidad | Pros | Contras |
|---|---|---|---|---|
| **Laptop del dueño** (hoy, `:5679`) | US$0 | Solo cuando está encendida y despierta | Ya existe; ideal para desarrollar | No es producción. Si duerme, no hay cron. Si se expone por el túnel `n8n-local.y4ga.app` [V, Doc-Dominio §2.1], el editor queda en una máquina personal |
| **RPi5 del homelab** | US$0 | ~10–14 h/día mientras viaje en el coche [V] | Hardware propio | Disco sin cifrar (el doc del homelab prohíbe datos de terceros hasta tener LUKS [V]); cgroups de memoria rotos; IP móvil. Se reconsidera con las mismas puertas de Doc-Dominio §7.C |
| **n8n Cloud** (Starter) | ~€24 [NV] con un tope de ejecuciones mensuales (~2.500 [NV]) | Gestionada | Cero operación; backups y actualizaciones incluidas | Lo más caro; tope de ejecuciones (el diseño de §4 gasta ~1.600/mes sin F05a y ~3.300 con él, §7); los datos de ejecución viven en su nube |
| **VPS pequeño** (p. ej. Hetzner CAX11/CX22 ARM/x86, 2 vCPU, 4 GB) | ~US$4–6 [NV] | Alta (centro de datos) | Barato, control total, sirve también para el job de respaldo | Hay que operarlo: actualizaciones, backup de n8n, monitor. ~1 h/mes |
| Oracle Cloud Always Free (ARM) | US$0 [C] | Alta, con riesgo de que Oracle reclame instancias inactivas [C] | Gratis y potente | Alta de cuenta con fricción; riesgo de pérdida sin aviso. Solo si el costo es un bloqueo absoluto |
| Contenedor en Railway / Render / Fly.io | ~US$5–10 [NV] | Alta | Despliegue con un clic | Almacenamiento persistente y precio variable; n8n necesita Postgres o volumen persistente |

### 3.2 Recomendación (decisión del autor)

- **Fase 0 (ya):** la laptop sigue siendo **dev**. Los workflows se construyen y prueban ahí contra un deployment Preview o `localhost:3000`. Todos los flujos se diseñan para tolerar que no esté encendida (R-5).
- **Fase 1 (cuando haya ≥ 3 flujos en producción, o al activar el nivel B del probador, lo que ocurra antes):** **VPS pequeño** con Docker Compose: `n8n` (versión fijada, nunca `latest`, lección del `cloudflared:latest` de la Pi [V]), `postgres` propio de n8n, y un contenedor `backup-cron` para F05c. Costo estimado US$4–6/mes [NV].
- **Si el dueño no quiere operar un servidor:** n8n Cloud Starter, bajando frecuencias para no pasar del tope de ejecuciones.
- **La Pi** solo entra si se cumplen las puertas de Doc-Dominio §7.C (fija en casa, LUKS, cgroups, backup probado). Incluso entonces, solo para flujos de este documento, que son tolerantes a caídas.

### 3.3 Exposición pública: por defecto, ninguna

Con el modelo **pull** (R-5 y §4.0), n8n solo hace peticiones salientes:
- La app **no** llama a n8n. Escribe eventos en `OpsEvent` (outbox) y n8n los lee con `GET /api/ops/events?after=<cursor>`.
- Las aprobaciones de fotos se hacen **en la app**, no con botones de Telegram. Los botones inline de Telegram exigirían un webhook entrante a n8n [C].
- El estado de los deployments de Vercel y de GitHub se **consulta** por API en vez de recibir webhooks.

Resultado: el VPS no abre puertos y no hace falta publicar el editor ni los webhooks. Se administra por SSH (llave) o por un túnel con Cloudflare Access.

**Si algún día hace falta un webhook entrante** (p. ej. un flujo que requiera latencia de segundos), el patrón es:

1. **Cloudflare Tunnel** (`cloudflared` con versión fijada) hacia `n8n.y4ga.app`. Ingress solo para `/webhook/*`.
2. **Cloudflare Access** delante:
   - Editor (`/`, `/rest/*`): política de identidad (correo del owner y del desarrollador con OTP). Plan Zero Trust Free, hasta 50 usuarios [C].
   - Webhooks (`/webhook/*`): política **Service Auth** con un *service token* (`CF-Access-Client-Id` / `CF-Access-Client-Secret`) guardado en Vercel como `N8N_ACCESS_CLIENT_ID` / `N8N_ACCESS_CLIENT_SECRET`.
3. **Firma HMAC** del cuerpo además de Access (defensa en profundidad): cabeceras `x-ls-timestamp` y `x-ls-signature = HMAC-SHA256(N8N_WEBHOOK_SECRET, timestamp + "." + body)`. n8n rechaza si la ventana supera ±5 min o si la firma no coincide (comparación en tiempo constante en un nodo Code con `crypto`).
4. **Respuesta inmediata** (`Respond to Webhook` con 202) y procesamiento después, para que Vercel no espere.

**Acción pendiente hoy:** existe `n8n-local.y4ga.app` con CNAME a un túnel [V, Doc-Dominio §2.1]. No se pudo comprobar si tiene Access delante. Si apunta a la laptop y publica el editor sin Access, es un riesgo que hay que cerrar ya (pregunta 3 de §9).

---

## 4. Catálogo de flujos

### 4.0 Piezas comunes en la app (prerrequisito de casi todos los flujos)

Se diseñan aquí; se implementan con TDD como el resto del repo. Las migraciones van por `prisma migrate`, después del **baseline de migraciones** que ya exigen Doc-Personal §7.3 y Doc-FotosIA §7.1.

| Pieza | Descripción |
|---|---|
| `OPS_API_KEY` | Clave **distinta** de `BOT_API_KEY`. `BOT_API_KEY` solo lee catálogo; mezclarlas daría a quien tenga una el poder de la otra [A]. Cabecera `x-ops-key`, comparación con `timingSafeEqual` como en `app/api/bot/products/route.ts` [V] |
| `OPS_HMAC_SECRET` | Las peticiones **mutantes** (`POST`) llevan además `x-ops-timestamp` y `x-ops-signature = HMAC-SHA256(secret, method + path + timestamp + body)`, con ventana de ±5 min |
| `middleware.ts` | Excluir `/api/ops` y `/api/health` del login de next-auth, igual que hoy `api/bot` [V] |
| `AppFlag` (tabla) | `key` (único), `enabled`, `updatedBy` (`user:<id>` o `n8n:<flujo>`), `reason`, `updatedAt`. Claves iniciales: `tryon.enabled`, `tryon.client.enabled`, `tryon.hq.enabled`, `tryon.live.enabled`, `photo_ai.enabled` |
| `OpsEvent` (outbox) | `id` (secuencial), `type`, `payload Json` (**solo IDs y números**, nunca imágenes, teléfonos ni nombres de clientes), `createdAt`. Retención de 30 días (limpieza con Vercel Cron) |
| `OpsAlert` | `key` (único, p. ej. `budget:fashn:2026-10:80`), `status` (`claimed`/`sent`/`failed`), `claimedAt`, `sentAt`. Es la deduplicación de avisos entre ejecuciones e instalaciones de n8n |
| `GET /api/health` | 200 con `{ ok, db: "ok"|"down", version }` (sha del commit), sin datos de negocio, `Cache-Control: no-store` |

**Cómo se aplica una bandera (decisión del autor):**
- Bandera efectiva = `env AND flag`. Ejemplo: `TRYON_ENABLED` (env, interruptor maestro de Doc-Cliente) **y** `AppFlag("tryon.enabled")`. Si la env está apagada, nada la enciende desde la BD; así se conserva el apagado de emergencia por despliegue.
- La lectura se cachea en memoria de la instancia unos 30 s. Con Fluid compute, una consulta cada 30 s por instancia es despreciable para Neon [A]. Un apagado tarda como mucho ~30 s en propagarse.
- El owner enciende y apaga desde el dashboard con una acción de servidor que **verifica el rol en el servidor**, como `createLocationAction` [V, CLAUDE.md]. n8n solo puede **apagar** (`POST /api/ops/flags` con `{ key, enabled: false, reason }`); un `enabled: true` desde `/api/ops` devuelve 403 (R-4).
- **No se editan variables de entorno de Vercel desde n8n.** Requeriría un token de Vercel con permiso de escritura en n8n y un redeploy. Es lento, frágil y peligroso.

**Patrón de aviso idempotente ("reclamar y luego enviar")**, usado por todos los flujos que avisan:
```
1. POST /api/ops/alerts/claim {key}   → 201 si es nuevo (o si quedó 'claimed'/'failed' hace > 15 min)
                                        200 {already:true} si ya se envió → el flujo termina sin enviar
2. Enviar por Telegram
3. POST /api/ops/alerts/{key}/sent  (o /failed si Telegram falla tras los reintentos)
```

**Convenciones de todos los workflows:**
- Nombre `LS-Fxx-<slug>` y etiqueta `loloshop` y `prod` o `dev`.
- Credenciales de n8n (solo nombres): `ls_ops_api` (Header Auth `x-ops-key`), `ls_ops_hmac` (secreto que usa el nodo Code para firmar), `ls_telegram_owner` (token del bot), y por flujo las que se indican en cada ficha.
- La URL base no va escrita en los nodos: viene de una variable de entorno **no secreta** del contenedor, `LS_APP_BASE_URL` (`https://loloshop.y4ga.app` en prod, URL de Preview o `http://localhost:3000` en dev). Ver §6.
- Workflow de error asignado: `LS-F00-errores`.
- Reintentos en los nodos HTTP: **On Error → Retry**, 3 intentos con espera de 30 s, salvo que la ficha diga otra cosa. Los 4xx no se reintentan (son errores de contrato).
- **Ajustes de ejecución por workflow:** guardar ejecuciones de producción exitosas: **No**; guardar fallidas: **Sí**; guardar ejecuciones manuales: **No** en prod; guardar progreso: **No**. A nivel de instancia, ver §5.2.

### Resumen de flujos

| ID | Flujo | Dónde vive la lógica | Disparador | ¿Crítico? | ¿Toca imágenes? |
|---|---|---|---|---|---|
| F00 | Errores de n8n | n8n | Error Trigger | No | No |
| F01 | Fotos de producto con IA | **App** (Doc-FotosIA); n8n solo avisa | Outbox, cada 30 min en horario de tienda | No | No: solo IDs y enlace |
| F02 | Guardián de presupuesto e interruptor | **Tope en la app**; n8n vigila y apaga | Cron cada hora | No (los topes están en la app) | No |
| F03 | Conciliación con proveedores | n8n + endpoint de ledger | Cron diario | No | No |
| F04 | WhatsApp: enlace firmado y seguimiento | **App** (webhook + Vercel Cron); **sin n8n** | Mensaje del cliente / Vercel Cron | Sí, pero en Vercel | No |
| F05a | Deploy fallido | n8n (o notificación nativa de Vercel) | Cron cada 15 min | No | No |
| F05b | Salud de dominio, DNS y SSL | n8n + monitor externo | Cron diario + monitor cada 5 min | El monitor sí; n8n no | No |
| F05c | Respaldo de Neon | Contenedor cron; n8n vigila | Cron diario | El respaldo sí, como proceso | No (datos tabulares cifrados) |
| F05d | Aviso de inventario bajo | App calcula; n8n entrega | Cron diario 09:00 | No | No |
| F05e | Reporte semanal al owner | App calcula; n8n entrega | Cron lunes 08:00 | No | No |
| F05f | Limpieza y retención | **App** (Vercel Cron) | Diario | No | Borra candidatos de producto en Blob |
| F06 | Digest de inicio de jornada (desarrollo) | n8n | Cron en días laborales | No | No |

---

### F00. Errores de n8n (`LS-F00-errores`)

- **Objetivo:** que ningún fallo de flujo pase en silencio.
- **Disparador:** *Error Trigger*. Todos los workflows lo tienen asignado como "Error workflow".
- **Nodos:**
  1. Error Trigger.
  2. Set: arma `{ workflow, nodo, mensaje (recortado a 300 caracteres), executionId, hora }`. **No** incluye `$json` del nodo fallido, para no filtrar datos.
  3. Code: deduplica por `workflow + nodo + hora truncada a 1 h` usando *static data* del workflow (aquí basta, no es crítico).
  4. Telegram → chat del owner o del desarrollador: "⚠️ LS-F02 falló en «GET budget»: 503…".
- **Credenciales:** `ls_telegram_owner`.
- **Errores:** si Telegram falla no hay más que hacer. La ejecución fallida queda guardada (ajuste "guardar fallidas").
- **Idempotencia:** deduplicación horaria.
- **Costo:** US$0.
- **Datos personales:** ninguno, por construcción del paso 2.
- **Métricas:** número de errores por flujo y semana (se cuentan en F05e leyendo la API de ejecuciones de n8n [NV], o se omite).
- **Criticidad:** tolerante.

---

### F01. Fotos de producto con IA (pipeline en la app; n8n solo avisa)

#### F01.a Comparativa: ¿dónde corre el pipeline?

| Criterio | **n8n** (webhook → IA → aprobación → Blob → endpoint) | **App: Route Handler / Server Action síncrona** (Doc-FotosIA §6.3) | **App: Vercel Workflow / Queues** |
|---|---|---|---|
| Disponibilidad | La de la laptop o la Pi: el owner pulsa "Mejorar foto" y no pasa nada si n8n está apagado | La de Vercel: 24/7 | La de Vercel, con reintentos durables |
| Secretos | Clave de IA **y** `BLOB_READ_WRITE_TOKEN` (o un endpoint que acepte binarios) en n8n: dos sitios que proteger | Ya están en Vercel | Igual que la síncrona |
| Subida a Blob | `docs/n8n-image-pipeline.md` proponía S3 o Cloudinary, en contra de CLAUDE.md ("subida server-side en `lib/image/upload.ts`, nunca en el data source") | Reutiliza `lib/image/upload.ts` [V] | Igual |
| Auditoría | Ejecuciones de n8n con binarios (pesadas, con retención propia) y fuera de la BD | `ProductImageJob` en Postgres: quién pidió, quién aprobó, costo, modelo, versión del prompt [V, Doc-FotosIA §7.1] | Igual, más el historial de pasos |
| Presupuesto | Contador aparte del de la app (riesgo de doble conteo o hueco) | Mismo ledger que el resto | Igual |
| Rol (solo owner) | n8n no conoce la sesión: habría que reenviar la identidad y confiar en ella | `getServerSession` + comprobación de rol en el servidor | Igual |
| Latencia | Para el usuario, asíncrono | ~5–30 s por clic, con `maxDuration` de 120 s [Doc-FotosIA] | Asíncrono |
| Lotes nocturnos (Gemini Batch) | Natural en n8n | Cron de Vercel + endpoint | Lo más robusto |
| Pruebas | Manuales en el canvas | Vitest con el proveedor mockeado, como `lib/image` | Vitest + simulador [NV] |
| Esfuerzo | Medio, y duplica lógica | Bajo (ya diseñado) | Medio; dependencia nueva [NV: estado GA de Queues y Workflow] |

**Recomendación (decisión del autor):** **en la app**, tal como lo describe Doc-FotosIA (síncrono en la fase 1; cron + Batch o Workflow en la fase 3). n8n no aporta nada que la app no tenga y sí añade un punto de fallo, una copia de secretos y una auditoría paralela. Los planes de `docs/n8n-image-pipeline.md` (webhook de n8n, S3 o Cloudinary) quedan **reemplazados**.

#### F01.b Flujo n8n: aviso de candidatos pendientes (`LS-F01-fotos-pendientes`)

- **Objetivo:** que el owner sepa que hay fotos por revisar sin abrir la app a ciegas, y recordatorio si se acumulan.
- **Disparador:** Schedule cada 30 min entre 09:00 y 21:00 (hora de Ciudad de México, `GENERIC_TIMEZONE=America/Mexico_City`).
- **Nodos:**
  1. Schedule Trigger.
  2. HTTP GET `{{LS_APP_BASE_URL}}/api/ops/events?type=product_image.generated,product_image.failed&after={{cursor}}` (credencial `ls_ops_api`). El **cursor** lo guarda la app: `GET /api/ops/cursors/F01` y `POST /api/ops/cursors/F01` (HMAC). Si n8n se reinstala, retoma donde iba.
  3. IF: ¿hay eventos? Si no, termina.
  4. Code: agrupa en **un solo mensaje** ("3 fotos nuevas por revisar: Chaleco TNF oliva (catálogo), …; 1 falló: …").
  5. Patrón reclamar → Telegram → marcar enviado, con clave `f01:<últimoEventId>`.
  6. HTTP POST del cursor nuevo.
  7. Recordatorio: si `GET /api/ops/image-jobs/summary` devuelve candidatos `generated` con más de 48 h, se manda un aviso diario (clave `f01:stale:<fecha>`).
- **Entradas:** eventos con `{ jobId, productId, productTitle, kind, judgeVerdict, costUsd }`.
- **Salida:** mensaje de Telegram con el enlace `{{LS_APP_BASE_URL}}/productos/revision`.
- **Credenciales:** `ls_ops_api`, `ls_ops_hmac`, `ls_telegram_owner`.
- **Errores y reintentos:** HTTP con 3 reintentos. Si Telegram falla, el cursor **no** avanza y la siguiente ejecución reenvía.
- **Idempotencia:** cursor en la app + clave `OpsAlert`.
- **Costo:** US$0 en n8n. La generación tiene sus topes en la app (Doc-FotosIA §8.2).
- **Imágenes:** **no** pasan por n8n. Opción (desactivada por defecto) de miniatura: Telegram `sendPhoto` con la **URL** del candidato. Telegram descarga la imagen; n8n no guarda el binario. Es una foto de producto, no de persona, así que está permitido. Se deja apagado por defecto porque el candidato es una URL pública no adivinable que no conviene difundir [A].
- **Métricas:** candidatos pendientes, edad máxima, tasa de aprobación (la calcula la app y sale en F05e).
- **Criticidad:** tolerante. Si n8n no corre, el owner ve los pendientes en el dashboard (Doc-FotosIA ya prevé avisos en el dashboard).

**Aprobar o rechazar se hace siempre en la app** [A]: la sesión, el rol owner y la auditoría (`reviewedById`) ya están ahí. Aprobar desde Telegram exigiría webhook entrante, enlazar la identidad de Telegram con un usuario y otra superficie de ataque, a cambio de ahorrar un clic.

---

### F02. Guardián de presupuesto e interruptor (`LS-F02-presupuesto`)

- **Objetivo:** avisar del gasto diario y mensual por proveedor al 50/80/100 % y apagar automáticamente lo que se desvíe. **No** es el tope: el tope lo aplica la app de forma síncrona (reserva antes de llamar, Doc-Cliente §6.4; techos de Doc-BajoCosto §4.3 y Doc-FotosIA §8.2).

**Fuente de verdad del gasto (en la app):**
- Probador: `TryOnUsage` con proveedor y costo estimado (Doc-BajoCosto §5, "un solo `TryOnUsage` para ambos modos con proveedor y costo estimado").
- Fotos: `ProductImageJob.costUsd` (Doc-FotosIA §7.1).
- Endpoint nuevo `GET /api/ops/budget` que devuelve, por **proveedor** (`cloudflare_ai`, `fashn`, `ai_gateway`, `gemini`, `decart`) y por **ámbito** (`tryon`, `photo_ai`): `{ spentDayUsd, capDayUsd, spentMonthUsd, capMonthUsd, units (imágenes, neuronas estimadas, segundos), errorsLastHour, callsLastHour, flags }`. Los topes salen de las variables ya definidas (`TRYON_DAILY_BUDGET_USD`, `TRYON_MONTHLY_BUDGET_USD`, `PHOTO_AI_MONTHLY_BUDGET_USD`, etc.). Para Cloudflare en el plan Free, el "tope" relevante es la cuota de 10.000 neuronas/día [Doc-BajoCosto].

- **Disparador:** Schedule cada hora (720 ejecuciones/mes). Con la laptop, al despertar recupera sola, porque el estado vive en la app.
- **Nodos:**
  1. Schedule Trigger (cada hora, minuto 5).
  2. HTTP GET `/api/ops/budget`.
  3. Code: para cada proveedor × ámbito × periodo, calcula el % y el **umbral más alto cruzado** (50, 80, 100). Genera claves `budget:<ámbito>:<proveedor>:<día|mes>:<periodo>:<umbral>`. También detecta **anomalías**: `errorsLastHour / callsLastHour > 30 %` con al menos 10 llamadas, o `callsLastHour` más de 3 veces la media de 7 días (posible abuso de un enlace).
  4. Switch por severidad:
     - 50 %: informativo.
     - 80 %: aviso.
     - 100 %: aviso "la app ya bloqueó (comprobado: `flags`)". Si la app **no** muestra el bloqueo (fallo de la reserva), n8n hace `POST /api/ops/flags {key: "tryon.enabled", enabled: false, reason: "F02: gasto 100 % sin bloqueo"}`.
     - Anomalía de errores en el proveedor de calidad alta: apagar `tryon.hq.enabled` (degrada a estándar, Doc-BajoCosto §4.4 punto 7).
     - Pico de llamadas: solo aviso. El owner decide si apagar `tryon.client.enabled`.
  5. Reclamar → Telegram → marcar enviado, por cada clave nueva.
- **Entradas y salidas:** JSON de presupuesto → mensajes y, como mucho, banderas **apagadas**.
- **Credenciales:** `ls_ops_api`, `ls_ops_hmac`, `ls_telegram_owner`.
- **Errores y reintentos:** 3 reintentos en el GET. Si `/api/ops/budget` falla 3 horas seguidas, aviso "no puedo vigilar el presupuesto" (clave `budget:blind:<fecha>`). Los topes de la app siguen activos.
- **Idempotencia:** claves `OpsAlert` por umbral y periodo: un solo aviso por umbral. Apagar una bandera ya apagada no tiene efecto.
- **Límites de costo:** este flujo no gasta. Su función es proteger. Los valores iniciales de los umbrales salen de Doc-BajoCosto §4.3 por nivel: A (US$0; vigila la cuota de neuronas), B (US$0.50/día, US$10/mes), C (US$2/día, US$50/mes). Para fotos, US$10/mes con aviso al 50 y 80 % (Doc-FotosIA §8.2).
- **Datos personales:** ninguno. `TryOnUsage` guarda hashes de IP con sal (Doc-Cliente §6.4), y el endpoint **no** los devuelve, solo agregados.
- **Métricas:** % del presupuesto por proveedor, número de avisos y de apagados automáticos, tasa de error por proveedor.
- **Criticidad:** **tolerante por diseño.** Si n8n cae, la app sigue respetando los topes. Lo que se pierde es el aviso temprano y la detección de anomalías.

**Interruptor manual (cómo se apaga el probador):**
1. El owner, en el dashboard → "Probador: apagado" (acción de servidor, rol owner) → `AppFlag("tryon.enabled") = false`. Efecto en ≤ 30 s, sin redeploy.
2. Emergencia sin acceso a la app: en Vercel, `TRYON_ENABLED=false` + redeploy (interruptor maestro).
3. Automático: F02 solo apaga (R-4).

---

### F03. Conciliación de uso con los proveedores (`LS-F03-conciliacion`)

- **Objetivo:** comprobar que el ledger de la app coincide con lo que cobran los proveedores. Detecta fugas (llamadas que no pasaron por el contador), claves robadas usadas fuera de la app y cambios de precio.
- **Disparador:** Schedule diario a las 07:00 para el día anterior, y mensual el día 2 para el mes anterior. Es idempotente por fecha: si la laptop estuvo apagada, el siguiente arranque concilia **todos los días sin conciliar** (`GET /api/ops/reconciliation/pending` devuelve las fechas pendientes).
- **Nodos (por cada fecha pendiente):**
  1. HTTP GET `/api/ops/usage/daily?date=YYYY-MM-DD` → unidades y costo estimado por proveedor según la app.
  2. En paralelo, la lectura de cada proveedor (todas en **modo lectura**):

     | Proveedor | Cómo leer el uso | Credencial n8n (nombre) | Estado |
     |---|---|---|---|
     | Cloudflare Workers AI | API GraphQL de Analytics (dataset de inferencias de Workers AI, neuronas por día) | `ls_cf_analytics_read` (token con solo *Account Analytics: Read*) | [NV]: nombre exacto del dataset y campos |
     | FASHN | Endpoint de saldo de créditos; el consumo es la diferencia diaria del saldo | `ls_fashn_read` | [NV]: si existe una clave de solo lectura. Si no la hay, **no** se pone la clave de generación en n8n (R-3): la app expone el saldo en `GET /api/ops/providers/fashn/balance` y la clave se queda en Vercel |
     | Vercel AI Gateway (fotos) | Uso o gasto del Gateway por API, o el *budget* configurado en Vercel | `ls_vercel_read` (token de solo lectura del equipo, si existe ese alcance [NV]) | [NV] |
     | Gemini directo (solo si se adopta, fase 3 de fotos) | No hay API de gasto sencilla; los presupuestos de GCP mandan correo | — | Conciliación **manual mensual** con la factura; F03 solo recuerda hacerla |
     | Decart (solo nivel C, en vivo) | Panel del proveedor; API de uso [NV] | — | Manual mensual, como dice Doc-Personal §7.2 |

  3. Code: compara por proveedor. Desviación = `|proveedor − app| / max(app, 0.01)`.
     - ≤ 10 % o < US$0.25 absoluto: OK.
     - 10–25 %: aviso.
     - > 25 % y > US$1: aviso urgente y `POST /api/ops/flags` para apagar **el proveedor afectado** (`tryon.hq.enabled` si es FASHN, `photo_ai.enabled` si es Gateway) [A].
  4. HTTP POST `/api/ops/reconciliation` (HMAC) con `{ date, provider, appUsd, providerUsd, status }`. Lo guarda la app; es la marca de "conciliado".
  5. Aviso con el patrón reclamar → enviar, clave `recon:<proveedor>:<fecha>`.
  6. **Saldo bajo de prepago:** si el saldo de FASHN es menor que lo que se gasta en 7 días, aviso "recargar o se agotará la calidad alta" (clave `fashn:lowbalance:<semana>`).
- **Credenciales:** `ls_ops_api`, `ls_ops_hmac`, `ls_telegram_owner` y las de lectura de la tabla. Ninguna puede generar imágenes.
- **Errores y reintentos:** cada proveedor en una rama con *Continue On Fail*: si un proveedor falla, se concilian los demás y la fecha queda "parcial" (se reintenta al día siguiente). Tres días seguidos sin poder leer un proveedor generan un aviso.
- **Idempotencia:** marca de conciliación por fecha y proveedor en la app; POST con *upsert*.
- **Costo:** US$0. Las APIs de lectura no se cobran [C].
- **Datos personales:** ninguno: solo totales.
- **Métricas:** desviación por proveedor y día, días sin conciliar, saldo de prepago y días de autonomía.
- **Criticidad:** tolerante. Pasa a **imprescindible** cuando se active el nivel B o C (hay dinero real en juego) y antes del piloto de 10 demos de Decart (Doc-BajoCosto, Fase 5).

---

### F04. WhatsApp: enlace o QR firmado del probador y seguimiento

**Decisión del autor: este flujo NO va en n8n.** Razones:
1. El webhook de WhatsApp ya vive en la app y Doc-Replan quitó n8n de ese camino [V]. Meta reintenta durante 36 h y después descarta [V, Doc-Dominio §4.4]: un n8n en la laptop o la Pi perdería mensajes.
2. El enlace firmado se genera con `TRYON_LINK_SECRET` (HMAC, 24 h, 3–5 usos; Doc-BajoCosto §4.4). Si n8n lo firmara, el secreto saldría de Vercel. Si n8n pidiera el enlace a la app, n8n vería el teléfono del cliente y el enlace (que da acceso a generar con IA).
3. El seguimiento necesita el número del cliente. Mantenerlo solo en Vercel/Neon reduce dónde vive ese dato personal (R-2).

**Diseño (en la app):**
- **Entrega del enlace:** en `processMessage`, nueva opción de menú "Probarme una prenda" (o el texto `PROBAR SKU: …` que manda el botón del catálogo) → la app crea `TryOnLink` (id, productId opcional, expiresAt, usesLeft, canal `whatsapp`; **sin** guardar el teléfono en esta tabla) → responde con `{{SITE_URL}}/catalogo?probar=<token>`. Las URLs salen de `NEXT_PUBLIC_SITE_URL` (Doc-Dominio §4.4), no de los 5 enlaces fijos actuales [V].
- **QR de tienda:** una página de la PWA (`/probador/qr`, solo personal) muestra el QR del día, que rota a medianoche. No se imprime ni se reparte por n8n.
- **Seguimiento "¿te gustó? aparta tu talla":**
  - Solo con **opt-in** explícito en el mismo chat ("¿Quieres que te avise para apartar tu talla?" → botón "Sí"). Sin opt-in no hay seguimiento [A].
  - Se guarda `WhatsAppFollowUp { phone, productId, dueAt = +2 h, status, sentAt }`, con el teléfono **cifrado en la aplicación** [A] y borrado a los 7 días.
  - Un **Vercel Cron** cada 15 min (`/api/cron/followups`, protegido con `CRON_SECRET` [C]) envía los vencidos **dentro de la ventana de 24 h** de atención al cliente, en la que se permiten mensajes libres [C]. Si la ventana ya cerró, **no** se manda plantilla de marketing (cuesta y requiere aprobación de Meta) [A]: se descarta.
  - Máximo **un** seguimiento por enlace. "No, gracias" o "STOP" cancela.
  - Texto: "¿Qué tal se te vio el {{producto}}? Si quieres, te aparto tu talla 24 h: responde APARTAR". La respuesta entra por el flujo de apartado que ya existe [V].
- **Rol de n8n:** ninguno en tiempo real. F05e recibe agregados (`enlaces emitidos`, `pruebas hechas`, `seguimientos enviados`, `apartados tras prueba`) sin teléfonos.
- **Criticidad:** crítico, pero en Vercel. Por eso no está en n8n.

**Relación con `docs/n8n-whatsapp-plan.md`:** ese plan (AI Agent + Mercado Pago en n8n) ya estaba reemplazado por Doc-Replan. Este documento lo confirma. El único punto que sobrevive es `/api/bot/products` con `x-bot-key`, que sigue disponible por si algún día se monta un agente en n8n como canal **secundario**. Si ocurre, que sea con un número de WhatsApp de pruebas, nunca con el de producción.

---

### F05. Operación

#### F05a. Deploy fallido (`LS-F05a-deploys`)

- **Objetivo:** enterarse en Telegram de que falló un deploy de producción o de que producción no está en el último commit de `main`.
- **Primero lo nativo:** Vercel ya avisa por correo y en los *checks* de GitHub [C]. Este flujo solo **unifica el canal**. Por eso está en "después".
- **Disparador:** Schedule cada 15 min en horario de trabajo (09:00–23:00).
- **Nodos:** HTTP GET a la API de Vercel `v6/deployments?projectId=…&target=production&limit=5` (credencial `ls_vercel_read`) → filtrar `state == ERROR` o `CANCELED` → reclamar `deploy:<id>` → Telegram con el commit, el autor y el enlace al log. Además compara el `sha` desplegado con el último de `main` (GitHub API, `ls_github_read`): si difieren durante más de 1 h, aviso.
- **Idempotencia:** clave por id de deployment.
- **Costo y datos personales:** US$0; ninguno.
- **Criticidad:** tolerante.

#### F05b. Salud de dominio, DNS y SSL (`LS-F05b-dominio`)

- **Disponibilidad (fuera de n8n, a propósito):** monitor externo gratis (UptimeRobot o Better Stack [C: plan gratis con intervalos de 5 min]) sobre `https://loloshop.y4ga.app/api/health`, con aviso por Telegram o correo. Un monitor que corre en la laptop no puede avisar de que la laptop o la red de casa están caídas, y no ve lo que ve un cliente.
- **n8n, una vez al día (07:30):**
  1. Cloudflare API (`ls_cf_dns_read`, token *Zone DNS: Read* de `y4ga.app`): el registro `loloshop` sigue siendo un CNAME con `proxied: false`. Si alguien lo pone en naranja, rompe el reto HTTP-01, aplica TLS 1.3 mínimo y duplica la caché (riesgo R4 de Doc-Dominio) → aviso.
  2. Que no aparezca un comodín `*.y4ga.app` (Doc-Dominio §4.9).
  3. Caducidad del certificado: nodo Code con `tls.connect` (requiere `NODE_FUNCTION_ALLOW_BUILTIN=tls,crypto`) → días restantes. Aviso si quedan < 20 días (Vercel renueva solo [C]; si no lo hizo, algo anda mal).
  4. Verificación de contenido: `GET /api/health` → `version` igual al sha de producción de F05a.
  5. Mientras dure la transición de dominio (30 días): `HEAD https://lolo-shop.vercel.app/sw.js` = 200 y `/catalogo` = 308 (Doc-Dominio §7, paso 2.5).
- **Idempotencia:** clave `domain:<check>:<fecha>`.
- **Criticidad:** el monitor externo es la parte crítica (no depende de n8n). Lo de n8n es tolerante.

#### F05c. Respaldo de la BD Neon (proceso fuera de n8n; n8n vigila) (`LS-F05c-backup-vigia`)

**Por qué urgente:** Neon guarda historial para restaurar a un punto en el tiempo, pero con una ventana corta en el plan Free [NV: horas o 1 día según el plan vigente]. Una copia **lógica, externa y cifrada** protege contra un borrado accidental, una migración mal aplicada (el baseline de `prisma migrate` está pendiente), la pérdida de la cuenta o una purga. El 2026-08-31 se perdió una BD por no tener copia [V].

- **Dónde corre el respaldo (decisión del autor):** **no** dentro de un workflow de n8n, sino en un contenedor `backup-cron` en el mismo host (VPS):
  ```
  pg_dump --format=custom "$NEON_BACKUP_DATABASE_URL" \
    | age -r "$BACKUP_AGE_RECIPIENT" \
    | rclone rcat r2:loloshop-backups/neon/YYYY/MM/loloshop-YYYYMMDD-HHMM.dump.age
  ```
  - `NEON_BACKUP_DATABASE_URL`: rol de Neon de **solo lectura** dedicado (el mismo que CLAUDE.md recomienda para el MCP `postgres`), no `neondb_owner`.
  - `age` con **clave pública** en el host. La **clave privada** queda fuera de línea, en manos del owner (gestor de contraseñas + copia impresa). Así, aunque comprometan el VPS o R2, el respaldo no se puede leer.
  - Destino **Cloudflare R2** (10 GB gratis [C]); bucket privado, token de R2 con permiso solo de escritura en ese bucket. Regla de ciclo de vida: diarios 14 días, semanales 8 semanas, mensuales 12 meses.
  - **No** con GitHub Actions: el repo es público. Los secretos se enmascaran, pero los registros y los artefactos de un repo público son visibles, y un error de configuración filtraría la BD [A].
  - Sin VPS (fase 0): el mismo script corre en la laptop con un timer de systemd y la condición "último respaldo hace más de 20 h", así recupera al encender.
- **n8n (`LS-F05c-backup-vigia`), diario a las 10:00:**
  1. S3 → *List* en R2 (`ls_r2_backups_read`, solo lectura) → el objeto más reciente.
  2. Code: aviso si la edad es > 26 h o el tamaño < 50 % de la mediana de 7 días (dump truncado).
  3. Reclamar `backup:<fecha>` → Telegram.
  4. **Recordatorio mensual** (día 1): "Simulacro de restauración pendiente". El simulacro es **manual**: descifrar, `pg_restore` en una rama de Neon o en un Postgres local, contar filas por tabla y anotarlo. Es la lección del 2026-08-31.
- **Datos personales:** el dump contiene usuarios con hash bcrypt, movimientos y, cuando exista, `WhatsAppFollowUp` (teléfonos cifrados). Por eso va cifrado de extremo a extremo y n8n **solo ve metadatos** (nombre, tamaño, fecha).
- **Costo:** US$0 (R2 dentro de la capa gratuita para pocos GB [C]).
- **Criticidad:** el respaldo es un proceso importante, pero tolera retrasos de horas. El vigía es tolerante.

#### F05d. Aviso de inventario bajo (`LS-F05d-stock-bajo`)

- **Objetivo:** un único resumen al abrir la tienda con las variantes que se están agotando, por ubicación.
- **Hoy no existe un umbral en el esquema** [V: `InventoryLevel` solo tiene `available`]. Propuesta: umbral global `LOW_STOCK_THRESHOLD` (p. ej. 1) y más adelante un `Variant.lowStockThreshold Int?` opcional [A].
- **Disparador:** Schedule diario a las 09:00, de lunes a sábado.
- **Nodos:** HTTP GET `/api/ops/inventory/low` → la app devuelve `[{ location, product, sku, size, color, available, salidas7d }]`, ordenado por `salidas7d` (lo que más se vende primero) → si la lista está vacía, nada → Code: un mensaje con un máximo de 20 líneas y "+N más" → reclamar `lowstock:<fecha>` → Telegram.
- **Por qué no en tiempo real:** cada salida (−1) generaría un mensaje. En una tienda pequeña eso es ruido y el owner deja de leerlos [A].
- **Datos personales:** ninguno.
- **Criticidad:** tolerante. Si el resumen llega a las 11:00 porque la laptop se encendió tarde, sigue sirviendo.

#### F05e. Reporte semanal al owner (`LS-F05e-reporte-semanal`)

- **Disparador:** lunes a las 08:00, para la semana anterior (lunes a domingo). Clave `weekly:<año>-W<semana>`: si se pierde el lunes, se envía en la primera ejecución posible (Schedule diario que comprueba si ya se envió la semana).
- **Contenido:** lo calcula `GET /api/ops/report/weekly?week=…` en la app (lógica probada con Vitest, R-6):
  - Ventas: salidas (`Movement` con delta −1) por tienda y top 5 de productos; comparación con la semana anterior.
  - Inventario: variantes agotadas y en mínimo (de F05d).
  - Probador: pruebas por modo, tasa de éxito, gasto vs. presupuesto por proveedor, enlaces emitidos → pruebas → apartados (de F04). Sin imágenes ni teléfonos.
  - Fotos IA: candidatos generados, aprobados y rechazados por motivo, costo (Doc-FotosIA §10 fase 4).
  - Operación: disponibilidad (si el monitor expone API [NV]; si no, se omite), deploys fallidos, días sin respaldo, desviaciones de conciliación.
- **Nodos:** Schedule → HTTP GET → Code (plantilla de texto fija, **sin LLM**: cuesta, no hace falta y podría inventar cifras) → Telegram (y opcionalmente correo con el nodo SMTP o Gmail, credencial `ls_mail_owner`).
- **Datos personales:** solo agregados.
- **Criticidad:** tolerante.

#### F05f. Limpieza y retención (en la app, Vercel Cron)

- Borrar blobs `productos/candidatos/…` de trabajos `rejected` o `generated` con más de 14 días (Doc-FotosIA ya borra al rechazar; esto barre lo olvidado).
- Borrar filas de `TryOnUsage` con hash de IP de más de 2 días (Doc-Cliente §6.4 habla de "limpieza diaria"), `OpsEvent` de más de 30 días, `WhatsAppFollowUp` de más de 7 días y `TryOnLink` vencidos.
- **Por qué en la app y no en n8n:** son borrados de datos personales y de Blob con `BLOB_READ_WRITE_TOKEN`. Deben ocurrir aunque n8n no exista (es una obligación de retención, no una comodidad) [A]. Vercel Cron en Pro permite esta frecuencia [C].
- n8n solo lee el resultado (`GET /api/ops/cleanup/last`) dentro del reporte semanal.

---

### F06. Flujos de desarrollo y proceso

| Candidato | Valor real | Veredicto |
|---|---|---|
| Resumen diario de commits y PRs | GitHub ya lo da (pestaña Pulse, notificaciones). Con tres agentes (Antigravity, Claude Code, Codex) sería una lista larga que nadie lee | **Descartado** (ruido) |
| Checklist de revisión vía n8n | Va mejor como plantilla de PR (`.github/pull_request_template.md`) y en CI (lint, test, build, gitleaks ya existen [V]) | **Descartado** en n8n; plantilla de PR fuera de este alcance |
| Issue → recordatorio de sprint | Útil solo si se usan issues con milestone. Hoy el plan vive en specs | **Descartado** hasta que haya milestones |
| **Digest de inicio de jornada** | Coordina el trabajo en paralelo de tres agentes: PRs abiertos con más de 3 días (p. ej. el #17 [V, memoria]), CI rojo en `main`, alertas de Dependabot o del job `security`, ramas que tocan los mismos archivos | **Se conserva como F06**, en "después" |
| Caducidad de tokens (Cloudflare, Vercel, Meta, R2) | Un token caducado rompe en silencio F03 o F05 | Incluido en F06 como sección mensual |

**F06 `LS-F06-digest-dev`:**
- **Disparador:** Schedule a la hora de inicio de la jornada (a definir con el dueño), de lunes a viernes. Si ya se envió ese día, nada.
- **Nodos:** GitHub API (`ls_github_read`, token *fine-grained* de solo lectura sobre el repo) → PRs abiertos con su antigüedad y estado de checks, último run de `ci.yml` y `security.yml` en `main` → Code: detectar PRs que tocan los mismos archivos (riesgo de conflicto entre agentes) → Telegram, un solo mensaje de menos de 15 líneas.
- **Mensual (día 1):** lista de credenciales de n8n con su fecha de caducidad (anotada en la descripción de cada credencial) → aviso si caduca en menos de 30 días.
- **Datos personales y costo:** ninguno; US$0.
- **Criticidad:** tolerante.

---

## 5. Seguridad y privacidad

### 5.1 Qué flujos tocan imágenes y cuáles no

| Flujo | ¿Imágenes? | Justificación |
|---|---|---|
| Probador (cliente y personal) | **Nunca en n8n** | Son fotos de personas: van del navegador a la Route Handler y al proveedor, en memoria, con `no-store` (Doc-Cliente §6.1, Doc-Personal §6.1). Meterlas en n8n las dejaría en el historial de ejecuciones (base de datos o disco de n8n), en otro equipo y fuera del aviso de privacidad |
| F01 Fotos de producto | **No por defecto**; opcionalmente la URL del candidato a Telegram | Son fotos de prendas, no de personas (si aparece una mano, la limpieza la quita). Aun así, el pipeline está en la app por disponibilidad, secretos y auditoría, no por privacidad |
| F02–F06 | No | Solo números agregados, IDs y metadatos |
| F05c Respaldo | Ningún binario de imagen; el dump va cifrado y n8n solo ve metadatos | La BD solo guarda URLs de Blob, no binarios |

**Controles que lo hacen cumplir (no solo la intención):**
1. Los endpoints `/api/ops/*` tienen **pruebas de contrato** (Vitest) que fallan si la respuesta incluye `data:image`, cadenas base64 de más de 1 KB, campos `phone` o `ipHash`, o URLs de Blob fuera de `productos/` [A].
2. En n8n de producción no se instalan nodos de comunidad con acceso a ficheros ni se habilitan *Execute Command* ni *Read/Write Files from Disk* [A] (en versiones recientes vienen deshabilitados por defecto [NV]; se confirma en la versión instalada).
3. El modo de datos binarios no se usa: ningún flujo descarga imágenes. Si alguno lo hiciera por error, la configuración de §5.2 evita que se guarde.

### 5.2 Configuración de la instancia de n8n (nombres de variables; valores en el `.env` del host, nunca en el repo)

| Variable | Valor propuesto | Para qué |
|---|---|---|
| `EXECUTIONS_DATA_SAVE_ON_SUCCESS` | `none` | No guardar entradas ni salidas de ejecuciones correctas [C] |
| `EXECUTIONS_DATA_SAVE_ON_ERROR` | `all` | Poder depurar fallos; los flujos ya no llevan datos personales |
| `EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS` | `false` en prod, `true` en dev | |
| `EXECUTIONS_DATA_SAVE_ON_PROGRESS` | `false` | |
| `EXECUTIONS_DATA_PRUNE` / `EXECUTIONS_DATA_MAX_AGE` | `true` / `168` (horas = 7 días) | Poda de lo que sí se guarde |
| `N8N_ENCRYPTION_KEY` | Secreto propio, con respaldo **fuera** del host | Cifra las credenciales en la BD de n8n. Si se pierde, se pierden todas las credenciales |
| `N8N_DIAGNOSTICS_ENABLED` | `false` | Sin telemetría |
| `N8N_PERSONALIZATION_ENABLED` | `false` | |
| `NODE_FUNCTION_ALLOW_BUILTIN` | `crypto,tls` | HMAC y comprobación de certificado en nodos Code |
| `NODE_FUNCTION_ALLOW_EXTERNAL` | vacío | Sin paquetes npm en Code |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | `false`, **con la regla** de que el entorno del contenedor solo tenga variables **no secretas** (`LS_APP_BASE_URL`, `GENERIC_TIMEZONE`) | Los secretos van en credenciales, no en `$env` |
| `GENERIC_TIMEZONE` / `TZ` | `America/Mexico_City` | Horarios de los cron |
| `DB_TYPE` | `postgresdb` (contenedor propio, **no** Neon) | Separar la BD de n8n de la de la tienda |
| `N8N_SECURE_COOKIE` / autenticación | Activado; usuario owner de n8n con 2FA [C] | Editor protegido aunque esté detrás de Access |

> Los nombres siguen la documentación de n8n según conocimiento previo [C]. Hay que revisarlos contra la versión instalada antes de desplegar [NV].

Además, en **cada workflow** (Settings): "Save successful production executions: Do not save" y "Save manual executions: Do not save" en prod. Así queda explícito aunque cambie la configuración global.

### 5.3 Secretos y credenciales

| Dónde | Qué | Regla |
|---|---|---|
| Vercel (Production/Preview) | `OPS_API_KEY`, `OPS_HMAC_SECRET`, `CRON_SECRET`, `TRYON_LINK_SECRET`, claves de proveedores, `BLOB_READ_WRITE_TOKEN` | Valores **distintos** por entorno. `.env.example` solo con nombres |
| Credenciales de n8n | `ls_ops_api`, `ls_ops_hmac`, `ls_telegram_owner`, `ls_cf_analytics_read`, `ls_cf_dns_read`, `ls_vercel_read`, `ls_github_read`, `ls_r2_backups_read`, `ls_fashn_read` (si existe), `ls_mail_owner` | Todas de **lectura**, salvo `ls_ops_*` (que solo permite apagar banderas, reclamar avisos y avanzar cursores) y Telegram |
| Host de n8n (`.env` con permisos 600) | `N8N_ENCRYPTION_KEY`, contraseña de la BD de n8n, `NEON_BACKUP_DATABASE_URL`, `BACKUP_AGE_RECIPIENT` (pública), token de escritura de R2 | Nunca en el repo; respaldo de `N8N_ENCRYPTION_KEY` en el gestor de contraseñas |
| Fuera de línea | Clave privada `age` de los respaldos | Solo el owner |

- **Rotación:** `OPS_API_KEY` y `OPS_HMAC_SECRET` cada 6 meses o ante cualquier sospecha. La app acepta **dos valores** durante la rotación (`OPS_API_KEY` y `OPS_API_KEY_NEXT`) para no cortar n8n [A].
- **Agentes de desarrollo (Claude Code, Codex, Antigravity):** pueden usar la API de n8n **de dev** (el MCP `n8n-local` cuando se arregle su 401). **Nunca** reciben la clave de API del n8n de producción ni las credenciales de §5.3 [A].
- **Peor caso si comprometen n8n:** el atacante puede leer agregados de la tienda, apagar el probador o las fotos IA y mandar mensajes al Telegram del owner. **No** puede gastar en proveedores, leer fotos de personas, obtener teléfonos de clientes, encender nada ni leer los respaldos (cifrados con una clave que no está en el host).

### 5.4 Datos personales y LFPDPPP

- n8n **no** es encargado de datos de clientes con este diseño: no recibe fotos, teléfonos ni IPs. Por eso no hace falta mencionarlo en el aviso de privacidad. Si se aceptara la miniatura de F01, Telegram vería fotos de producto, que no son datos personales.
- Telegram sí recibe **datos de negocio** (ventas, stock). Es aceptable para un chat privado del owner [A]. No se mandan nombres de usuarios del personal en los avisos, solo roles.
- No es asesoría legal; aplica lo dicho en Doc-Cliente §5 y Doc-Personal §6.4.

---

## 6. Versionado y entornos

### 6.1 Workflows en el repo

- Carpeta `n8n/workflows/` con un archivo por workflow: `LS-F02-presupuesto.json`, etc. Además `n8n/README.md` con la tabla de credenciales esperadas (solo nombres) y las variables de §5.2. Ambos se crean en la tarea de implementación, no ahora.
- **Exportación:** `n8n export:workflow --all --separate --output=n8n/workflows/` (CLI de n8n [C]). La función de control de versiones con Git integrada es de pago [C], así que no se usa.
- **Higiene antes del commit** (script `scripts/n8n-sanitize` con un test): elimina `pinData` (datos fijados de prueba, que podrían ser reales) y `staticData`; fuerza `active: false`; ordena las claves para que los diffs sean legibles; quita `id` de instancia y `versionId` si generan ruido. Falla si encuentra:
  - cabeceras con valores en los nodos HTTP (`x-ops-key`, `Authorization`) en vez de referencias a credenciales,
  - patrones de token (los mismos de gitleaks) o teléfonos en formato E.164,
  - URLs absolutas a `loloshop.y4ga.app` o `localhost` en vez de `{{$env.LS_APP_BASE_URL}}`.
- Las credenciales **nunca** se exportan (`export:credentials` está prohibido en este repo). El JSON del workflow solo guarda el **nombre** e ID de la credencial, lo cual es aceptable.
- **CI:** `gitleaks` ya escanea cada push y PR [V, `security.yml`]. Se añade al job de `ci.yml` la ejecución del sanitizador en modo comprobación sobre `n8n/workflows/*.json`.
- **Importación en prod:** `n8n import:workflow --separate --input=n8n/workflows/` en el VPS después del merge (manual o con un script de despliegue por SSH). Luego se activan a mano los que corresponda. Así nada se activa solo por un commit.

### 6.2 Entornos

| | Dev | Prod |
|---|---|---|
| Host de n8n | Laptop (`localhost:5679`) | VPS (o n8n Cloud) |
| App destino (`LS_APP_BASE_URL`) | `http://localhost:3000` o un deployment Preview | `https://loloshop.y4ga.app` |
| BD de la app | Rama de Neon de desarrollo [NV: ramas disponibles en el plan] o Postgres local | Neon producción |
| `OPS_API_KEY` / `OPS_HMAC_SECRET` | Valores de Preview | Valores de Production (distintos) |
| Telegram | Bot o chat de pruebas | Chat del owner |
| Proveedores en F03 | Respuestas simuladas (nodo Set con datos de ejemplo **inventados**) | APIs reales de solo lectura |
| Ejecuciones guardadas | Todas (para depurar), con datos sintéticos | Solo fallidas, poda a 7 días |

- **Preview de Vercel:** `/api/ops/*` responde 503 si falta `OPS_API_KEY`, igual que `/api/bot/products` sin `BOT_API_KEY` [V]. Así un Preview sin configurar no queda abierto.
- **Protección de despliegues de Vercel** en Preview: si está activa, n8n de dev necesita el *bypass token* (`x-vercel-protection-bypass`, credencial `ls_vercel_bypass_dev`) [C].
- **Versión de n8n fijada** en `docker-compose.yml` del host; las actualizaciones se prueban primero en la laptop.

---

## 7. Priorización con horas

Estimaciones para una persona con agentes de código (5 h/día). Incluyen pruebas y documentación mínima. **No** incluyen el baseline de migraciones Prisma (prerrequisito compartido con Doc-Personal y Doc-FotosIA) ni el trabajo propio del probador o del pipeline de fotos, que ya están en sus specs.

| Prioridad | Pieza | Lado | Horas | Depende de |
|---|---|---|---|---|
| **Imprescindible** | §4.0 Base `/api/ops/*`: auth con `OPS_API_KEY` + HMAC, `AppFlag` con caché y apagado desde el dashboard, `OpsEvent`, `OpsAlert`, `/api/health`, excepción en `middleware.ts`, pruebas de contrato sin PII | App | 8–10 | Baseline de migraciones |
| **Imprescindible** | F00 Errores + bot de Telegram del owner | n8n | 1–1.5 | — |
| **Imprescindible** | F02 Guardián de presupuesto (`/api/ops/budget` + flujo) | App 2–3 + n8n 2 | 4–5 | §4.0, ledger del probador y de fotos |
| **Imprescindible** | F05c Respaldo cifrado a R2 + vigía + **primer simulacro de restauración** | Host 3 + n8n 1 + simulacro 2 | 5–6 | Rol de Neon de solo lectura, cuenta de R2 |
| **Imprescindible** | Monitor externo de `/api/health` | SaaS | 0.5 | `/api/health` |
| | **Subtotal imprescindible** | | **~19–23** | |
| Útil | Hospedaje de producción: VPS + Docker Compose + ajustes de §5.2 + respaldo de n8n | Infra | 4–6 | Decisión del dueño (§9) |
| Útil | Versionado: carpeta, sanitizador con test, paso en CI | Repo | 2–3 | — |
| Útil (imprescindible con nivel B/C) | F03 Conciliación (Cloudflare + FASHN + Gateway) | App 2 + n8n 3–4 | 5–6 | F02; APIs [NV] |
| Útil | F01 Aviso de fotos pendientes | n8n 1.5 + app 1 (cursores) | 2.5 | Fase 1 de Doc-FotosIA |
| Útil | F05d Inventario bajo | App 1.5 + n8n 1 | 2.5 | §4.0 |
| Útil | F05e Reporte semanal | App 3 + n8n 1 | 4 | F02, F05d |
| Útil | F05b DNS/SSL | n8n | 2 | Corte de dominio (Doc-Dominio fase 1) |
| Útil | F05f Limpieza y retención (Vercel Cron) | App | 2–3 | Tablas del probador y de fotos |
| Después | F04 Enlace firmado por WhatsApp + seguimiento con opt-in (Vercel Cron) | App | 6–8 | Fase 3 de Doc-BajoCosto, WhatsApp en producción |
| Después | F05a Deploys | n8n | 1 | — |
| Después | F06 Digest de desarrollo + caducidad de tokens | n8n | 2 | — |
| Descartado | Pipeline de fotos en n8n, agente IA de WhatsApp en n8n, resumen de commits, checklist por n8n, QR por n8n | — | 0 | — |

**Orden sugerido por sprints de 5 h:**
1. **Sprint 1 (≈ 2 días):** §4.0 + F00 + monitor externo. Primero se puede vigilar.
2. **Sprint 2 (≈ 1.5 días):** F05c con simulacro. No depende del probador y protege lo que ya existe.
3. **Sprint 3 (≈ 1 día):** F02, **antes** de que el probador o las fotos IA gasten un dólar.
4. **Sprint 4 (≈ 2 días):** VPS + versionado + F01 + F05d.
5. **Sprint 5 (≈ 2 días):** F03 (al activar el nivel B) + F05e + F05b + F05f.
6. **Después:** F04, F05a, F06.

**Volumen de ejecuciones estimado (para dimensionar n8n Cloud):** F02 720 + F01 ~720 (cada 30 min, 12 h al día) + F05a ~1.700 (cada 15 min, 14 h) + diarios ~150 ≈ **3.300/mes** con F05a, o **~1.600** sin él. Si se elige n8n Cloud Starter, F05a se deja en la notificación nativa de Vercel y F01 pasa a cada hora.

---

## 8. Riesgos

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| N1 | Se acaba poniendo lógica crítica en n8n "porque es rápido" (p. ej. el tope de gasto) y n8n está apagado | Media | Alto (gasto sin control) | R-1 y R-4; topes en la app con pruebas; revisión de cada flujo nuevo contra la tabla de §4 |
| N2 | Una foto de persona acaba en una ejecución de n8n (alguien añade un flujo de "debug" del probador) | Baja | Muy alto (privacidad) | R-2; pruebas de contrato de `/api/ops`; ajustes de no guardar ejecuciones; prohibido explícitamente en `n8n/README.md` |
| N3 | El editor de n8n queda expuesto (hoy `n8n-local.y4ga.app` existe y no se sabe si tiene Access) | Media | Alto | Verificarlo ya; modelo pull sin puertos; Access + 2FA si se publica |
| N4 | Se pierde `N8N_ENCRYPTION_KEY` o el disco del VPS | Media | Medio (rehacer credenciales) | Respaldo de la clave en el gestor de contraseñas; workflows en el repo; estado (cursores, avisos) en la app, no en n8n |
| N5 | Fatiga de avisos: demasiados mensajes y el owner deja de leerlos | Alta | Medio | Un mensaje por evento agrupado; umbrales 50/80/100 con un solo aviso cada uno; resúmenes diarios en lugar de tiempo real |
| N6 | APIs de uso de los proveedores inexistentes o cambiantes (FASHN, AI Gateway, Decart [NV]) | Alta | Medio | F03 con ramas independientes y estado "parcial"; conciliación manual mensual como respaldo; nunca poner claves de generación en n8n |
| N7 | El respaldo falla en silencio o no se puede restaurar | Media | Muy alto | Vigía de edad y tamaño (F05c) + simulacro mensual documentado |
| N8 | Fuga de un JSON de workflow con secretos o datos reales al repo público | Media | Alto | Sanitizador + gitleaks en CI; credenciales nunca en nodos; `pinData` eliminado |
| N9 | Spam de WhatsApp o costo de plantillas por el seguimiento | Media | Medio (reputación del número, bloqueo de Meta) | Opt-in explícito, un solo seguimiento, solo dentro de la ventana de 24 h, sin plantillas de marketing |
| N10 | Doble fuente de gasto (app vs. proveedor) desalineada por fallos o tiempo de espera del proveedor (cobra aunque la app registró error) | Media | Bajo-medio | Registrar el costo también en los fallos con estado "desconocido"; F03 lo detecta |
| N11 | Operar un VPS añade trabajo a un único desarrollador | Media | Bajo | Docker Compose mínimo, versión fijada, actualizaciones trimestrales; alternativa n8n Cloud |
| N12 | Cambios de horario o de zona en los cron (horario de verano: México lo eliminó en 2022 [C]) | Baja | Bajo | `GENERIC_TIMEZONE` explícito |

---

## 9. Preguntas para el dueño

1. **Hospedaje:** ¿prefieres un VPS de ~US$4–6/mes que operamos nosotros, o n8n Cloud (~€24/mes [NV]) sin servidor? ¿O seguir solo con la laptop hasta activar el nivel B?
2. **Canal de avisos:** ¿Telegram te sirve (gratis y sin plantillas)? Si tiene que ser WhatsApp, los mensajes que inicia el negocio fuera de la ventana de 24 h requieren plantillas aprobadas y tienen costo [C].
3. **`n8n-local.y4ga.app`:** ¿a qué apunta ese túnel y tiene Cloudflare Access delante? Si publica el editor de la laptop sin Access, hay que cerrarlo ya.
4. ¿Quién guarda la **clave privada de los respaldos** (age)? Quien la tenga es quien puede restaurar la BD.
5. ¿Autorizas una cuenta de **Cloudflare R2** para los respaldos (gratis hasta 10 GB [C]) y un rol de Neon de solo lectura?
6. ¿Qué **umbral de inventario bajo** quieres (1 pieza por talla, 2…)? ¿Distinto por tienda o por producto?
7. ¿A qué hora quieres el resumen de stock y en qué día y hora el reporte semanal? ¿A qué hora empieza la jornada de desarrollo (para F06)?
8. **Seguimiento por WhatsApp:** ¿lo quieres, con opt-in y un solo mensaje 2 h después? ¿O prefieres no escribir nunca primero?
9. ¿Los avisos de presupuesto deben llegar también a alguien más (encargado) o solo a ti?
10. ¿Aceptas que n8n pueda **apagar solo** el probador o las fotos IA ante gasto anómalo, sabiendo que volver a encenderlos es manual?

---

## 10. Decisiones del autor (el dueño debe validarlas)

- **Decisión del autor:** n8n fuera del camino crítico (R-1). Los topes de gasto, el webhook de WhatsApp, el enlace firmado y el pipeline de fotos viven en la app.
- **Decisión del autor:** pipeline de fotos de producto **en la app** (alineado con Doc-FotosIA). `docs/n8n-image-pipeline.md` queda reemplazado.
- **Decisión del autor:** aprobación de fotos solo en la app (`/productos/revision`), no con botones de Telegram.
- **Decisión del autor:** modelo **pull** (outbox `OpsEvent` + cursores en la app). n8n sin exposición pública por defecto.
- **Decisión del autor:** credencial nueva `OPS_API_KEY` + `OPS_HMAC_SECRET`, separada de `BOT_API_KEY`.
- **Decisión del autor:** interruptor como `AppFlag` en la BD (efectivo = env AND flag, caché de 30 s). n8n solo puede **apagar** (R-4). Nunca se editan variables de Vercel desde n8n.
- **Decisión del autor:** deduplicación de avisos en la app (`OpsAlert`, "reclamar y luego enviar"), no en *static data* de n8n.
- **Decisión del autor:** n8n no guarda claves de generación de los proveedores; solo de lectura o, si no existen, la app hace de intermediario (R-3).
- **Decisión del autor:** F04 (enlace firmado y seguimiento) en la app con Vercel Cron; seguimiento con opt-in, uno por enlace, solo dentro de la ventana de 24 h y teléfono cifrado y borrado a los 7 días.
- **Decisión del autor:** Telegram como canal interno del owner.
- **Decisión del autor:** respaldo de Neon con `pg_dump | age | R2` desde un contenedor del host (no GitHub Actions, por ser repo público; no dentro de un workflow de n8n). n8n solo lo vigila. Simulacro de restauración mensual.
- **Decisión del autor:** disponibilidad vigilada por un monitor externo gratuito, no por n8n.
- **Decisión del autor:** reporte semanal con plantilla fija, sin LLM.
- **Decisión del autor:** inventario bajo como resumen diario, no aviso por cada salida.
- **Decisión del autor:** limpieza y retención de datos en Vercel Cron (la app), no en n8n.
- **Decisión del autor:** hospedaje: laptop para dev ya; VPS pequeño para prod al llegar a 3 flujos o al nivel B; la Pi solo con las puertas de Doc-Dominio §7.C.
- **Decisión del autor:** versión de n8n fijada, workflows exportados al repo saneados (sin `pinData`, `active: false`) y sin credenciales; importación y activación manuales en prod.
- **Decisión del autor:** se descartan los flujos de proceso de desarrollo salvo un digest diario de inicio de jornada (F06), que va en "después".

---

## Incertidumbres explícitas

- Nombres exactos y comportamiento de las variables de n8n en la versión que se instale (§5.2) [NV].
- Existencia de APIs de uso o saldo de solo lectura en FASHN, AI Gateway y Decart, y nombre del dataset de Workers AI en la API GraphQL de Cloudflare [NV].
- Precio y tope de ejecuciones vigentes de n8n Cloud; precio vigente de los VPS citados [NV].
- Ventana de restauración a un punto en el tiempo del plan de Neon actual [NV].
- Frecuencias de Vercel Cron permitidas en el plan vigente (se asume Pro, como recomienda Doc-Dominio) [C].
- Reglas y precios actuales de la ventana de 24 h y de las plantillas de WhatsApp en México [C].
- Si `n8n-local.y4ga.app` tiene Cloudflare Access [NV].
