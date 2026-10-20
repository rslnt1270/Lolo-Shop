# Probador virtual — Modo Personal (demostración en vivo)

- **Fecha:** 2026-10-19
- **Estado:** borrador de investigación y diseño (sin código de producto, sin dependencias instaladas)
- **Alcance:** solo el MODO PERSONAL. Sesión iniciada + rol permitido, verificado en el servidor. Demostraciones en tienda con tablet o móvil del personal.
- **Repo público:** este documento solo menciona NOMBRES de variables de entorno, nunca valores.

> Convención de evidencia: **[V]** = leído en la fuente oficial el 2026-10-19 (vía WebFetch; el contenido pasó por un resumidor automático, así que las cifras críticas deben re-verificarse en la página original antes de comprometer presupuesto). **[C]** = claim del proveedor o de un tercero, no verificado de forma independiente. **[N]** = no verificado / no encontrado. **[A]** = supuesto o decisión del autor.

---

## 1. Resumen y decisión recomendada

**Recomendación:** usar **Decart `lucy-vton-latest`** (hoy resuelve a `lucy-vton-3.6`) en modo estándar (no `fast`), conectado directamente desde el navegador con el SDK `@decartai/sdk` y **tokens de cliente efímeros** emitidos por una ruta del servidor de LoloShop que valida sesión + rol + tope de uso.

Por qué:
- Es el único candidato que hoy combina: modelo específico de try-on en tiempo real, SDK JS oficial para navegador, **tokens efímeros con restricciones** (modelo, origen, duración máxima de sesión) y precio público por segundo. [V]
- Precio oficial: **US$0.02 por segundo** de generación a 720p en tiempo real (US$0.04/s en modo `fast`). [V] Una demo de 5 minutos cuesta ~US$6.
- Cambiar de prenda a mitad de sesión no requiere reconectar (`set({ prompt, image })`). [V]

**Respaldo (si el streaming falla o la red es mala):** degradación en dos niveles, sin enviar nada nuevo a terceros por defecto:
1. **Nivel 0 (por defecto, sin IA):** mostrar la captura local (en memoria) junto a la foto del producto del catálogo, para que el cliente compare. No sale nada del dispositivo.
2. **Nivel 1 (opcional, requiere decisión del usuario, ver sección 11):** try-on por foto con la MISMA captura contra una API de imagen (candidatas en sección 3). Esto implica **subir una foto del cliente a un tercero**, lo que contradice el espíritu "solo en memoria"; no se recomienda activarlo sin consentimiento explícito y revisión legal.

**Alternativas descartadas por ahora:** Vidu S2-Editing (sin precio/límites verificables, repo sin código), JoyAI-Video-Edit autoalojado (viable técnicamente pero desproporcionado en operación para una tienda; ver sección 3 y 4). Se deja como "plan B de coste" si el volumen supera ~160 min activos/mes (sección 4).

**Hallazgos del repo que condicionan el diseño:**
- La sesión es **JWT** (`session: { strategy: "jwt" }`) y el `role` se congela en el token al iniciar sesión; no se re-lee de la BD. Para un endpoint que cuesta dinero, hay que **re-validar el usuario contra la BD** al emitir el token (sección 5).
- `middleware.ts` protege por defecto todo salvo una lista de excepciones; una ruta `/api/probador/*` quedaría tras `next-auth/middleware`, pero **no hay que confiar en eso**: la ruta debe verificar sesión y rol por sí misma (igual que `createLocationAction`).
- **No existe `prisma/migrations/`** y `package.json` usa `db:push`, aunque CLAUDE.md dice "Migraciones: Prisma (`prisma migrate`)". Añadir una tabla de auditoría obliga a decidir cómo (sección 7 y 11).
- Next.js es **14.2.x** (App Router), React 18.3.1. La compatibilidad de `@decartai/sdk` con este stack [N] debe probarse en la Fase 0.

---

## 2. Objetivos / no-objetivos / anti-objetivos

**Objetivos**
1. El personal abre `/probador`, apunta la cámara al cliente, elige prendas del catálogo y las ve aplicadas en tiempo real.
2. Botón de captura que congela un fotograma **solo en memoria** para mostrarlo al cliente.
3. Control de costo: duración máxima por sesión, corte por inactividad, tope mensual, botón "Terminar demo", registro de uso por usuario/ubicación **sin imágenes**.
4. La clave de API de Decart nunca llega al navegador.
5. Funciona en tablet/móvil (Chrome Android, Safari iOS) con degradación elegante si la red es mala.

**No-objetivos (v1)**
- Modo cliente / autoservicio / catálogo público (`/catalogo` NO recibe esta función).
- Compartir o descargar la captura, historial de capturas, galería.
- Grabación de la sesión de video.
- Try-on de calzado, perfumes y raquetas (ver sección 8.4).
- Modo offline (la función requiere red).
- Medición exacta de facturación (la fuente de verdad del cobro es el panel de Decart).

**Anti-objetivos (cosas que NO deben pasar)**
- Subir, guardar o loguear frames/video del cliente en DB, Blob, logs, analítica o `localStorage`/IndexedDB/Cache Storage.
- Exponer la clave permanente (`dct_...`) con `NEXT_PUBLIC_*` o en el bundle.
- Que una ruta de token sea alcanzable sin sesión+rol (la propia documentación de Decart advierte que su ejemplo no autentica ni limita tasa [V]).
- Que el SW (`next-pwa`) cachee respuestas del endpoint de token.
- Dejar una sesión abierta sin límite (Decart no corta sesiones por token expirado [V]).

---

## 3. Matriz comparativa

