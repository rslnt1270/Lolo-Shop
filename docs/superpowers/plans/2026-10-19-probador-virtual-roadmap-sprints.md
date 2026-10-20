# LoloShop: plan maestro por sprints (probador virtual, fotos con IA, dominio y4ga.app y n8n)

- **Fecha:** 2026-10-19 · **Estado:** propuesta para aprobación del dueño · **No contiene secretos** (repo público)
- **Une y ordena:** los seis documentos de `docs/superpowers/specs/2026-10-19-*.md`:
  - `probador-cliente-foto` (Doc-Cliente)
  - `probador-personal-vivo` (Doc-Personal)
  - `probador-bajo-costo` (Doc-BajoCosto)
  - `fotos-producto-ia` (Doc-FotosIA)
  - `loloshop-dominio-y4ga` (Doc-Dominio)
  - `n8n-flujos` (Doc-n8n)
- **Ritmo de trabajo:** jornadas de 5 h con Claude Code, Codex y Antigravity (Gemini). Sprints de **2 semanas = 50 h**, de las que se **planifican 40 h** y quedan 10 h de margen para imprevistos, revisión y soporte de la tienda.

---

## 1. Qué se va a construir (resumen)

| Pieza | Decisión vigente | Origen |
|---|---|---|
| Dominio | `loloshop.y4ga.app`, en Vercel con CNAME **gris** en Cloudflare. Transición de ~30 días desde `lolo-shop.vercel.app` | Dueño (dominio) + Doc-Dominio |
| Fotos de producto | Edición con IA generativa (candidato principal: Nano Banana 2.1 vía Vercel AI Gateway) con **aprobación del owner**. La foto original se conserva siempre | Dueño + Doc-FotosIA |
| Modo cliente | Try-on **por foto** desde el catálogo de la PWA en el móvil, abierto **solo con enlace/QR firmado** | Dueño (por foto) + Doc-BajoCosto (enlace firmado: **por validar**) |
| Modo personal (tienda) | **Solo el owner.** Base **híbrida**: cámara en vivo local sin IA, y la IA solo corre en cada captura. Decart en vivo (30 s) queda como extra opcional | Dueño (roles) + Doc-BajoCosto |
| Captura | Vive solo en memoria y se borra. **No se guarda nunca** en LoloShop | Dueño |
| Automatización | n8n como back-office (vigila, avisa y concilia). **Nunca** en el camino crítico ni con fotos de personas | Doc-n8n |
| Presupuesto | Topes duros en la app + prepago en los proveedores. Niveles A/B/C (§3) | Doc-BajoCosto + Doc-FotosIA |

**Nada de IA se construye antes del piloto de calidad (Sprint 2).** Todas las calidades están sin verificar con prendas reales.

---

## 2. Contradicciones resueltas entre documentos

| Tema | Conflicto | Resolución en este plan |
|---|---|---|
| Limpieza de prendas | Doc-BajoCosto usa Cloudflare klein-4B (US$0.0013, entradas < 512 px). Doc-FotosIA usa Nano Banana 2.1 (US$0.034–0.05) | La **foto de catálogo** es un costo único por producto y el logo de TNF importa: candidato **Nano Banana 2.1**. Klein-4B solo para el **try-on** si pasa el piloto. Decide el piloto (Sprint 2) |
| Modo personal | Doc-Personal: Decart en vivo para varios roles. Dueño: solo el owner, con bajo costo | **Híbrido, solo owner.** Decart queda como extra de 30 s, apagado por defecto y solo si el piloto convence |
| Acceso del modo cliente | Doc-Cliente: abierto en `/catalogo`. Doc-BajoCosto: solo por enlace/QR | **Enlace/QR firmado** (menos abuso, menos costo). **Pendiente de validación del dueño** |
| Pipeline de fotos | `docs/n8n-image-pipeline.md` (en n8n) frente a Doc-FotosIA (en la app) | **En la app**. n8n solo avisa. Se marca el doc viejo como reemplazado |
| Tablas | `TryOnSession`, `TryOnUsage`, `ProductImageJob`, `AppFlag`, `OpsEvent` y `OpsAlert` repartidas entre docs | Se crean por sprint, siempre con `prisma migrate` y **después del baseline** (Sprint 0) |
| `n8n-local.y4ga.app` | Doc-n8n no pudo verificar si estaba protegido | **Verificado el 2026-10-19:** responde 403 con Cloudflare Access (`cf-access-domain`). Riesgo cerrado |