| Criterio | **Decart `lucy-vton-3.6`** (directo) | Decart vía **fal.ai** (`decart/lucy2-vton/realtime`) | **Vidu S2-Editing** | **JoyAI-Video-Edit** (autoalojado) | Respaldo foto (p. ej. FASHN, Kling Kolors vía fal) |
|---|---|---|---|---|---|
| Tiempo real | Sí, WebRTC [V] | Sí, WebRTC (`fal.realtime.connect`) [V] | Sí (claim del paper) [C] | Sí (claim) [C] | No |
| Try-on explícito | Sí, modelo VTON dedicado [V] | Sí, pero versión **Lucy 2.1 VTON** (más antigua) [V] | Sí, "virtual try-on" con imagen de prenda [C] | No usa el término; edición por referencia "poner el abrigo de Imagen 1 sobre el modelo" (RV2V) [V] | Sí, por foto |
| Precio | **US$0.02/s** std, US$0.04/s fast, 720p [V] | US$0.02/s [V] | No encontrado [N] | GPU: ~US$0.32–0.72/h en 5090 de mercado [C] | ~US$0.04–0.10 por imagen (FASHN 0.075, Kling Kolors 0.07, image-apps-v2 0.04) [C] |
| Auth para navegador | **Client tokens `ek_`**: TTL 1–3600 s (def. 60), `allowedModels`, `allowedOrigins`, `maxSessionDuration` (mín. 10 s), `metadata` [V] | Clave de fal en el ejemplo; tokens efímeros no mencionados en esa página [N] | No verificado [N] | Lo que construyas | Proxy en servidor |
| Cambio de prenda a mitad de sesión | `set({prompt,image})` sin reconectar [V] | `prompt_ack` / `set_image_ack` en el protocolo [V] | No verificado [N] | Depende del servidor propio | N/A |
| Madurez / acceso | API pública y changelog activo (VTON 3.6 lanzado oct 2026) [V] | Pública | "Research release"; el repo GitHub solo tiene README y figuras; API enlazada pero sin detalles accesibles [V/N] | Código + pesos, licencia **Apache-2.0** [V]; DiT 16B; requiere MiMo-VL y ops CUDA propias [V] | Pública |
| Rendimiento declarado | Sin cifras de fps/latencia en docs; `model.fps/width/height` se leen del SDK [V]. "Latencia imperceptible" es claim del proveedor [C] | Sin cifras [N] | 25–42 fps es para S2-**Avatar**, no Editing [V] | **RTX 5090 (32 GB): 840×480 @ 24 FPS**; RTX PRO 6000: 480p@24 o 720p@16; "30 FPS a 720×1248" sin nombrar GPU en el README (el paper/terceros citan B200) [V] | Segundos por imagen [N] |
| Operación | Cero infra (solo ruta de token) | Cero infra | Desconocida | Alta: GPU, WebRTC/TURN, MiMo-VL, seguridad, escalado | Baja |
| Riesgo principal | Dependencia/costo variable, retención de datos poco clara | Versión rezagada | Falta de información | Calidad de try-on no probada para ropa real; ops | Foto del cliente sale a un tercero |

Fuentes:
- Decart precios: https://docs.platform.decart.ai/getting-started/pricing.md
- Decart tokens de cliente: https://docs.platform.decart.ai/getting-started/client-tokens.md
- Decart VTON: https://docs.platform.decart.ai/models/realtime/virtual-try-on.md y https://platform.decart.ai/models/lucy-vton
- Decart SDK realtime: https://docs.platform.decart.ai/sdks/javascript-realtime.md
- Decart mejores prácticas: https://docs.platform.decart.ai/models/realtime/streaming-best-practices.md
- Decart red: https://docs.platform.decart.ai/integrations/network-requirements.md
- Decart cuota de concurrencia: https://docs.platform.decart.ai/api-reference/get-realtime-quota.md
- Decart changelog: https://docs.platform.decart.ai/changelog.md
- Decart ejemplo e-commerce: https://docs.platform.decart.ai/examples/ecommerce-try-on.md
- fal Lucy 2.1 VTON realtime: https://fal.ai/models/decart/lucy2-vton/realtime
- fal comparativa try-on por foto: https://fal.ai/learn/tools/best-virtual-try-on-apis-2026
- Vidu S2 (paper): https://arxiv.org/html/2609.11638v1 ; repo: https://github.com/shengshu-ai/Vidu-S ; guía de API (contenido no accesible): https://platform.vidu.com/vidu-stream/doc/s2-editing/quick-start
- JoyAI-Video-Edit: https://github.com/jd-opensource/JoyAI-Video-Edit ; paper: https://arxiv.org/html/2608.03974v1
- Precios de GPU (indicativos, de marketplaces): https://www.beam.cloud/blog/nvidia-rtx-5090-pricing , https://www.spheron.network/blog/nvidia-b200-cloud-pricing-2026/

**Correcciones a la información de partida (importante):**
- **Precio de Decart:** había cifras contradictorias. Resuelto con la fuente oficial: **US$0.02/s** para `lucy-vton-3.6`/`3.5` en tiempo real 720p; `fast` = 2x. Un artículo antiguo que cita ~US$0.05/s es de Lucy 2.0 y está obsoleto. La página del modelo muestra "2 créditos/s"; la página de precios no define el valor del crédito, así que **US$0.01/crédito es una inferencia** [A].
- **JoyAI-Video-Edit "RTX 5090 ~24 FPS 480p":** confirmado en el README (840×480 @ 24 FPS en RTX 5090 de 32 GB). Matiz: el "30 FPS a 720p" corresponde a una GPU más grande (un resumen de terceros dice B200); el README no nombra la GPU. [V]
- **Licencia Apache-2.0 de JoyAI:** confirmada en el README. Pero el modelo exige además MiMo-VL y operadores CUDA propios; revisar las licencias de esas dependencias [N].
- **Concurrencia de Decart:** no hay límite por defecto documentado; existe `GET /v1/realtime/quota` (límite `null` = sin límite) y un cierre WebSocket 1013 "Concurrent session limit reached". [V] Hay que preguntar a Decart el límite real de la cuenta.

---

## 4. Análisis de costos

### 4.1 Base de cálculo
- Tarifa: US$0.02/s (estándar), US$0.04/s (`fast`). [V]
- Se factura por segundo de generación activa; no hay mínimo ni suscripción declarados. [V] La cifra de créditos gratis iniciales no está publicada. [N]
- Tiempo de conexión previo a "generating" y tiempo con la demo desconectada **no** debería facturarse (el evento `generationTick` entrega segundos facturables [V]); confirmar con la primera factura [N].
- Tipo de cambio MXN: no incluido en las tablas; si se necesita, usar el vigente al presupuestar [A].

### 4.2 Costo por demo

| Duración activa | Estándar (US$0.02/s) | Fast (US$0.04/s) |
|---|---|---|
| 2 min (120 s) | US$2.40 | US$4.80 |
| 5 min (300 s) | US$6.00 | US$12.00 |
| 10 min (600 s) | US$12.00 | US$24.00 |

### 4.3 Costo mensual (estándar)

| Demos/mes | 2 min | 5 min | 10 min |
|---|---|---|---|
| 20 | US$48 | US$120 | US$240 |
| 100 | US$240 | US$600 | US$1,200 |
| 500 | US$1,200 | US$3,000 | US$6,000 |

(En `fast`, multiplicar por 2.) Regla práctica: **cada minuto activo cuesta US$1.20**; cada hora activa, US$72.

### 4.4 Autoalojado (JoyAI) — orden de magnitud
- Una RTX 5090 de marketplace: ~US$0.32–0.72/h (mediana citada ~US$0.64/h) [C]. Una B200: ~US$3.70–6.80/h en neoclouds [C].
- Una GPU atiende, a primera vista, **una sesión a la vez** a 480p/24 fps [A, inferencia del README]; más concurrencia = más GPUs.
- Con 300 h/mes de GPU encendida (10 h diarias en horario de tienda) a US$0.64/h ≈ US$192/mes. Eso equivale a **~160 min de demo Decart/mes** (≈32 demos de 5 min). Por encima de ese uso, el autoalojado sería más barato en dinero.
- Pero faltan costos reales: SFU/TURN (WebRTC), arranque en frío, observabilidad, pruebas de calidad con ropa real y horas de ingeniería. Y 480p @ 24 fps es menor calidad que 720p. **Conclusión:** no compensa en v1; reevaluar solo si el uso sostenido supera ~100 demos/mes de 5 min (≈US$600/mes en Decart).

### 4.5 Mecanismos de control de costo (todos propuestos, ver sección 5)
1. `constraints.realtime.maxSessionDuration` en el token (el gateway de Decart corta la sesión; no depende del cliente). [V]
2. Corte por inactividad en cliente (sin cambio de prenda/captura/toque N segundos) y por `visibilitychange` (pestaña oculta).
3. Botón "Terminar demo" siempre visible; "Pausar" = desconectar (deja de facturar) y reconectar con token nuevo.
4. Tope mensual global y por ubicación, calculado en servidor con reservas de segundos.
5. Un solo uso concurrente por usuario (rechazar segundo token si hay una sesión abierta reciente).
6. Interruptor global `PROBADOR_ENABLED` y modo `fast` desactivado por defecto.
7. Registro de uso (usuario, ubicación, duración) y conciliación contra el panel de Decart.
8. Alerta/límite de gasto del lado de Decart: [N] no verificado que exista; preguntar.

---

## 5. Seguridad (sesión, rol, token efímero, abuso)

### 5.1 Hechos verificados sobre los tokens de Decart [V]
- Se crean en servidor con la clave permanente: `client.tokens.create({ expiresIn, allowedModels, allowedOrigins, constraints, metadata })`; el navegador recibe `{ apiKey, expiresAt }` (el `apiKey` devuelto es el token efímero).
- `expiresIn`: 1–3600 s, por defecto 60 s. Sin opciones el token es **sin restricciones**.
- La expiración **no desconecta** sesiones activas; solo bloquea nuevas conexiones. El límite real de sesión es `maxSessionDuration`.
- **No se pueden revocar** antes de `expiresAt`; por eso TTL corto. Si se filtra la clave permanente, se revoca en el panel.
- `allowedOrigins` se valida con la cabecera `Origin` del WebSocket; es "defensa en profundidad", no frontera completa (clientes no navegador pueden falsificarla).
- El SDK acepta `apiKeyProvider` (async) y pide token fresco en cada conexión y reconexión (SDK v0.2.6+ según changelog, oct 2026).
- Inconsistencia documentada: una página de terceros hablaba de TTL de 10 min y otra de 60 s; la página oficial dice **60 s por defecto**.

### 5.2 Flujo de autorización propuesto para `POST /api/probador/token`
Ruta de servidor (Route Handler, runtime Node, `dynamic = "force-dynamic"`, solo `POST`):
1. `getServerSession(authOptions)`; si no hay `user.id` -> 401.
2. **Re-leer el usuario en la BD** (id, role, locationId). Si no existe -> 401. Esto cierra el hueco del JWT congelado (rol revocado o usuario borrado siguen válidos en el JWT hasta que expire).
3. Rol permitido: ver 5.3. Si no -> 403.
4. Si no es `owner`, exigir `locationId` no nulo (se imita el patrón de `adjustInventoryAction`, que restringe al colaborador a su ubicación).
5. Interruptor `PROBADOR_ENABLED`; si está apagado -> 503.
6. Tope mensual (global y por ubicación) y concurrencia por usuario consultando la tabla de auditoría (sección 7); en transacción para evitar carreras. Si se excede -> 429 con mensaje claro.
7. Limitación de tasa por usuario (p. ej. máx. N tokens/minuto) para frenar abuso con una sesión robada; en Vercel puede apoyarse en la tabla de auditoría o en Vercel Firewall rate limiting [N: no verificado el plan/límites disponibles].
8. Crear el token con: `expiresIn` ≈ 60, `allowedModels: ["lucy-vton-3.6"]` (o el alias elegido; ver nota abajo), `allowedOrigins` derivado de la configuración, `constraints.realtime.maxSessionDuration` = mín(`PROBADOR_MAX_SESSION_SECONDS`, segundos restantes del tope), `metadata` con `userId` y `locationId` (no PII adicional).
9. Registrar una fila "reserva" (inicio de intento) y responder `{ apiKey, expiresAt, maxSessionSeconds, sessionLogId }`. Cabeceras `Cache-Control: no-store`.

Nota sobre `allowedModels`: si se usa el alias `lucy-vton-latest`, el gateway podría comparar contra el alias o el id resuelto; [N] probar en Fase 0 y preferir fijar `lucy-vton-3.6` explícito para que el costo/calidad no cambien sin avisar.

### 5.3 Roles permitidos [A, decisión del autor]
- **owner, manager:** permitidos sin restricción de ubicación.
- **collaborator:** permitido solo si tiene `locationId` asignado, y la sesión se registra con esa ubicación (no puede elegir otra).
- Justificación: la demo la hace el personal de piso, que en LoloShop son típicamente los colaboradores; excluirlos haría la función inútil. El control de abuso va en topes, no en excluir roles. El usuario debe validar (sección 11).

### 5.4 Abuso y cuentas comprometidas
- Credenciales: `User.password` usa bcrypt; el riesgo realista es una cuenta de colaborador robada generando consumo. Mitigación: topes por usuario, por ubicación y global; alerta cuando se supera X% del tope.
- `allowedOrigins` limita uso del token fuera de la app. Los *previews* de Vercel tienen otros orígenes: definir la lista por entorno (env var, sección 10).
- El front-end es solo UX: ninguna decisión de seguridad (rol, tope, duración) depende del cliente.
- Registro de intentos denegados (sin datos sensibles) para detectar sondeo.

### 5.5 CSP y cabeceras
- El repo hoy **no define cabeceras** en `next.config.mjs`. Se propone añadir (solo para la ruta `/probador`) una CSP y `Permissions-Policy: camera=(self)`. La sección 9.1 lista los hosts a permitir en `connect-src`. [V para los hosts; N para directivas completas: la documentación de red no menciona CSP]
- Evitar `unsafe-eval` si el SDK no lo exige [N: probar].

---

## 6. Privacidad

### 6.1 Principio de diseño (decidido con el usuario)
La captura es un fotograma **en memoria del dispositivo**: no se sube, no se guarda en DB ni Blob, se elimina al cerrar la vista, al tomar otra captura o al terminar la demo; sin botón de descargar/compartir.