---

## 3. Presupuesto y límites integrados

### 3.1 Costos fijos mensuales

| Concepto | Costo | Cuándo | Nota |
|---|---|---|---|
| Vercel Pro | **US$20** (incluye US$20 de uso) | Sprint 0 | Obligatorio **ya**: Hobby prohíbe el uso comercial, con o sin probador |
| Cloudflare (DNS, Access, Workers AI Free) | US$0 | — | Workers Paid (US$5) solo si se rebasa la cuota en el nivel C |
| n8n en VPS | ~US$4–6 [NV] | Sprint 6 | Hasta entonces, la laptop (dev). n8n Cloud ~€24 si no quieres operar un servidor |
| R2 para respaldos | US$0 (≤ 10 GB) [C] | Sprint 0 | Respaldo cifrado de Neon |
| Monitor externo (UptimeRobot/Better Stack) | US$0 | Sprint 1 | Plan gratis |
| **Total fijo** | **~US$20 hoy, ~US$26 desde el Sprint 6** | | |

### 3.2 Gasto de IA (variable, con tope duro)

| Partida | Tope | Mecanismo de tope duro |
|---|---|---|
| Piloto de fotos (una vez, Sprint 2) | **US$25** | Crédito prepagado de AI Gateway **sin recarga automática**. Photoroom en sandbox gratis |
| Piloto de try-on (una vez, Sprint 2) | **US$10** | Mínimo de FASHN (US$7.50) + Cloudflare gratis + Gemini centavos |
| Fotos de producto en operación | **US$10/mes** (~70 productos), techo **US$25/mes** | `PHOTO_AI_MONTHLY_BUDGET_USD` + budget de AI Gateway |
| Carga del catálogo existente | ~US$0.15/producto (≈ US$45 por 300, o ≈ US$23 con Batch) | **Autorización aparte**, por lotes de 50 |
| Try-on: Nivel **A** | **US$0** | Cloudflare Free falla al agotar la cuota (~85 imágenes/día) |
| Try-on: Nivel **B** | **≤ US$10/mes** | Saldo FASHN prepagado (calidad alta solo para el owner) |
| Try-on: Nivel **C** | **≤ US$50/mes** | Más saldo FASHN; Decart 30 s con tope de segundos |

**Arranque propuesto:** Nivel **A** para el try-on y US$10/mes para fotos. Gasto total en el primer mes con pilotos: **~US$20 fijo + ≤ US$35 de pilotos + ≤ US$10 de fotos.** Cada salto de nivel lo aprueba el dueño con datos del Sprint 2.

### 3.3 Topes en la app (todos comprobados en el servidor; ninguno depende de n8n)
- **Interruptor maestro:** `env AND AppFlag` por función (`tryon`, `tryon.client`, `tryon.hq`, `tryon.live`, `photo_ai`). n8n solo puede **apagar**.
- **Reserva de gasto antes de llamar al proveedor:** tope diario y mensual en USD, con reversión si el proveedor falla por una entrada inválida.
- **Cuotas:** 3 pruebas por enlace de cliente en 24 h, 5 capturas por demo, 40 llamadas de fotos al día y 4 intentos por producto y tipo.
- **Avisos al 50/80/100 %** por Telegram (n8n F02). El tope duro sigue siendo el de la app.

---

## 4. Reparto de herramientas (propuesta)

| Herramienta | Para qué | Para qué no |
|---|---|---|
| **Claude Code** | Specs y planes, revisión de seguridad y privacidad, revisión de PRs, investigación con subagentes, verificación final (build/test/lint), operaciones con MCP (Vercel, Cloudflare en solo lectura) | Escribir en paralelo el mismo archivo que otra herramienta |
| **Codex** | Implementación de tareas bien acotadas con TDD (lógica de `lib/`, Route Handlers, migraciones con `prisma migrate`, tests de Vitest) | Decisiones de diseño o de privacidad sin spec |
| **Antigravity (Gemini)** | Prototipos de UI (pantalla de revisión de fotos, `/probador`, consentimiento, selector de prendas), pruebas visuales en el navegador. Útil también para iterar prompts de Nano Banana en el piloto (mismo ecosistema Google) | Lógica de servidor con secretos |
| **n8n** | Flujos de Doc-n8n (F00, F02, F03, F05x) | Todo lo crítico, todo lo que toque fotos o teléfonos |

**Regla anti-choques:** una rama o worktree por herramienta y por tarea (`feat/sN-<tarea>`), PR pequeño a `main` y CI en verde antes del merge. El que integra (Claude) revisa `git status`/`git log` antes de commitear, porque hay trabajo en paralelo (memoria del proyecto).

---

## 5. Puertas de decisión del dueño

| Puerta | Antes de | Pregunta |
|---|---|---|
| **D0** | Sprint 0 | ¿Pagas Vercel Pro (US$20/mes)? ¿Apruebas `loloshop.y4ga.app`? ¿Aceptas Telegram como canal de avisos y R2 para respaldos? |
| **D1** | Sprint 2 | ¿Autorizas los pilotos (≤ US$25 fotos + ≤ US$10 try-on)? ¿Consigues fotos **originales del carrete** y voluntarios con consentimiento? |
| **D2** | Sprint 3 | Con los resultados del piloto: ¿qué proveedor de fotos? ¿estilo ghost mannequin o flat-lay? ¿leyenda "Imagen editada con IA"? |
| **D3** | Sprint 4 | ¿Proveedor estándar de try-on (klein-4B, NB2.1 o FASHN)? ¿En el modo híbrido aceptas que la captura viaje al proveedor (sin guardarse en LoloShop), con consentimiento expreso? |
| **D4** | Sprint 5 | ¿Modo cliente solo por enlace/QR? ¿Texto del aviso de privacidad revisado por un abogado? |
| **D5** | Sprint 6 | ¿VPS o n8n Cloud? ¿Subir a nivel B/C? ¿Activar Decart 30 s? |

Si una puerta no se aprueba, el sprint siguiente se re-planifica. **No se construye por adelantado.**

---

## 6. Sprints

> Fechas propuestas a partir del 2026-10-20 (L–V). Capacidad: 40 h planificadas por sprint. Horas = estimación con agentes de código, incluyendo pruebas.
> **Temporada alta:** El Buen Fin (mediados de noviembre [NV: confirmar fecha 2026]) y diciembre. **No se hacen cortes de producción riesgosos** (dominio, migraciones) en esas fechas. Del 2026-12-18 al 2027-01-06: congelamiento de cambios en producción; solo se trabaja en ramas y en Preview.

### Sprint 0: Cimientos (2026-10-20 → 2026-10-30)
**Objetivo:** que la base sea segura y legal antes de añadir nada.