Implementación concreta:
- Captura con `canvas.drawImage(videoDelModelo)` -> `canvas.toBlob()` -> `URL.createObjectURL()` solo para mostrarla en un `<img>`; guardar la referencia en estado de React (no en storage).
- Al descartar: `URL.revokeObjectURL`, vaciar el estado, poner `canvas.width = canvas.height = 0`, `img.src = ""`.
- `<img draggable="false">`, `-webkit-touch-callout: none`, `user-select: none`, `contextmenu` bloqueado. **Esto es disuasión, no seguridad:** el sistema operativo permite capturas de pantalla (no se puede impedir en web). Debe quedar dicho al usuario.
- Sin `localStorage`, `IndexedDB`, Cache Storage, ni logs de la imagen. Verificar que el service worker no intercepte `blob:` ni almacene nada de `/probador` (excluir rutas de API y stream de la caché).
- Limpieza ante `pagehide`/`visibilitychange`/desmontaje del componente y cierre de sesión (`signOut`).

### 6.2 Lo que NO podemos garantizar: el tercero
El video del cliente se envía en vivo a Decart. Que la foto "no se guarde" **de nuestro lado** no implica que Decart no retenga o use contenido:
- **Política de privacidad de Decart (actualizada 2026-08-20) [V]:** lista "Audio live recording" y "Video live recording" como datos recolectados en el modelo de video; los datos se conservan "hasta que borremos el registro"; para imágenes/videos generados indica como finalidad "mejorar y desarrollar nuestra Plataforma, nuestros productos y servicios y realizar investigación". No habla de biometría ni de entrenamiento con la palabra "training". Declara servicios no dirigidos a menores (<13 sin consentimiento parental).
- **DPA de Decart (actualizado 2026-05-28) [V]:** Decart actúa como **procesador** y el desarrollador como controlador; limita el procesamiento a prestar el servicio; **no dice** si se entrena con los datos; subencargados mayormente en EE.UU. (AWS, Google Cloud, otros); logs de acceso conservados >= 12 meses.
- **Contradicción abierta:** la política pública (propósito de mejora/investigación) vs el DPA (solo prestar el servicio). **Acción:** antes de producción, pedir por escrito a Decart (contact@decart.ai) retención cero del stream de entrada y salida, no uso para entrenamiento, y ubicación/regiones del procesamiento. Hasta tener respuesta, el aviso al cliente no debe prometer "no se guarda en ningún lado".
- La cuenta de Decart debe aceptar el DPA (entra en vigor al acceder al servicio, según el documento).

### 6.3 Consentimiento y aviso al cliente
- Antes de encender la cámara, pantalla del personal con aviso breve y checkbox "El cliente aceptó verbalmente" (no se guarda la identidad del cliente; solo se registra que se confirmó, como booleano en el log de sesión, ver sección 7).
- Texto sugerido (a validar por el usuario / abogado): "Tu imagen se procesa en vivo por un proveedor externo para mostrar la prenda. No se guarda en LoloShop. Puedes pedir que se detenga en cualquier momento."
- Indicador visible permanente "EN VIVO" mientras la cámara está activa.
- **Menores de edad:** no hacer demo con menores sin presencia/consentimiento de tutor [A]; la política de Decart no ofrece servicio a niños.
- Terceras personas en el fondo: encuadrar solo al cliente.

### 6.4 LFPDPPP (México) — supuestos, no asesoría legal
- La ley vigente es la **nueva LFPDPPP, publicada el 20-mar-2025 y vigente desde el 21-mar-2025**; abroga la de 2010. Consentimiento "libre, específico e informado". La autoridad ya no es el INAI (según las fuentes consultadas, pasó a la Secretaría Anticorrupción y Buen Gobierno; otra fuente difiere) [C]. Fuentes: https://www.ey.com/es_mx/technical/tax/boletines-fiscales/nueva-ley-federal-proteccion-datos-personal-posesion-particulares , https://www.littler.com/es/news-analysis/asap/mexico-tiene-nueva-ley-en-materia-de-proteccion-de-datos-personales
- **No encontré** fuentes sobre el tratamiento de imagen/biometría bajo la ley nueva ni el contenido exacto del aviso [N].
- Supuestos del autor [A]: (1) la imagen del rostro en video es dato personal; (2) enviarla a un proveedor en EE.UU. es una remisión/transferencia que exige estar cubierta por el aviso de privacidad; (3) si el procesamiento extrae rasgos biométricos, podría tratarse como sensible y requerir consentimiento expreso. Por prudencia, tratar el consentimiento como **expreso** (verbal documentado en pantalla) y tener un **aviso de privacidad** visible en tienda y en la app. Validar con un abogado antes de lanzar.

---

## 7. Registro de uso (auditoría sin imágenes)

### 7.1 Propuesta de modelo [A]
Tabla `ProbadorSession` (nombre en español por convención del repo en dominio, tablas en inglés: se sugiere `TryOnSession`):

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| userId | FK User | `onDelete: Restrict` como `Movement` |
| locationId | FK Location | puede ser null para owner sin tienda |
| startedAt | DateTime | al emitir token |
| endedAt | DateTime? | al terminar o reconciliar |
| reservedSeconds | Int | `maxSessionDuration` concedido (para tope mensual conservador) |
| billedSeconds | Int? | suma de `generationTick` reportada por el cliente (no confiable; informativo) |
| model | String | p. ej. `lucy-vton-3.6` |
| speed | String | `standard` o `fast` |
| endReason | enum | `user`, `idle`, `max_duration`, `network`, `error`, `orphaned` |
| consentConfirmed | Boolean | confirmación verbal marcada por el personal |
| garmentCount | Int | número de prendas probadas (sin identificar al cliente) |

Índices: `(userId, startedAt desc)`, `(locationId, startedAt desc)`, `(startedAt desc)`.
**Nunca** almacenar imágenes, frames, nombres del cliente, ni prompts con texto libre sensible.

### 7.2 Integridad
- El cliente reporta el cierre; no es confiable. La fila "huérfana" (sin `endedAt` y `startedAt + reservedSeconds` ya pasado) se cierra por barrido al emitir un token nuevo (`endReason = orphaned`).
- Para topes se usa `reservedSeconds` (conservador), no lo reportado.
- Conciliación mensual: comparar con el consumo del panel de Decart [V que existe panel; N detalle].

### 7.3 Implicaciones de migración Prisma
- Cambio en `prisma/schema.prisma`: nuevo `enum` + `model` + relaciones inversas (`User.tryOnSessions`, `Location.tryOnSessions`).
- Hoy el repo **no tiene `prisma/migrations/`** y el script es `db:push`. CLAUDE.md exige `prisma migrate` sin editar SQL a mano. Opciones:
  1. **Baseline + migrate:** `prisma migrate diff`/`migrate resolve` para crear una migración inicial equivalente al estado de producción, luego `prisma migrate dev --name add_tryon_session` (genera el SQL; no se edita a mano) y `prisma migrate deploy` en producción.
  2. `prisma db push` (lo que el repo usa hoy): rápido, sin historial; contradice la convención de CLAUDE.md.