| # | Tarea | Herramienta | h | Hecho cuando |
|---|---|---|---|---|
| 0.1 | Decisiones D0; pasar a **Vercel Pro** | Dueño | 1 | Billing muestra Pro |
| 0.2 | Cerrar el **PR #17** (Next 15.5 + React 19 + Serwist): prueba manual y merge | Dueño + Claude | 5 | Deploy de producción verde y PWA instalable |
| 0.3 | `reset-users.ts` en producción (pendiente desde septiembre) | Dueño | 1 | Cada rol inicia sesión en prod |
| 0.4 | **Respaldo de Neon** (`pg_dump \| age → R2`) + **primer simulacro de restauración** (F05c, solo la parte de host). **Va antes de 0.5** | Claude + Codex | 6 | Restauración documentada en una BD scratch con conteo de filas |
| 0.5 | **Baseline de `prisma migrate`**: ensayar en una rama de Neon y luego `migrate resolve` en prod. Cambiar `db:push` por `migrate deploy` en el flujo | Claude (diseño) + Codex | 8 | `prisma migrate status` limpio en prod; CLAUDE.md actualizado |
| 0.6 | Commit de los 6 specs y de este plan; marcar `docs/n8n-image-pipeline.md` como reemplazado | Claude | 1 | PR `docs:` mergeado |
| 0.7 | PR `feat(dominio)` **con el flag apagado**: `NEXT_PUBLIC_SITE_URL` en las 5 URLs del webhook, `metadataBase`, `id`/`scope` en el manifest, redirección por `Host` detrás de `LEGACY_HOST_REDIRECT`, aviso de "nueva dirección" | Codex | 8 | `lint`, `test` y `build` en verde; producción idéntica |
| 0.8 | Consultas escritas a proveedores (retención, entrenamiento, región): FASHN, Cloudflare, Google y Decart | Dueño (Claude redacta) | 2 | Respuestas archivadas **fuera del repo** |
| | **Total** | | **32** | + margen |

### Sprint 1: Dominio y base de operación (2026-11-02 → 2026-11-13)
**Objetivo:** LoloShop en `loloshop.y4ga.app` y la app capaz de vigilarse.

| # | Tarea | Herramienta | h | Hecho cuando |
|---|---|---|---|---|
| 1.1 | Alta del dominio en Vercel + CNAME **gris** en Cloudflare (Doc-Dominio fase 1) | Claude (guía) + Dueño | 2 | `curl -sI` → `server: Vercel`, certificado Let's Encrypt; `y4ga.app` sin cambios contra la línea base |
| 1.2 | **Corte** (Doc-Dominio fase 2) en una ventana de bajo uso, **antes del Buen Fin**: `NEXTAUTH_URL`, callback de Meta, URL de n8n, flag de redirección | Dueño + Claude | 4 | Pruebas de humo por rol, mensaje real de WhatsApp con el enlace nuevo |
| 1.3 | Reinstalación de la PWA en cada dispositivo (checklist firmado) | Dueño | 2 | Lista de dispositivos completa |
| 1.4 | Base `/api/ops/*`: `OPS_API_KEY` + HMAC, `AppFlag` (con caché de 30 s y apagado desde el dashboard), `OpsEvent`, `OpsAlert`, `/api/health`, excepción en el middleware, pruebas de contrato sin datos personales | Codex (TDD) + Claude (revisión de seguridad) | 10 | Tests verdes; `/api/ops` responde 401 sin clave; un `enabled:true` desde ops devuelve 403 |
| 1.5 | n8n **F00** (errores) + bot de Telegram del owner | Claude/Dueño en n8n | 2 | Un error forzado llega a Telegram |
| 1.6 | Monitor externo de `/api/health` | Dueño | 0.5 | Alerta de prueba recibida |
| 1.7 | n8n **F05c** (vigía del respaldo) | n8n | 1 | Aviso cuando el respaldo tiene más de 26 h |
| 1.8 | Exportar workflows saneados al repo (`n8n/`) + gitleaks en CI | Codex | 3 | CI falla ante un JSON con credenciales |
| 1.9 | Guía de foto para el personal (texto y ejemplos) + **sesión de fotos** de 10–15 prendas con fondo liso | Dueño + Antigravity (diseño de la guía) | 4 | 10–15 prendas con foto frontal original |
| | **Total** | | **28.5** | + margen (el corte puede requerir más) |

### Sprint 2: Pilotos de calidad, sin código de producto (2026-11-16 → 2026-11-27)
**Objetivo:** decidir con datos qué proveedores sirven. Puerta **D1** antes de empezar.

| # | Tarea | Herramienta | h | Hecho cuando |
|---|---|---|---|---|
| 2.1 | Scripts de piloto **fuera del repo** (o en una rama desechable) con AI Gateway | Claude + Codex | 5 | Ledger del piloto con costo real |
| 2.2 | **Piloto de fotos**: 6 capturas + 10–15 fotos originales × NB2.1, NB Pro, FLUX.3/FLUX.2 pro, Photoroom (sandbox) y otros de Doc-FotosIA §10.2. Evaluación a ciegas con la rúbrica (logo eliminatorio, ΔE color ≤ 5) | Antigravity (iterar prompts) + Claude (evaluación) | 10 | Tabla de resultados; ≥ 80 % aprobables y 0 logos deformados aceptados |
| 2.3 | **Piloto de try-on**: 3–4 voluntarios con consentimiento × prendas limpias × {klein-4B, NB2.1, FASHN} | Claude + Dueño | 8 | ≥ 70 % con puntuación ≥ 4 por proveedor |
| 2.4 | Demo del modo **híbrido** como prototipo desechable (cámara local + captura → proveedor) en tablet o móvil real, con la red de la tienda | Antigravity | 6 | Video corto de la demo y latencia medida |
| 2.5 | Opcional: 2–3 sesiones de prueba de Decart (30 s) para comparar el "efecto wow" | Dueño | 2 | Decisión de si Decart entra en el nivel C |
| 2.6 | Informe del piloto y recomendación final para D2/D3 | Claude | 3 | Documento `docs/superpowers/specs/…-piloto-resultados.md` |
| | **Total** | | **34** | Gasto ≤ US$35 |

### Sprint 3: Fotos de producto con IA (MVP) y guardián de presupuesto (2026-11-30 → 2026-12-11)
**Objetivo:** el owner mejora fotos con IA y las aprueba, sin pasar del presupuesto. Puerta **D2**.

| # | Tarea | Herramienta | h | Hecho cuando |
|---|---|---|---|---|
| 3.1 | Migración: `originalImageUrl`, `imageSource`, `ProductImageJob` | Codex | 3 | `migrate deploy` en Preview y prod |
| 3.2 | Subir el **original** (sin recorte 1:1 ni auto-niveles, 2048 px); `uploadImage` generalizado | Codex | 4 | Alta de producto guarda original + vista previa |
| 3.3 | Acción "Mejorar foto" **solo owner** (rol re-leído en BD), AI Gateway, caché por `inputHash`, 1 reintento, ledger de costo | Codex + Claude (revisión) | 8 | Tests: 403 para otros roles; tope 429/503; caché evita doble cobro |
| 3.4 | `/productos/revision`: original contra candidato, zoom sincronizado al logo, checklist, aprobar/rechazar/regenerar/restaurar | Antigravity (UI) + Codex (acciones) | 10 | El owner aprueba y el catálogo cambia; al rechazar se borra el candidato |
| 3.5 | Juez automático (prioriza la revisión, **nunca aprueba**) | Codex | 3 | Veredicto visible en la revisión |
| 3.6 | `/api/ops/budget` + n8n **F02** (avisos 50/80/100 % y apagado) | Codex + n8n | 5 | Simulación de gasto dispara los avisos y el apagado |
| 3.7 | Leyenda "Imagen editada con IA" y galería con "Foto real" | Antigravity | 2 | Visible en `/catalogo` |
| | **Total** | | **35** | |