- **Recomendación [A]:** opción 1, en una tarea previa y separada ("baselinar migraciones"), porque aplicarla a la BD de Neon de producción es riesgosa. Requiere decisión del usuario (sección 11). Prisma está en 5.22 (`prisma-client-js`), compatible.
- Alternativa sin migración: omitir la tabla en v1 y depender del panel de Decart + `metadata` del token (userId/locationId). Pierde topes por ubicación y el informe interno. No recomendado, pero es el mínimo viable.

---

## 8. UX para tablet/móvil

### 8.1 Cámara y orientación
- `navigator.mediaDevices.getUserMedia({ video: { facingMode, width, height, frameRate }, audio: false })`. Pedir **ancho/alto/fps de `model.width/height/fps`** del SDK (la documentación lo recomienda para evitar reescalado y latencia; los valores no están publicados) [V]. Usar `ideal` como alternativa si el dispositivo no puede.
- Audio: no pedirlo (la demo no lo necesita, menos datos y menos privacidad en juego). El SDK acepta stream solo de video [N: confirmar].
- **Cámara trasera (`environment`) por defecto** en la tablet (el personal apunta al cliente); alternar a frontal (`user`). Al cambiar de cámara hay que **recapturar el stream y reconectar** (la doc lo indica) [V].
- Espejo: `mirror: "auto"` (voltea cuando el track reporta `facingMode: "user"`) [V]. Para la vista previa local usar CSS `scaleX(-1)` solo con la frontal.
- Orientación: preferir **vertical (9:16)** para ver al cliente de cuerpo entero con pantalón/hoodie. Aviso de rotación si la relación no coincide con la del modelo. Bloquear con `screen.orientation.lock` es poco fiable en iOS [N]; mejor detectar y avisar.
- Mostrar el resultado del modelo (`onRemoteStream`) en un `<video autoplay playsinline muted>` (en iOS `playsinline` es imprescindible para no abrir pantalla completa nativa).

### 8.2 Soporte de navegadores
- Decart **no publica lista de navegadores soportados** [N]. Hechos: WebRTC vía LiveKit; **Safari de escritorio se fija a VP8**; la opción `preferredVideoCodec` admite h264/vp8/vp9 [V]. En iOS el códec y rendimiento en tablets viejas es una incógnita: **probar en dispositivos reales en la Fase 0** (iPad, Android gama media). 
- Requisitos de HTTPS: Vercel lo cumple; `getUserMedia` exige contexto seguro.
- PWA instalada en iOS: permisos de cámara y WebRTC en modo standalone tienen historial de problemas [N]; probar tanto en Safari como instalada.

### 8.3 Selector de prendas y flujo
- Fuente: `fetchProductsAction()` ya existente (requiere sesión). No se necesita una acción nueva para listar; sí una **vista reducida** que incluya solo productos con imagen y categoría compatible.
- Barra inferior/carrusel de miniaturas con búsqueda (reutilizar `filterProducts` y `SearchFilter` de `/productos`).
- Al elegir prenda: cargar imagen -> `realtimeClient.set({ prompt, image, enhance })`. **`set()` reemplaza todo el estado** (los campos omitidos se borran), siempre enviar prompt+imagen completos [V]. Debounce de 300 ms para cambios rápidos [V].
- Tamaño de miniaturas: 1:1, objetivo táctil >= 48 px.

### 8.4 Categorías compatibles (CATEGORIES del repo)
| Categoría | ¿Compatible? | Nota |
|---|---|---|
| Playeras, Hoodies | Sí | Torso a la vista |
| Pantalones | Sí, con encuadre de cuerpo completo | Más difícil con tablet cerca |
| Accesorios | Parcial | Depende del tipo (gorra/lentes sí; bolsos/cinturones [N]); marcar por producto |
| Tenis | Experimental | Requiere pies en cuadro; no hay evidencia en la documentación revisada [N] |
| Perfumes, Raquetas de Padel | No | No son prendas; excluir |
- Hoy `Product.category` es texto libre con default "General". Se propone una constante `TRYON_CATEGORIES` (lista blanca) en código en v1, y evaluar un campo `tryOnEnabled Boolean` por producto en v2 [A].

### 8.5 Calidad de la imagen de prenda
- Decart pide imagen **limpia de solo la prenda**, fondo liso/blanco, >= 512x512, JPEG/PNG/WebP; si el producto sale puesto en una persona, hay que extraer la prenda antes [V].
- `Product.imageUrl` de LoloShop se genera con crop 1:1 y auto-niveles hasta 1080 px (`lib/image/process.ts`), así que el tamaño es suficiente, pero **la calidad depende de cómo se fotografió** (fondo, arrugas). Riesgo de resultados pobres con fotos con fondo desordenado [A].
- Prompt: 20–30 palabras con color, material, patrón y corte; patrones "substitute" (reemplazar) y "add" (añadir); `enhance: false` si se escribe prompt propio [V]. Propuesta v1: generar prompt desde `title`, `brand`, `variant.color` (plantilla), con `enhance: true` por defecto hasta medir. En v2, campo editable `tryOnPrompt` por producto.
- Descarga de imagen en cliente: si se hace `fetch` de la URL de Vercel Blob para convertirla en `Blob`, hay que verificar CORS del Blob [N]; alternativa: pasar la URL como string a `initialState.image`/`set` (el SDK acepta Blob, File o URL) o servirla vía una ruta proxy autenticada.

### 8.6 Pantalla completa, wake lock, ciclo de vida
- Pantalla completa: `element.requestFullscreen()` en Android/Chrome y iPad; en iPhone Safari no hay Fullscreen API para elementos genéricos [N]. Plan: UI inmersiva con `100dvh`, sin NavBar (ocultarla en `/probador` como ya se hace con `/pos` y `/catalogo`).
- **Wake Lock:** `navigator.wakeLock.request("screen")`. Soportado en Chrome 84+, Safari 16.4+ [V]. Hay un bug conocido: en iOS 16.4 no funcionaba en PWAs instaladas (WebKit 254545); una fuente no oficial dice que se arregló en iOS 18.4 [N]. Reintentar al volver `visibilitychange`; si falla, mostrar aviso discreto "mantén la pantalla activa".
- Al pasar a segundo plano (`visibilitychange` hidden / `pagehide`): desconectar el stream y detener tracks (corta la facturación). Esto también lo recomienda Decart para móviles [V].
- Al terminar: `realtimeClient.disconnect()`, `track.stop()` en todos los tracks, quitar listeners, `wakeLock.release()`, borrar captura.

### 8.7 Sin red / red mala
- La función **requiere red**; el SW de la PWA no puede ayudar con tiempo real. La ruta `/probador` y `/api/probador/*` deben ir en la lista de no-caché (NetworkOnly) y la UI debe detectar `navigator.onLine === false` y mostrar "Necesitas conexión".
- Antes de ofrecer la demo: `checkConnectivity()` del SDK [V mencionado en la doc de red]; si falla, ofrecer el respaldo nivel 0.
- Requisitos de red de Decart [V]: **típico 1.3–2.4 Mbps por sentido; mínimo 3.5; provisionar 4 Mbps subida y bajada por sesión**; TCP 443; **UDP 7882 saliente** (medios), UDP 3478 (TURN) y UDP 19302 (STUN). Los bloqueos de UDP o proxies son la causa más común de congelamiento. Wi-Fi de tienda con filtrado puede romper la demo: pedir al usuario que verifique el router.
- Umbrales de calidad [V]: RTT <=150 ms bueno, <=300 regular, <=500 malo; pérdida <=0.1% / <=1% / <=5%; fps entrantes >=20 / >=12 / >=5.
- UI de estados degradados: indicador de calidad (`onConnectionQuality`), mensaje "conexión inestable", y tras N segundos en "Poor/Critical" ofrecer "Cambiar a vista sin IA" o terminar la demo.
- El SDK reintenta con backoff exponencial hasta 5 veces (`reconnecting`) y luego emite `disconnected` + `error` [V]. Mostrar overlay "Reconectando…" y cortar si se agota.

---

## 9. Arquitectura propuesta

### 9.1 Dominios y CSP (para `connect-src`/`media-src`) [V]
`api.decart.ai`, `platform.decart.ai`, `lk.decart.ai`, `*.lkc.decart.ai` (todos HTTPS/WSS 443; el comodín es obligatorio fuera de US-West), `stun.l.google.com` (STUN). El documento menciona `turn.decart.ai` solo en una nota (no TLS-interceptar); confirmar si requiere permitirse [N]. `img-src` debe incluir `blob:` y el host del Blob de productos. Probar la CSP en un *preview* antes de producción.

### 9.2 Diagrama de flujo (texto)

```
[Tablet/móvil del personal]                      [Servidor LoloShop (Vercel)]             [Decart]
 /probador (cliente)                              /api/probador/token  (POST)
   |                                                     |
   | 1. Usuario inicia sesión (next-auth)                |
   | 2. Pantalla de aviso/consentimiento                 |
   | 3. getUserMedia (video, sin audio)                  |
   | 4. Pulsa "Iniciar demo"                             |
   |--- POST (cookie de sesión) ------------------------>|
   |                                                     | a. getServerSession
   |                                                     | b. re-leer User en BD, validar rol/ubicación
   |                                                     | c. verificar tope mensual/concurrencia
   |                                                     | d. tokens.create(TTL 60s, allowedModels,
   |                                                     |    allowedOrigins, maxSessionDuration, metadata)
   |                                                     |---- clave permanente (solo servidor) ---->|
   |<-- { apiKey(ek_), expiresAt, maxSessionSeconds,-----|<---------------- token efímero -----------|
   |      sessionLogId }                                 | e. insertar fila TryOnSession (reserva)
   | 5. client.realtime.connect(stream, {model, ...}) ---(WebRTC/WSS, UDP 7882)------------------->|
   |<------------------------ video transformado (onRemoteStream) --------------------------------|
   | 6. Elegir prenda -> set({prompt, image}) ---------------------------------------------------->|
   | 7. "Capturar": canvas.drawImage(video) -> blob URL (solo memoria)
   | 8. Terminar / inactividad / max-duración -> disconnect(), stop tracks, borrar captura
   |--- POST /api/probador/end {sessionLogId, seconds, reason} ->| actualizar fila (no confiable)
```

### 9.3 Máquina de estados de la UI
`idle` -> `consent` -> `permission` (cámara) -> `ready` -> `connecting` -> `live` <-> `reconnecting` ; `live` -> `captured` (vista de captura sobre el stream, que sigue activo o en pausa) ; `live|captured` -> `ending` -> `ended` ; errores: `denied` (cámara), `forbidden` (rol/tope), `offline`, `poor-network`, `error`.
- `captured`: botón "Seguir probando" (borra captura), "Nueva captura" (reemplaza, borra la anterior), "Terminar demo". Si el usuario deja la captura abierta > 20 s, ofrecer "Pausar demo" que desconecta (deja de facturar) y reconecta al volver. [A]
- Cierre automático: tope de sesión (servidor), inactividad (p. ej. aviso a los 60 s, corte a los 90 s sin interacción) [A], pestaña oculta.

### 9.4 Rutas y componentes
- `app/probador/page.tsx` — página cliente protegida por middleware; **además** comprueba rol en servidor para renderizar (ver 10).
- `app/api/probador/token/route.ts` — POST, emite token (5.2).
- `app/api/probador/end/route.ts` — POST, cierra fila de auditoría (valida que la fila pertenezca al usuario de la sesión).
- `components/probador/ProbadorLive.tsx` — componente **solo cliente**; importa el SDK con `dynamic(..., { ssr: false })`.
- `components/probador/GarmentPicker.tsx`, `CapturePanel.tsx`, `ConsentGate.tsx`, `LiveStatusBar.tsx`.
- `lib/probador/` — lógica pura testeable: `policy.ts` (roles/topes), `prompt.ts` (plantillas de prompt), `capture.ts` (canvas y limpieza), `idle.ts` (temporizador), `usage.ts` (consultas de tope).
- `lib/probador/decart-server.ts` — única pieza que lee la clave permanente y crea el cliente servidor del SDK; con `import "server-only"`.

---

## 10. Cambios por archivo/módulo del repo (basado en lo leído)