### Sprint 4: Prenda lista para try-on y modo owner híbrido (2026-12-14 → 2026-12-24)
**Objetivo:** el owner hace demos en tienda. Puerta **D3**. *Congelamiento desde el 12-18: se despliega a Preview y se usa en tienda desde Preview con el owner, o se pasa a prod el 12-17.*

| # | Tarea | Herramienta | h | Hecho cuando |
|---|---|---|---|---|
| 4.1 | Migración: `tryOnImageUrl`, `tryOnCategory`, `tryOnView`, `TryOnUsage` | Codex | 3 | Migración aplicada |
| 4.2 | Salida "lista para try-on" desde la revisión de fotos | Codex | 3 | La prenda aprobada tiene `tryOnImageUrl` |
| 4.3 | `lib/tryon/`: interfaz `TryOnProvider`, proveedor ganador del piloto + `MockProvider`, validación por magic bytes, reserva de gasto | Codex (TDD) | 8 | Tests de contrato; la clave nunca aparece en errores ni en el bundle |
| 4.4 | Route Handler `POST /api/probador` (`no-store`, `maxDuration`) | Codex | 4 | Tests 400/403/429/503/200 |
| 4.5 | `/probador` **solo owner**: consentimiento, cámara local, selector de prendas, "Capturar", resultado en memoria con borrado garantizado (sin descargar ni compartir), Wake Lock, estados de red | Antigravity (UI) + Codex (lógica) | 12 | Prueba en dispositivo real; tests de "no persistencia" (sin `localStorage`, Blob ni `fetch` con la imagen hacia LoloShop) |
| 4.6 | Revisión de seguridad y privacidad del flujo | Claude | 3 | Informe sin hallazgos bloqueantes |
| | **Total** | | **33** | |

### Sprint 5: Modo cliente por enlace/QR (2027-01-07 → 2027-01-20)
**Objetivo:** los clientes prueban prendas desde su móvil, con costo acotado. Puerta **D4**.

| # | Tarea | Herramienta | h | Hecho cuando |
|---|---|---|---|---|
| 5.1 | Enlaces firmados (HMAC, 24 h, 3 usos) emitidos desde la PWA; QR diario para la tienda | Codex | 6 | Tests de firma, expiración y usos |
| 5.2 | Entrega del enlace por el webhook de WhatsApp (F04, en la app) | Codex | 4 | Mensaje real con enlace funcional |
| 5.3 | UI en `/catalogo`: botón "Probar" solo con token y prenda elegible, consentimiento (mayoría de edad, proveedor nombrado), captura con `<input capture>`, redimensionado en cliente, estados de espera y error | Antigravity + Codex | 12 | Pruebas en iOS Safari y Android Chrome |
| 5.4 | Proyección pública mínima de productos (sin SKU ni inventario) | Codex | 2 | Test: `/catalogo` no expone SKU ni stock |
| 5.5 | `/privacidad` con el texto revisado; middleware actualizado | Dueño (abogado) + Codex | 3 | Página publicada y enlazada |
| 5.6 | BotID (Basic) + límite por IP con hash y sal | Codex | 4 | Prueba en Preview |
| 5.7 | Respaldo gratuito: imagen "puesta en modelo" pregenerada por prenda | Codex | 3 | Se muestra al agotar la cuota |
| | **Total** | | **34** | |

### Sprint 6: Operación profesional y lanzamiento controlado (2027-01-21 → 2027-02-03)
**Objetivo:** que todo funcione solo, se mida y se pueda escalar con datos. Puerta **D5**.