| Archivo | Cambio |
|---|---|
| `package.json` | Añadir `@decartai/sdk` (dependencia; compatibilidad con Next 14.2 / React 18.3.1 a validar en Fase 0 [N]). Posiblemente `server-only`. |
| `.env.example` | Añadir **solo nombres** (sin valores): `DECART_API_KEY`, `PROBADOR_ENABLED`, `PROBADOR_MAX_SESSION_SECONDS`, `PROBADOR_MONTHLY_CAP_SECONDS`, `PROBADOR_ALLOWED_ORIGINS`. **Ninguno con prefijo `NEXT_PUBLIC_`.** Configurar los valores solo en Vercel (Production/Preview) y en `.env` local gitignoreado, como el resto de secretos del proyecto. |
| `middleware.ts` | Sin cambios funcionales: `/probador` y `/api/probador/*` ya quedan protegidos por `next-auth/middleware` (no están en la lista de excepciones). Documentar con un comentario que NO deben añadirse a las excepciones. La verificación de rol se hace en la ruta/página, no en el middleware (el middleware solo comprueba que haya sesión). |
| `lib/actions.ts` | Opcional: `requireRole(allowed: Role[])` reutilizable derivado del patrón de `requireSession` + chequeo de `session.user.role` (como `createLocationAction`). Mantener `requireSession` intacto. Las rutas API no son server actions: la lógica compartida va a `lib/probador/policy.ts`. |
| `lib/auth/options.ts`, `types/next-auth.d.ts` | Sin cambios. Se aprovecha `session.user.{id, role, locationId}`. La re-lectura en BD se hace en `lib/probador/policy.ts` vía `lib/prisma.ts`. |
| `prisma/schema.prisma` | Nuevo `enum TryOnEndReason` y `model TryOnSession` (7.1) + relaciones inversas en `User` y `Location`. Ver 7.3 sobre baseline de migraciones. |
| `next.config.mjs` | Añadir `headers()` para `/probador` (CSP y `Permissions-Policy: camera=(self)`). Revisar `next-pwa` para que `/probador` y `/api/probador/*` no se cachean (runtimeCaching NetworkOnly o `buildExcludes`). Hoy no hay `runtimeCaching` personalizado: el comportamiento por defecto de next-pwa cachea ciertas rutas; verificar [N]. |
| `app/layout.tsx` / `components/layout/NavBar.tsx` | La NavBar ya se oculta en `/pos`, `/catalogo` y `/login`; añadir `/probador`. Añadir entrada "Probador" en `navItems` visible solo si el rol está permitido. |
| `app/page.tsx` | Tarjeta/enlace "Probador" en el dashboard para roles permitidos (junto al enlace a `/cuenta` ya existente). |
| `app/productos/page.tsx` | Sin cambios en v1. En v2: marcar productos aptos para try-on y editar `tryOnPrompt`. Reutilizar `SearchFilter`, `filterProducts` y `CATEGORIES` en el selector. |
| `lib/domain/types.ts` | v2: campos opcionales `tryOnPrompt?` / `tryOnEnabled?` en `Product`. No en v1. |
| `lib/data/*`, `InventoryDataSource` | Sin cambios en v1 (el selector usa `fetchProductsAction`). La tabla de auditoría NO se mete en `InventoryDataSource` (no es inventario); usar un módulo propio con `lib/prisma.ts`. [A: decisión de arquitectura; validar con el rol `architect`] |
| `lib/image/*` | Sin cambios; no se reutiliza `uploadImage` (la captura NUNCA pasa por ahí). Añadir un test que garantice que el módulo del probador no importa `lib/image/upload`. |
| `vitest.config.ts` / `components/__tests__` | Nuevos tests (sección 12). |
| `.github/workflows/ci.yml` | Añadir variables ficticias de CI para el build solo si el módulo las lee en tiempo de importación (evitarlo: leer env dentro del handler). |
| `CLAUDE.md` | Tras implementar: documentar Probador, variables, topes y política de privacidad. |

---

## 11. Riesgos, preguntas abiertas y decisiones a validar

### 11.1 Riesgos principales
1. **Retención/uso de datos por Decart sin aclarar** (política pública vs DPA) con video de clientes reales y posible tratamiento como dato personal/biométrico en México. Mitigación: respuesta por escrito de Decart, aviso de privacidad, consentimiento expreso.
2. **Costo variable y fuga por sesión abierta** (US$72/hora activa). Mitigación: `maxSessionDuration` en el token, inactividad, tope mensual, interruptor.
3. **Calidad real del try-on con el catálogo de LoloShop y en dispositivos/red de tienda.** Sin cifras públicas de fps/latencia, ni lista de navegadores soportados. Mitigación: Fase 0 de pruebas de concepto con 5–10 prendas reales y una tablet real.
4. Compatibilidad del SDK con Next 14.2 / bundler / CSP [N].
5. Wake Lock y permisos de cámara en PWA instalada de iOS [N].
6. Dependencia de un proveedor joven con cambios frecuentes de modelo/versiones (VTON 2 y 3 se retiraron en sep 2026 [V]). Mitigación: fijar `lucy-vton-3.6` y vigilar el changelog.
7. Captura de pantalla por parte del cliente/personal es imposible de impedir en web (la privacidad de la captura es "de la aplicación", no del dispositivo).
8. Migraciones Prisma sin historial (sección 7.3).

### 11.2 Preguntas abiertas para el usuario
1. ¿Qué roles pueden usar el probador (propuesta: los tres, con colaborador restringido a su tienda)?
2. ¿Presupuesto mensual objetivo (determina el tope) y volumen esperado de demos y duración típica?
3. ¿Aceptas escribir a Decart pidiendo retención cero / no entrenamiento / regiones, y firmar su DPA antes de producción?
4. ¿Permitimos el respaldo nivel 1 (foto del cliente a una API de imagen de terceros) o nos limitamos al nivel 0 sin IA?
5. ¿Hacemos primero un "baseline" de migraciones Prisma, o aceptamos `db:push` para esta tabla?
6. ¿Qué dispositivos reales se usarán (modelo de tablet/iPad/Android) y cómo es el Wi-Fi de la tienda (UDP saliente permitido)?
7. ¿Hay fotos de producto con fondo limpio o se necesita un paso de limpieza/extracción de prenda?
8. ¿Se tiene aviso de privacidad vigente de la tienda y se puede ampliar para cubrir esta función?
9. ¿Se aceptan menores en la tienda como clientes de la demo (política)?

### 11.3 Decisiones del autor que el usuario debe validar
- **(decisión del autor)** Decart `lucy-vton-3.6` en modo estándar; `fast` desactivado por defecto.
- **(decisión del autor)** Roles: owner, manager y collaborator (este último con `locationId` obligatorio).
- **(decisión del autor)** Re-leer el usuario en BD al emitir el token (en vez de confiar solo en el JWT).
- **(decisión del autor)** Token con TTL 60 s, `allowedModels` fijo, `allowedOrigins` por entorno y `maxSessionDuration` <= 300 s por defecto.
- **(decisión del autor)** Tabla `TryOnSession` de auditoría sin imágenes, con `reservedSeconds` para el tope mensual y `consentConfirmed`.
- **(decisión del autor)** Topes: inactividad (aviso 60 s / corte 90 s), captura abierta >20 s sugiere pausar, pestaña oculta desconecta.
- **(decisión del autor)** Cámara trasera por defecto, orientación vertical preferida, sin audio.
- **(decisión del autor)** Lista blanca de categorías: Playeras, Hoodies, Pantalones; Accesorios parcial; Tenis experimental; Perfumes y Raquetas excluidos.
- **(decisión del autor)** Respaldo nivel 0 sin IA por defecto; nivel 1 solo con aprobación explícita.
- **(decisión del autor)** Plantilla de prompt automática en v1 (título/marca/color), campo editable en v2.
- **(decisión del autor)** Consentimiento verbal marcado en pantalla (booleano en el log), y tratarlo como expreso por prudencia.
- **(decisión del autor)** No usar SDK de fal.ai ni autoalojar en v1; revisar si el uso supera ~160 min activos/mes sostenidos.

---

## 12. Plan de implementación por fases

> Convenciones: TDD (Vitest + RTL, como en `components/__tests__` y `lib/**/__tests__`); el SDK de Decart siempre se **mockea** en tests (no hay llamadas reales ni costo en CI). Commits convencionales; sin secretos en el repo.

### Fase 0 — Validación técnica (sin integrar en la app principal)
- T0.1 Crear cuenta Decart, aceptar DPA, escribir a Decart sobre retención, entrenamiento, regiones, límite de concurrencia y límites de gasto. **Criterio:** respuestas por escrito archivadas fuera del repo.
- T0.2 Prueba de concepto aislada (rama o carpeta desechable) con 5–10 prendas reales: medir fps/latencia percibida, calidad, comportamiento en iPad/Android real, Safari y PWA instalada. **Criterio:** tabla de resultados por dispositivo; decisión go/no-go.
- T0.3 Verificar compatibilidad con Next 14.2/React 18.3.1 y CSP; confirmar `allowedModels` con alias vs id; confirmar CORS de imágenes del Blob. **Criterio:** `npm run build` pasa; sin errores de CSP.
- T0.4 Confirmar facturación real con la primera sesión de prueba (segundos vs `generationTick`). **Criterio:** coincidencia dentro de un margen razonable.

### Fase 1 — Núcleo de servidor (token seguro)
- T1.1 `lib/probador/policy.ts`: función pura `canUseProbador(role, locationId)`. **Test:** matriz roles x ubicación.
- T1.2 `lib/probador/decart-server.ts` con `server-only`; crea token con parámetros (TTL, modelo, orígenes, duración, metadata). **Test:** con SDK mockeado, verifica las opciones enviadas y que la clave nunca aparece en la respuesta.
- T1.3 `app/api/probador/token/route.ts`: 401 sin sesión, 403 con rol no permitido o sin ubicación, 429 con tope excedido, 503 con interruptor apagado, 200 con `{apiKey, expiresAt, maxSessionSeconds, sessionLogId}` y `Cache-Control: no-store`. **Test:** cada rama con `getServerSession` y Prisma mockeados (patrón de `lib/__tests__`).
- T1.4 Re-lectura del usuario en BD. **Test:** usuario borrado o con rol cambiado -> deniega pese a JWT válido.
- **Criterio de fase:** la ruta nunca devuelve nada sin sesión+rol; búsqueda en el bundle de cliente no encuentra la clave (comprobación con `grep` del build en CI/local).

### Fase 2 — Auditoría y topes
- T2.1 Esquema Prisma `TryOnSession` (+ resolver baseline/migración según decisión). **Criterio:** `prisma validate` y migración aplicada en una BD de prueba, nunca editando SQL a mano.
- T2.2 `lib/probador/usage.ts`: suma de `reservedSeconds` del mes, barrido de huérfanas, concurrencia. **Test:** fechas límite del mes, huérfanas, doble sesión.
- T2.3 `app/api/probador/end/route.ts`. **Test:** solo el dueño de la fila puede cerrarla.
- **Criterio:** tope mensual bloquea el token con 429 y mensaje claro.

### Fase 3 — Cliente: cámara, conexión, prenda
- T3.1 `ConsentGate` + estados de UI (máquina de estados pura). **Test:** transiciones válidas/ inválidas.
- T3.2 Hook `useProbadorSession` con SDK mockeado: conectar, `apiKeyProvider`, `set()`, `disconnect()`, manejo de `connectionChange`/`error`. **Test:** limpia tracks y listeners al desmontar.
- T3.3 `GarmentPicker` con `fetchProductsAction`, filtro por categorías compatibles y búsqueda. **Test:** excluye Perfumes/Raquetas; llama `set` con prompt+imagen completos y con debounce.
- T3.4 Temporizador de inactividad y `visibilitychange`. **Test:** con timers falsos, aviso a 60 s, corte a 90 s, desconecta al ocultar.
- **Criterio:** demo extremo a extremo en un dispositivo real con prendas reales.

### Fase 4 — Captura efímera y privacidad
- T4.1 `lib/probador/capture.ts`: captura a canvas, crea/revoca object URL. **Test:** `URL.revokeObjectURL` se llama al reemplazar, cerrar, terminar y desmontar; el canvas queda a 0x0.
- T4.2 Test de "no persistencia": espías sobre `localStorage`, `indexedDB`, `fetch`/`XMLHttpRequest` verifican que no se llamó a nada con la imagen; el módulo no importa `lib/image/upload` ni `@vercel/blob`.
- T4.3 UI sin botones de descargar/compartir; bloqueo de menú contextual y arrastre. **Test RTL:** no existen controles de descarga.
- **Criterio:** revisión manual de pestaña Network (DevTools) mostrando que ninguna petición de LoloShop transporta la imagen.

### Fase 5 — Robustez, red y PWA
- T5.1 Detección offline/`checkConnectivity()`/calidad de conexión con mensajes y respaldo nivel 0. **Test:** estados `offline`, `poor-network`.
- T5.2 Wake Lock con reintento y degradación. **Test:** mock de `navigator.wakeLock`.
- T5.3 `next.config.mjs`: CSP y Permissions-Policy para `/probador`; exclusión de caché del SW. **Criterio:** en un *preview* de Vercel, `/probador` funciona instalado como PWA y sin errores CSP en consola; no hay entradas de `/api/probador` en Cache Storage.
- T5.4 Pantalla completa/orientación y ajuste de NavBar. 

### Fase 6 — Lanzamiento controlado
- T6.1 Aviso de privacidad y texto de consentimiento revisados por el usuario/abogado.
- T6.2 Piloto con una tienda y topes bajos (p. ej. 60 min activos/mes), `PROBADOR_ENABLED` solo en Production tras pruebas en Preview.
- T6.3 Conciliar el log con el panel de Decart al cierre del primer mes; ajustar topes.
- T6.4 Actualizar `CLAUDE.md` (módulo, variables, política de privacidad).

### Verificación general
`npm run typecheck`, `npm test`, `npm run lint`, `npm run build`; pruebas manuales de la lista de Fase 3–5 en dispositivo real. Comprobar en CI que no se introduzcan valores de secretos y que la clave de Decart no aparezca en `.next/static`.

---

## 13. Incertidumbres explícitas (resumen honesto)
- Las páginas de Decart se leyeron mediante un resumidor automático; los números clave (precio, TTL, puertos, ancho de banda) coinciden entre varias páginas (precios, changelog, tokens), pero conviene re-verificarlos directamente antes de aprobar presupuesto.
- No hay cifras oficiales de fps/resolución/latencia del VTON en tiempo real, ni límite de sesión, ni de concurrencia por defecto, ni lista de navegadores soportados.
- El valor monetario del "crédito" y los créditos gratis iniciales no están publicados en las páginas revisadas.
- Vidu S2-Editing: solo se pudo confirmar el paper/repo; no hay precios ni límites accesibles.
- Los precios de GPU y de APIs de foto provienen de agregadores/comparativas con interés comercial; son orientativos.
- Lo legal (LFPDPPP) es suposición del autor, no asesoría; falta contraste con el texto del DOF y con un abogado.