| # | Tarea | Herramienta | h | Hecho cuando |
|---|---|---|---|---|
| 6.1 | n8n a producción (VPS con Docker Compose y versión fijada, o n8n Cloud) | Claude + Dueño | 5 | Flujos activos fuera de la laptop |
| 6.2 | F01 (fotos pendientes), F05d (inventario bajo), F05e (reporte semanal), F05b (DNS/SSL) | n8n + Codex (endpoints) | 10 | Avisos reales en Telegram |
| 6.3 | F03: conciliación con proveedores (imprescindible si se sube a B/C) | n8n + Codex | 6 | Diferencia app/proveedor < 5 % |
| 6.4 | F05f: limpieza y retención (Vercel Cron) | Codex | 3 | Candidatos huérfanos borrados |
| 6.5 | Lanzamiento controlado: 2 semanas con topes bajos, métricas de uso, aprobación y costo | Dueño + Claude | 4 | Informe de las 2 semanas |
| 6.6 | Cierre del dominio (Doc-Dominio fase 3: redirección 308 total) | Claude | 1 | `vercel.app` redirige |
| 6.7 | Actualizar `CLAUDE.md`, la memoria y los runbooks | Claude | 2 | PR `docs:` |
| | **Total** | | **31** | |

**Después (backlog sin fecha):** Decart 30 s premium (nivel C), lote nocturno con Gemini Batch, on-model para el catálogo, F05a/F06, AR 2D en el dispositivo y la reconsideración de la RPi5 con las puertas de Doc-Dominio §7.C.

---

## 7. Hitos

| Hito | Sprint | Qué ve el dueño |
|---|---|---|
| H1 Base segura | 0 | Pro, Next 15, migraciones con historial, respaldo restaurable |
| H2 Nuevo dominio | 1 | La PWA en `loloshop.y4ga.app` y avisos en Telegram |
| H3 Decisión con datos | 2 | Informe del piloto con imágenes reales y costos |
| H4 Catálogo profesional | 3 | Fotos mejoradas y aprobadas en el catálogo |
| H5 Demos en tienda | 4 | `/probador` del owner en la tablet |
| H6 Clientes prueban | 5 | Enlace o QR para probarse prendas desde el móvil |
| H7 Operación estable | 6 | Reporte semanal, conciliación y topes probados |

Duración total: **~7 sprints ≈ 15 semanas** (con el receso de fin de año), cerca del **2027-02-03**.

---

## 8. Definición de terminado (cada tarea)
1. Spec o tarea con criterio de verificación escrito antes de codificar. TDD con proveedores **mockeados**: ningún test gasta dinero.
2. `npm run lint`, `npm test`, `npm run build` y `tsc` en verde. CI y gitleaks en verde.
3. Sin secretos en el diff; variables nuevas solo como **nombres** en `.env.example`.
4. Comprobación de rol en el servidor (re-leyendo el usuario en BD cuando la acción cuesta dinero).
5. Para todo lo que toque fotos de personas: test de "no persistencia" y revisión de privacidad.
6. Migraciones solo con `prisma migrate` y probadas en una rama de Neon antes de prod.
7. PR pequeño, revisado por una herramienta distinta de la que lo escribió.

---

## 9. Riesgos del plan

| Riesgo | Mitigación |
|---|---|
| Los pilotos muestran que ningún modelo barato preserva el logo de TNF | Se sube a FASHN o Photoroom (nivel B) o el try-on de clientes queda sin IA. Lo decide D2/D3 |
| El corte de dominio coincide con temporada alta | Corte antes del Buen Fin; congelamiento del 12-18 al 01-06 |
| Tres herramientas editan lo mismo | Una rama por tarea y herramienta, integración por PR revisado |
| La evaluación legal se retrasa | El modo cliente (Sprint 5) no sale a prod sin `/privacidad` revisada; el modo owner sí puede avanzar |
| El gasto se sale del plan | Prepago sin recarga, topes en la app y avisos F02 desde el Sprint 3 |
| El baseline de migraciones daña prod | Respaldo restaurable (0.4) **antes** del baseline (0.5), que además se ensaya en una rama de Neon |
| Dependencia de proveedores que cambian modelos (Nano Banana original se apagó el 2026-10-02) | Slug configurable, `promptVersion` en el ledger y re-piloto corto ante cada cambio |
