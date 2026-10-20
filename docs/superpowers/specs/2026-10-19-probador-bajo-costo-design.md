# Probador virtual LoloShop: opciones de bajo costo, presupuesto y límites

Fecha: 2026-10-19 · Estado: borrador de investigación para validación del dueño · Autor: agente investigador/arquitecto

> Este documento NO contiene código de producto ni valores de secretos. El repo es público: solo aparecen NOMBRES de variables de entorno.
> Fuentes: **[Doc]** documentación oficial leída el 2026-10-19 (vía WebFetch, que pasa por un resumidor automático: revalidar cifras críticas antes de pagar); **[Prov]** afirmación comercial del proveedor; **[3ro]** terceros (blogs, agregadores, reposts); **[NV]** no verificado. **(cálculo)** = aritmética propia sobre cifras citadas.
> Complementa y en parte reemplaza a:
> - `2026-10-19-probador-cliente-foto-design.md` (en adelante **Doc-Cliente**, que recomendaba FASHN a US$0.075/imagen).
> - `2026-10-19-probador-personal-vivo-design.md` (en adelante **Doc-Personal**, que recomendaba Decart a US$0.02/s, US$6 por demo de 5 min).

---

## 1. Resumen ejecutivo

El costo de los documentos anteriores lo marcaban dos cosas: el **video en vivo cobrado por segundo** (Decart, US$72 por hora activa) y un proveedor de try-on especializado como única opción (FASHN, US$0.075). La versión de menor gasto cambia tres cosas:

1. **El modo personal deja de ser video con IA por segundo.** Pasa a ser **híbrido**: la vista de cámara en vivo es local y sin IA (gratis), y la IA solo corre cuando el personal pulsa "Capturar". Así se paga por captura y no por minuto. Una demo con 4 capturas cuesta entre ~US$0.005 y US$0.30 según el proveedor, frente a US$6 con Decart (cálculo).
2. **Aparece un proveedor casi gratuito.** Cloudflare Workers AI ofrece `@cf/black-forest-labs/flux-2-klein-4b`, un modelo de edición multi-imagen con hasta 4 imágenes de referencia [Doc]. Cuesta ~US$0.0013 por imagen (cálculo), y la cuota gratuita de 10.000 neuronas al día alcanza para unas 85 imágenes diarias sin costo [Doc + cálculo]. Con el plan gratuito, al pasar la cuota la llamada falla en vez de cobrar [Doc], así que funciona como tope duro natural. Los pesos son Apache-2.0 [Doc]. Cloudflare declara que no entrena con las entradas y salidas del cliente [Doc]. **Su calidad para try-on no está verificada.** Además, el modelo exige entradas menores de 512x512, lo que probablemente borra detalles finos como el logo bordado de The North Face.
3. **Las prendas se preparan una vez por producto**, no en cada prueba. Las fotos reales son capturas de historias de Instagram con mano, gancho, etiquetas, fondo desordenado y a veces vista de espalda (ver §2). Sin limpieza previa, cualquier proveedor dará resultados peores. La versión limpia se guarda en Blob en un campo nuevo `Product.tryOnImageUrl` **(decisión del autor)**.

**Recomendación por nivel** (todas las opciones de IA quedan pendientes del piloto de calidad de la Fase 0):

| Nivel | Tope mensual | Modo cliente (foto desde catálogo) | Modo personal (tienda) | Preparación de prenda |
|---|---|---|---|---|
| **A** | ≈ US$0 | Cloudflare FLUX.2 [klein] 4B dentro de la cuota gratuita. Solo con enlace/QR firmado. Si se agota, se muestra la prenda "puesta en modelo" pregenerada | Híbrido: cámara local + captura → mismo modelo Cloudflare. Respaldo sin IA (captura al lado de la foto del producto) | En el navegador del personal: recorte con BiRefNet-lite (MIT) + guía de foto. Limpieza generativa (quitar mano y gancho) con el mismo modelo gratuito y aprobación humana |
| **B** | ≤ US$10 | Igual que A | Igual que A, más un botón **"Calidad alta"** con FASHN v1.6 prepagado: 100 créditos = US$7.50 [Doc], tope duro por saldo | Igual que A. Opcional: FASHN Background Remove (1 crédito) en prendas difíciles |
| **C** | ≤ US$50 | Cloudflare (plan Workers Paid US$5 si hace falta más cuota) + FASHN para "Calidad alta" también en cliente, con cuota por enlace | FASHN en todas las capturas. **Opcional**: Decart en vivo limitado a 30 s por demo como "premium" (US$0.60 por demo) con tope de segundos al mes | Igual que B |

Costos unitarios clave: Cloudflare klein-4B **~US$0.0013** · Gemini 3.1 Flash Image a 0.5K **US$0.045** · FASHN **US$0.075** (los fallos no consumen créditos [Doc]) · Decart en vivo **US$0.02/s**.

Nada de esto cambia las decisiones ya tomadas. Las claves siguen solo en el servidor. LoloShop no persiste ninguna foto de persona: las capturas viven solo en memoria. **Sí cambia** que en el modo personal la captura ahora **sale a un tercero** para procesarse, igual que la foto del modo cliente. Hace falta consentimiento, y el texto debe decirlo (§6).

**Advertencia de infraestructura (fuera del presupuesto del probador):** Vercel define el plan Hobby como "non-commercial personal use only" y exige Pro para cualquier uso comercial [Doc: vercel.com/docs/limits/fair-use-guidelines]. LoloShop es una tienda. Si el proyecto está en Hobby, ese costo (Pro ≈ US$20/mes por miembro [NV en esta consulta]) ya existe hoy, con o sin probador. No lo sumo a los niveles, pero el dueño debe saberlo.

---

## 2. Análisis de las fotos reales y pipeline de preparación de prendas

### 2.1 Qué muestran las 6 fotos

Son **capturas de pantalla de historias de Instagram** de 1080x2400 px. La foto útil ocupa solo la franja central (~1080x1440 px). Arriba está la UI de Instagram (barra de progreso, avatar, "Barreto · hace 5 minutos") y abajo la barra "Responder" con emojis. Dos llevan texto superpuesto ("Talla: S y M", "Talla: M caballero").

| Archivo | Prenda | Vista | Problemas |
|---|---|---|---|
| `1a1afea4` | Chaleco TNF Nuptse oliva/negro | **Espalda** | Sobre banco redondo gris, piso de mosaico, zapato y jeans de una persona abajo, etiqueta asomando al costado |
| `77358117` | Mismo chaleco | Frente | **Mano** sosteniendo un **gancho blanco con marca** ("El Palacio de Hierro"), fondo de tienda saturado (ropa, persona, planta, bolsa), **etiqueta** colgando del bajo |
| `ca14407c` | Chamarra TNF Nuptse azul/negro | Frente | Sobre banco, mangas dobladas hacia adentro, **gancho de madera** visible en el cuello, mangas cortadas por el borde del encuadre, etiqueta |
| `2fecbed0` | Misma chamarra | Frente, en ángulo | Mano y gancho, ligera perspectiva, mangas fuera de cuadro, persona y planta al fondo, etiqueta |
| `8444a834` | Misma chamarra | **Espalda** | Sobre banco, piso, bota Timberland y caja Jordan al fondo, cordones de ajuste colgando |
| `ffd806ec` | Misma chamarra | Frente | En gancho sobre el banco, **manga derecha cortada** por el encuadre, estante con gorras y mochila al fondo, etiqueta |

### 2.2 Implicaciones

- **No sirven tal cual para ningún try-on.** FASHN y Decart piden prenda sola, fondo liso y vista frontal [Doc, ya citado en los documentos previos]. Los modelos de edición genéricos (FLUX.2, Gemini, Qwen) tienden a "copiar" también la mano o el gancho si aparecen en la referencia [NV, criterio del autor].
- **El pipeline actual estropea las capturas de pantalla.** `ProductPhotoCapture` aplica `computeSquareCrop` (1:1 centrado) a la imagen completa. En una captura de 1080x2400 eso deja la franja y = 660..1740, que **corta el cuello o el bajo de la prenda** (la prenda ocupa aprox. y = 560..1900) y deja dentro la UI de Instagram. `autoLevels` casi no hace nada, porque las barras negras y el texto blanco ya fijan el mínimo en 0 y el máximo en 255. **Conclusión: usar las fotos originales del carrete del teléfono, no capturas de las historias.**
- **Vista de espalda:** 2 de 6 fotos. Un try-on con la espalda pone la espalda de la prenda en el frente de la persona, con el logo en el lugar equivocado. Hay que marcar la vista y usar solo la frontal.
- **Mangas fuera de cuadro o dobladas:** el modelo tendrá que inventar las mangas. Es un riesgo alto de error en chamarras.
- **Tipo de prenda:** las chamarras inflables (puffer) son voluminosas y brillantes. Para muchos modelos de try-on es un caso difícil, porque cambian la silueta de la persona [NV]. El chaleco, sin mangas, es el caso más fácil.
- **Logo pequeño bordado:** cualquier proveedor que reduzca la prenda a menos de 512 px (Cloudflare klein-4B exige entradas < 512x512 [Doc]) probablemente lo deformará. Para una marca como TNF eso se nota.

### 2.3 Pipeline propuesto (una vez por producto, al dar de alta o desde `/productos`)

```
Foto original (cámara o carrete, NO captura de Instagram)
  1. Corrección EXIF (como hoy, createImageBitmap from-image)
  2. Recorte guiado manual por el personal: rectángulo libre, ya no 1:1 forzado (incluir mangas completas)
  3. Vista: el personal marca "frente" / "espalda" (solo "frente" es elegible para el try-on)
  4. Quitar fondo: segmentación en el navegador (BiRefNet-lite, MIT) → PNG con alfa → componer sobre blanco
  5. ¿Quedan mano, gancho o etiqueta? (casi siempre sí en estas fotos)
       a) No: listo
       b) Sí: limpieza generativa en el servidor, una sola vez
          ("garment only, remove hand/hanger/tags, front view, white background, ghost mannequin")
          con el proveedor del nivel activo (Cloudflare klein: ~US$0.0013; Gemini 3.1 Flash Image 0.5K: US$0.045)
  6. Revisión humana obligatoria: comparación lado a lado original/limpia → "Aprobar" o "Descartar"
     (el modelo puede inventar detalles; nunca publicar sin aprobación)
  7. Subir a Blob con el lib/image/upload.ts existente → Product.tryOnImageUrl
     (Product.imageUrl NO se toca: la foto del catálogo sigue siendo la original)
```

**Por qué un campo nuevo `tryOnImageUrl` (decisión del autor):** `imageUrl` es la foto "bonita" del catálogo y puede seguir siendo ambientada. La versión limpia es un insumo técnico. Mezclarlas obligaría a elegir entre catálogo atractivo y try-on correcto. Va junto al `tryOnCategory` que ya proponía Doc-Cliente. Elegibilidad para "Probar": `tryOnImageUrl != null && tryOnCategory != none`. Opcional: `tryOnPreparedAt DateTime?` para saber cuándo regenerar. Ojo: el repo no tiene `prisma/migrations/` (hallazgo de Doc-Personal §7.3). Primero hay que resolver el baseline de migraciones.

**Costo de preparación (una sola vez):** con 300 prendas, unos US$0.40 con Cloudflare (o US$0 dentro de la cuota) y unos US$13.50 con Gemini 0.5K (cálculo). Blob: ~150 KB × 300 ≈ 45 MB, dentro del 1 GB incluido en Hobby [Doc: vercel.com/docs/vercel-blob/usage-and-pricing].

### 2.4 Opciones para el paso "quitar fondo"

| Opción | Dónde | Costo | Licencia | Comentario |
|---|---|---|---|---|
| **BiRefNet / BiRefNet_lite (ONNX, transformers.js)** | Navegador (WASM; WebGPU si existe) | US$0 | **MIT** [Doc: huggingface.co/ZhengPeng7/BiRefNet, huggingface.co/onnx-community/BiRefNet_lite-ONNX] | Recomendado. Lite ≈ 44M parámetros [3ro: promptlayer]: descarga de decenas de MB, aceptable para el personal (se cachea), no para clientes. Velocidad en móvil [NV] |
| MODNet | Navegador | US$0 | Apache-2.0 (según el README del Space) [3ro] | Solo retratos: no sirve para prendas colgadas |
| MediaPipe Image Segmenter (SelfieMulticlass, clase `clothes`) | Navegador | US$0 | Librería Apache-2.0 [Doc]; licencia del modelo multiclase [NV] | Entrenado en selfies (ropa puesta): mala elección para prendas sueltas. Útil para el modo AR (§3.2-b) |
| RMBG-2.0 (BRIA) | Navegador o servidor | US$0 | **CC BY-NC 4.0, no comercial**; uso comercial requiere acuerdo con BRIA [Doc: huggingface.co/briaai/RMBG-2.0] | Descartado. RMBG-1.4 también es no comercial según conocimiento previo [NV en esta consulta] |
| @imgly/background-removal | Navegador | US$0 | **AGPL-3.0** [Doc: github.com/imgly/background-removal-js] | Descartado: obligaría a licenciar la app bajo AGPL; el repo es público pero no tiene licencia declarada |
| fashn-human-parser | Servidor | — | **NVIDIA Source Code License: solo no comercial** [Doc: github.com/NVlabs/SegFormer/blob/master/LICENSE §3.3] | Descartado (y además bloquea el autoalojado de FASHN VTON 1.5, ver §3.1) |
| Photoroom Remove Background API | API | **US$0.02/imagen** (plan Basic; ejemplo de US$20 = 1.000 imágenes); 10 llamadas de producción gratis al registrarse; sandbox con marca de agua [Doc: photoroom.com/api/pricing] | Comercial | Buena alternativa de pago si BiRefNet falla. El "Image Editing API" (US$0.10) no es necesario |
| remove.bg API | API | ~US$0.20 pago por uso; 50 llamadas de vista previa al mes [3ro: costbench, saascrmreview] | Comercial | Cara frente a Photoroom |
| FASHN Background Remove | API | 1 crédito = US$0.075 [Doc] | Comercial | Solo si ya se compraron créditos FASHN (nivel B/C) |
| RPi5 del homelab (BiRefNet en CPU con onnxruntime) | Servidor propio | US$0 | MIT | Posible por lotes (segundos o decenas de segundos por imagen en CPU [NV]); innecesario si el navegador basta |

Ninguna de estas opciones quita una **mano** o un **gancho** que tocan la prenda: un segmentador de "objeto saliente" suele incluirlos en la máscara [NV, criterio del autor]. Por eso hace falta el paso 5b (edición generativa) o, mejor, fotografiar bien desde el inicio.

### 2.5 Guía de foto para el personal (cuesta cero y vale más que cualquier modelo)

1. **Fondo liso y claro**: pared blanca, sábana o cartulina. Nada de piso de mosaico ni de estantes detrás.
2. **Prenda sola, de frente, completa**: cuelga la prenda de un gancho fijo (en la pared o un perchero), **no la sostengas con la mano**. Tiene que verse completa, mangas incluidas, con un margen alrededor.
3. **Mangas extendidas hacia abajo y a los lados**, no dobladas. Cierre subido.
4. **Esconde las etiquetas** de precio y cartón (mételas por dentro) y los cordones de ajuste.
5. **Gancho neutro** (blanco o transparente) sin marca. Si se ve, que sea solo el gancho de arriba.
6. **Teléfono vertical a la altura del pecho de la prenda, de frente** (sin ángulo). Luz de día o luz blanca uniforme, sin flash directo sobre telas brillantes.
7. **Una foto de frente obligatoria**; la espalda es opcional y se marca como "espalda".
8. **Sube la foto original desde la cámara o el carrete, nunca una captura de la historia de Instagram.**
9. Opcional, para el catálogo: la foto ambientada de siempre puede ir en `imageUrl`. La del probador va aparte.

---

## 3. Matriz de opciones por modo

Notas generales:
- "Uso" = una imagen generada (modo cliente) o **una demo de 4 capturas** (modo personal híbrido).
- Columnas mensuales: 100 / 500 / 1.000 usos. Supuesto de prenda + persona ≈ 1 MP cada una y salida ≈ 1 MP, salvo que se indique otra cosa.
- **Calidad esperada: NADA está probado con prendas de LoloShop.** La columna refleja lo que dice el proveedor, la especialización del modelo y el criterio del autor.
- Privacidad: en todas las opciones de API la foto de la persona sale de LoloShop hacia el proveedor.

### 3.1 Modo cliente por foto (y base del híbrido)

| Opción | Costo unitario | 100 / 500 / 1.000 al mes | Calidad esperada | Esfuerzo | Privacidad / datos | Licencia / uso comercial | Fuentes |
|---|---|---|---|---|---|---|---|
| **Cloudflare Workers AI, FLUX.2 [klein] 4B** | ~US$0.0013 (2 entradas de 1 tesela 512² × 5.37 neuronas + salida 768x1024 = 4 teselas × 26.05 neuronas ≈ 115 neuronas × US$0.011/1.000) (cálculo) | **US$0** dentro de 10.000 neuronas/día ≈ 85 imágenes/día. Por encima: ~US$0.13 / 0.64 / 1.27 + plan Workers Paid US$5 [Doc] | **Incierta-baja**: modelo generalista de 4B, sin especialización en try-on, entradas < 512x512 [Doc] (logo y texturas se pierden), puede alterar la cara. Rápido ("sub-second" [Prov]) | Bajo: REST multipart desde la Route Handler (`input_image_0..3`) [Doc] | No entrena con contenido del cliente [Doc: developers.cloudflare.com/workers-ai/platform/privacy]; retención de entradas no indicada [NV] | Pesos Apache-2.0 [Doc: HF FLUX.2-klein-4B] | developers.cloudflare.com/workers-ai/platform/pricing ; developers.cloudflare.com/changelog/2026-01-15-flux-2-klein-4b-workers-ai |
| Cloudflare Workers AI, FLUX.2 [klein] 9B | ~US$0.019 (1.363,64 + 2 × 181,82 neuronas) (cálculo) | 100: ~US$0 (≈170/mes gratis); 500: ~US$6.3 + 5; 1.000: ~US$15.8 + 5 (cálculo) | Algo mejor que 4B [NV]; mejor resolución de entrada (por MP) | Bajo | Igual que arriba | Pesos 9B con licencia **no comercial**; según BFL, "commercial use requires API" [3ro: help.bfl.ai]. Si el uso vía Cloudflare cuenta como API con licencia [NV]: preguntar | ídem |
| fal FLUX.2 [klein] 4B edit | US$0.01 por MP (~US$0.01 a 1 MP) [Doc/Prov: página fal] | US$1 / 5 / 10 | Igual que el 4B de Cloudflare pero con entradas de mayor resolución | Bajo | fal: por defecto CDN con URLs públicas e historial de payloads; acepta data URIs en algunos modelos [Doc: fal.ai/docs/.../fal-cdn] | Apache-2.0 | fal.ai/models/fal-ai/flux-2/klein/4b/edit |
| fal Qwen-Image-Edit-2511 | US$0.03 por MP [Doc fal] | ~US$3 / 15 / 30 | Media [NV]; buena edición multi-imagen "persona + producto" [Doc: model card 2509] | Bajo | fal (ver arriba) | Apache-2.0 [Doc: HF Qwen-Image-Edit-2509] | fal.ai/models/fal-ai/qwen-image-edit-2511 |
| fal FLUX.2 edit | US$0.012 por MP de entrada y salida → ~US$0.036 con 2+1 MP (cálculo) | ~US$3.6 / 18 / 36 | Media-alta [NV] | Bajo | fal | Etiquetado "commercial use" por fal [Prov] | fal.ai/models/fal-ai/flux-2/edit |
| **Gemini 3.1 Flash Image ("Nano Banana 2")** | **US$0.045 a 0.5K**, US$0.067 a 1K; lote (batch) a mitad de precio pero asíncrono, no apto para tiempo real [Doc] | 0.5K: US$4.5 / 22.5 / 45 | Media-alta en edición multi-imagen [Prov/NV]; riesgo de alterar identidad | Bajo | Plan de pago: "no se usa para mejorar productos" [Doc]. **El free tier sí lo usa y no existe free tier para salida de imagen** [Doc] | Comercial (términos de Google) | ai.google.dev/gemini-api/docs/pricing |
| ~~Gemini 2.5 Flash Image~~ | US$0.039 | — | — | — | — | **Apagado el 2026-10-02** [Doc] | ídem. Descartado |
| FLUX Virtual Try-On Pro (fal) | ~US$0.05 (cálculo de Doc-Cliente) | US$5 / 25 / 50 | Especializado en try-on [Prov] | Bajo | fal | Comercial | Doc-Cliente §3 |
| Kling Kolors v1.5 (fal) | US$0.07 [Doc fal]; paquete de prueba de Kling 100 unidades/US$4.90 [3ro: pricingsaas, NV] | US$7 / 35 / 70 | Especializado [Prov]. Posible discontinuación en ene-2027 [3ro, NV] | Bajo | fal | Comercial | fal.ai/models/fal-ai/kling/v1-5/kolors-virtual-try-on |
| **FASHN v1.6 (API directa)** | **US$0.075** (1 crédito); **los fallos no consumen créditos** [Doc]; compra mínima US$7.50 = 100 créditos [Doc] | US$7.5 / 37.5 / 75 | **La más alta esperada** (especializado; acepta prenda flat-lay o en modelo) [Prov]; 5–17 s | Bajo (ya diseñado en Doc-Cliente) | Base64 de entrada y salida, retención mínima, sin entrenamiento sin opt-in, DPA [Doc, Doc-Cliente §1] | Comercial | help.fashn.ai/plans-and-pricing/api-pricing |
| Decart Lucy Image 2 | US$0.01 (480p) / US$0.02 (720p) [Doc] | US$1–2 / 5–10 / 10–20 | **Desconocida**: no pude confirmar que acepte imagen de prenda como referencia (página del modelo 404) [NV] | — | Política de Decart ambigua (Doc-Personal §6.2) | Comercial | docs.platform.decart.ai/getting-started/pricing.md |
| Autoalojado FASHN VTON v1.5 (Modal) | ~US$0.0055 caliente (≈5 s en H100 [Doc: HF fashn-vton-1.5] × US$0.001097/s [Doc: modal.com/pricing]) + arranque en frío | ~US$0.6 / 3 / 6 + arranques en frío; el Starter de Modal incluye US$30/mes [Doc] | Especializada (tops/bottoms/one-pieces), salida **576x864** [Doc] | **Alto**: servicio Python con GPU, warm-up, colas, seguridad | Control total (Modal como procesador) | Código y pesos Apache-2.0 [Doc], **pero depende de `fashn-human-parser` con licencia NVIDIA solo no comercial** [Doc]. **Bloqueado** salvo que se sustituya el parser | github.com/fashn-AI/fashn-vton-1.5 ; huggingface.co/fashn-ai/fashn-human-parser |
| Autoalojado FLUX.2 [klein] 4B (Modal L4 o RunPod) | ~US$0.001 caliente (3–6 s en L4 [NV, extrapolación] × US$0.000222/s [Doc]); cada arranque en frío ~30–90 s de GPU ≈ US$0.007–0.02 [NV] | Cubierto por los US$30 de Modal hasta varios miles al mes [cálculo] | Igual que el 4B de Cloudflare, pero sin el límite de 512 px | Alto | Control total | Apache-2.0 | modal.com/pricing ; runpod.io/pricing (L4 US$0.69/h serverless [Doc]) |
| Autoalojado Qwen-Image-Edit (H100) | ~US$0.016 con pasos completos (~15 s [3ro: Oxen.ai]); ~US$0.002–0.003 con LoRA Lightning de 4 pasos (≈10x [Doc: HF lightx2v]) + arranque en frío de ~60 GB de pesos (minutos [NV]) | Arranques en frío caros | Media [NV] | Muy alto | Control total | Apache-2.0 | ver arriba |
| CatVTON / IDM-VTON / Oxygen-TryOn | — | — | — | — | — | **No comercial** (CC BY-NC-SA, acceso "académico") [3ro/Doc-Cliente] | Descartados |

**Lectura:** Cloudflare klein-4B es imbatible en precio y su plan gratuito trae un tope duro natural, pero su calidad es la más dudosa. FASHN es la opción "buena" más cara, pero prepagada, sin cobro por fallos y la mejor documentada en privacidad. Gemini 3.1 Flash Image queda en medio (US$0.045), aunque su facturación es pospago, así que el tope lo tiene que imponer la app. El autoalojado no compensa: la licencia bloquea FASHN VTON, y FLUX klein ya existe como API casi gratuita.

### 3.2 Modo personal (demostración en tienda)

| Opción | Costo por demo | 100 / 500 / 1.000 demos al mes | Calidad esperada | Esfuerzo | Privacidad | Notas |
|---|---|---|---|---|---|---|
| **(a) Híbrido + Cloudflare klein-4B** (4 capturas) | ~US$0.005 (cálculo) | **US$0** hasta ≈ 2.600 capturas/mes (≈650 demos) repartidas en el mes; 1.000 demos ≈ US$5 (Workers Paid) + ~US$1.8 (cálculo) | Incierta-baja (igual que §3.1) | Bajo-medio: `getUserMedia` local (vista previa) + `canvas` → misma Route Handler del modo cliente | Solo salen 4 fotogramas por demo, no un video continuo | Ancho de banda: ~4 subidas de ~300 KB, frente a 4 Mbps sostenidos con Decart (Doc-Personal §8.7) |
| (a) Híbrido + Gemini 3.1 Flash Image 0.5K | US$0.18 | US$18 / 90 / 180 | Media-alta [NV] | Igual | Google, plan de pago | Pospago: tope impuesto por la app |
| **(a) Híbrido + FASHN** | US$0.30 | US$30 / 150 / 300 | Alta esperada | Igual | FASHN base64 | Prepago: tope por saldo |
| (b) AR en el dispositivo (MediaPipe Pose + prenda recortada deformada en 2D) | US$0 | US$0 | **Baja**: efecto "calcomanía", sin oclusión de brazos, sin volumen; una chamarra inflable se verá pegada encima. Sirve para color y talla aproximada, no para "cómo me queda" | **Alto**: 2–4 semanas de un desarrollador con experiencia en Canvas/WebGL [NV, criterio del autor]; calibración por prenda | **La mejor**: nada sale del dispositivo | No se recomienda para el lanzamiento. Opcional como juguete en el nivel A |
| (c) Modelo de video autoalojado (JoyAI-Video-Edit) en horario de tienda | Fijo | ~US$192/mes (RTX 5090 ~US$0.64/h × 10 h × 30 días, Doc-Personal §4.4) [3ro] | 480p a 24 fps; try-on no probado | Muy alto (WebRTC/TURN, GPU, MiMo-VL) | Control total | **Fuera de todos los niveles**. Descartado |
| (d) Decart en vivo con tope estricto | 30 s: US$0.60; 60 s: US$1.20 [Doc: US$0.02/s] | 30 s: US$60 / 300 / 600; 60 s: US$120 / 600 / 1.200 | La única opción realmente "en vivo" | Medio (ya diseñado en Doc-Personal) | Video continuo a Decart, política ambigua | Solo cabe en el nivel C y con pocas demos (~25 de 30 s con US$15) |
| Respaldo sin IA (captura junto a la foto del producto) | US$0 | US$0 | No es un try-on | Bajo | Nada sale | Ya existe en Doc-Personal como "Nivel 0" |

**Lectura:** el híbrido (a) baja el costo por demo entre 20 y 1.000 veces frente a Decart de 5 min, según el proveedor. Además reutiliza **la misma ruta de servidor** del modo cliente, así que es un solo backend para los dos modos.

### 3.3 Infraestructura por opción

| Componente | Costo | Comentario |
|---|---|---|
| Vercel Functions (Route Handler que llama al proveedor) | Esperar I/O no cuenta como CPU activa con Fluid compute (Doc-Cliente §4) | Hobby incluye 4 h de CPU activa y 1M de invocaciones [Doc]. **Pero Hobby no permite uso comercial** [Doc] |
| Vercel Blob (`tryOnImageUrl`) | ~45 MB para 300 prendas: dentro de 1 GB/mes (Hobby); Pro a US$0.023/GB [Doc] | Solo prendas preparadas. **Nunca** fotos de personas |
| Neon (contador `TryOnUsage`) | Una fila por clave y día: despreciable [NV en límites del free tier] | Igual que Doc-Cliente §6.4 |
| Cloudflare (cuenta nueva, solo para Workers AI vía REST) | US$0 (Workers Free) o US$5/mes (Workers Paid) [Doc] | No hace falta mover la app a Cloudflare: se llama por REST con un token de API |
| FASHN | Prepago desde US$7.50 [Doc] | Tope duro por saldo |
| Google Gemini API | Pospago; alertas de presupuesto en GCP. **No verifiqué si existe un tope duro de gasto** [NV] | Tope en la app obligatorio |
| Decart | Por segundo; créditos iniciales gratis no cuantificados [Doc] | `maxSessionDuration` en el token (Doc-Personal §5) |
| RPi5 del homelab | US$0 adicional | **Sin GPU**: no puede generar try-on. Solo serviría para preparar prendas por lotes en CPU o como futura sede de Postgres/MinIO (memoria del proyecto). No forma parte de ningún nivel |
| Modal / RunPod (autoalojado) | US$30/mes de crédito gratis en Modal [Doc] | Descartado por esfuerzo y licencias (§3.1) |

---

## 4. Propuesta de presupuesto y límites por nivel

### 4.1 Por qué estos tres niveles (y los ajustes)

- **A ≈ US$0**: se mantiene. Lo hace posible la cuota diaria gratuita de Cloudflare (≈85 imágenes/día con klein-4B). Ajuste: "≈ US$0" significa **US$0 en IA**, sin contar el plan de Vercel (§1).
- **B ≤ US$10**: se mantiene. El tope encaja con la compra mínima de FASHN (US$7.50 por 100 créditos). Cubre ~100 imágenes de alta calidad al mes **más** el volumen gratuito de Cloudflare.
- **C ≤ US$50**: se mantiene, con una aclaración honesta. **Ninguna demo en vivo de 5 minutos cabe en este nivel** (una sola cuesta US$6; 10 demos ya son US$60). El video en vivo solo entra como "premium" de 30 s y en pocas unidades. Si el dueño quiere de verdad el en vivo de 5 min, el presupuesto realista empieza en ~US$150/mes (25 demos) y debería ser un **Nivel D**, fuera de esta propuesta.

### 4.2 Qué se activa en cada nivel

| Elemento | Nivel A (≈US$0) | Nivel B (≤US$10) | Nivel C (≤US$50) |
|---|---|---|---|
| Preparación de prenda | BiRefNet-lite en el navegador + limpieza con Cloudflare klein-4B + aprobación humana | Igual + FASHN Background Remove opcional | Igual que B |
| Proveedor "estándar" | Cloudflare klein-4B (Workers **Free**) | Cloudflare klein-4B (Free) | Cloudflare klein-4B (Workers **Paid**, US$5, solo si se supera la cuota diaria) |
| Proveedor "calidad alta" | — | FASHN v1.6, 100 créditos/mes (US$7.50) | FASHN v1.6, ~400–500 créditos/mes (US$30–37.50) |
| Modo cliente | Solo con enlace/QR firmado; proveedor estándar | Estándar; "calidad alta" **no** disponible para clientes (se reserva al personal) | Estándar + 1 prueba de "calidad alta" por enlace |
| Modo personal | Híbrido + estándar; respaldo sin IA | Híbrido + estándar; botón "Calidad alta" (FASHN) | Híbrido con FASHN por defecto; **Decart 30 s opcional**, apagado de inicio |
| Respaldo al agotar cuota | Prenda "puesta en modelo" pregenerada (ver 4.4) o comparación sin IA | Igual | Igual |
| Gasto máximo de IA | US$0 (el plan Free falla al agotar la cuota [Doc]) | US$7.50 (saldo FASHN) | ~US$50 (5 + ~30 FASHN + ~15 Decart) |

### 4.3 Cuotas, topes e interruptores (valores iniciales, todos configurables)

| Control | A | B | C | Dónde se aplica |
|---|---|---|---|---|
| Interruptor global del probador | sí | sí | sí | Servidor; oculta el botón en la UI |
| Interruptor del modo vivo (Decart) | apagado | apagado | apagado hasta aprobar el piloto | Servidor |
| Tope de gasto diario (USD) | 0 | 0.50 | 2.00 | Servidor, con reserva antes de llamar (como Doc-Cliente §6.4) |
| Tope de gasto mensual (USD) | 0 | 10 | 50 | Servidor + prepago del proveedor |
| Imágenes estándar/día (global) | 80 (margen bajo la cuota de 10.000 neuronas) | 80 | 300 | Servidor (contador) |
| Imágenes "calidad alta"/mes | 0 | 100 | 450 | Servidor + saldo FASHN |
| Pruebas por enlace de cliente | 3 en 24 h | 3 en 24 h | 5 en 24 h (1 de calidad alta) | Token firmado |
| Capturas por demo (personal) | 5 | 5 (de ellas, 2 de calidad alta) | 5 | Servidor, por sesión de demo |
| Demos por usuario del personal/día | 20 | 20 | 30 | Servidor |
| Decart: segundos por demo / segundos al mes | — | — | 30 s / 750 s (≈25 demos, US$15) | Token efímero `maxSessionDuration` (Doc-Personal §5) + contador |
| Resolución de salida | 768x1024 | 768x1024 | 1K (FASHN) | Parámetro del proveedor |
| Reintentos automáticos | 0 (el usuario decide) | 0 | 1 solo en FASHN (los fallos no cobran [Doc]) | Servidor |

### 4.4 Mecanismos de diseño que limitan el costo

1. **Solo bajo petición:** nunca se genera al abrir la página. Cada generación requiere un botón y un consentimiento.
2. **Caché, solo de lo que no es persona:** la prenda preparada (`tryOnImageUrl`) se genera una vez. Opcionalmente se pregenera **una imagen "puesta en modelo"** por prenda con un modelo sin persona real: FASHN Product-to-Model, 1 crédito [Doc], o el editor generativo con un maniquí o modelo sintético. Se guarda en Blob y sirve de respaldo gratuito cuando se agota la cuota. **Nunca** se cachean resultados con la foto de un cliente.
3. **Acceso por enlace o QR firmado** (decisión del autor; reemplaza el "abierto en `/catalogo`" de Doc-Cliente): el personal genera desde la PWA o el webhook de WhatsApp un enlace con token HMAC (expira en 24 h y lleva un contador de usos). El QR impreso en tienda rota cada día. Sin token no aparece el botón "Probar" para el cliente. Esto resuelve gran parte del abuso sin captcha. BotID sigue como capa adicional.
4. **Prepago como tope duro** (FASHN, Cloudflare Free) y **tope en la app** para los proveedores pospago (Gemini, Decart).
5. **Reserva antes de llamar** y reversión si el proveedor rechaza la entrada (Doc-Cliente §6.4).
6. **Resolución menor** por defecto. "Calidad alta" solo bajo botón explícito.
7. **Degradación automática:** calidad alta agotada → estándar → pregenerada o sin IA, con un mensaje claro ("Hoy ya no hay pruebas con IA; mira la prenda puesta en modelo").
8. **Registro sin imágenes** (usuario o enlace, modo, proveedor, costo estimado, resultado) para conciliar con los paneles de los proveedores.

### 4.5 Variables de entorno (SOLO nombres; ninguna con `NEXT_PUBLIC_`)

- Generales: `TRYON_ENABLED`, `TRYON_TIER` (`A`|`B`|`C`), `TRYON_PROVIDER_STANDARD`, `TRYON_PROVIDER_HQ`, `TRYON_MONTHLY_BUDGET_USD`, `TRYON_DAILY_BUDGET_USD`, `TRYON_STANDARD_DAILY_CAP`, `TRYON_HQ_MONTHLY_CAP`, `TRYON_OUTPUT_MAX_SIDE`, `TRYON_RATE_SALT`
- Enlaces de cliente: `TRYON_LINK_SECRET`, `TRYON_LINK_TTL_HOURS`, `TRYON_LINK_MAX_USES`
- Modo personal: `PROBADOR_DEMO_MAX_CAPTURES`, `PROBADOR_STAFF_DAILY_DEMOS`
- Modo vivo (solo C): `PROBADOR_LIVE_ENABLED`, `DECART_API_KEY`, `PROBADOR_MAX_SESSION_SECONDS`, `PROBADOR_MONTHLY_CAP_SECONDS`, `PROBADOR_ALLOWED_ORIGINS`
- Proveedores: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_API_TOKEN` (token con permiso solo de Workers AI), `FASHN_API_KEY`, `GEMINI_API_KEY` (solo si se elige Gemini)
- Preparación de prenda: `GARMENT_PREP_PROVIDER` (`cloudflare`|`gemini`|`fashn`|`none`)

Se registran en `.env.example` (sin valores) y en Vercel (Production/Preview), como `BOT_API_KEY`.

---

## 5. Cambios respecto a los dos documentos previos

| Tema | Antes | Ahora |
|---|---|---|
| Proveedor principal del modo cliente (Doc-Cliente §1) | FASHN US$0.075 | Cloudflare klein-4B (≈US$0) como estándar; FASHN pasa a "calidad alta" en B/C. **Pendiente del piloto**: si klein-4B no alcanza la calidad mínima, FASHN vuelve a ser el principal y el nivel A queda sin IA para clientes |
| Respaldo del modo cliente | Google `virtual-try-on-001` | Se aparta. Alternativa media: Gemini 3.1 Flash Image (US$0.045). Gemini 2.5 Flash Image ya está apagado [Doc] |
| Cobro de fallos FASHN | "No documentado" | **Los fallos no consumen créditos** [Doc] |
| Acceso del modo cliente | Abierto en `/catalogo` con BotID y límite por IP | **Enlace/QR firmado** con usos limitados; BotID y límite por IP se mantienen como capas extra |
| Modo personal (Doc-Personal §1) | Decart en vivo, US$6 por demo de 5 min | **Híbrido** (cámara local + IA por captura). Decart queda como premium opcional de 30 s solo en C |
| Foto del cliente en el modo personal | Video a Decart; "Nivel 1 foto a tercero" desaconsejado | El envío de 4–5 fotogramas a un tercero pasa a ser el camino principal. **Requiere consentimiento expreso** (§6). La regla "LoloShop no guarda nada, solo en memoria" sigue igual |
| Insumo de prenda | `Product.imageUrl` tal cual (con dudas) | Pipeline de preparación + campo **`tryOnImageUrl`** + guía de foto |
| Tabla de auditoría | `TryOnSession` (segundos de Decart) + `TryOnUsage` (contador del cliente) | Un solo `TryOnUsage` para ambos modos con proveedor y costo estimado; `TryOnSession` solo si se activa Decart |
| Topes | Diario (cliente) y mensual en segundos (personal) | Presupuesto por nivel (diario + mensual en USD) compartido por ambos modos, más cuotas por enlace, demo y usuario |
| Nuevo proveedor | — | Cloudflare (cuenta y token nuevos; la app sigue en Vercel) |

Lo que **no** cambia: interfaz de proveedor intercambiable (`TryOnProvider`), Route Handler síncrona con `maxDuration`, validación por magic bytes, redimensionado en el cliente, `Cache-Control: no-store`, nada en Blob ni en Postgres con fotos de personas, consentimiento sin premarcar, aviso de privacidad y revisión legal, roles del modo personal y re-lectura del usuario en BD.

---

## 6. Privacidad (lo que cambia con estas opciones)

- **Modo personal híbrido:** la captura se mantiene en memoria del dispositivo como decidió el dueño, pero para generar el resultado el fotograma **viaja al proveedor**. La pantalla de consentimiento (checkbox del personal, "el cliente aceptó") debe nombrar al proveedor y decir que la imagen se envía al extranjero solo para generar la prueba. El resultado vuelve solo a memoria y se borra al cerrar.
- **Cloudflare:** no entrena con el contenido [Doc]. Retención de entradas de Workers AI y región de procesamiento [NV]: preguntar y archivar la respuesta. Es un procesador nuevo que hay que añadir al aviso de privacidad.
- **Gemini:** solo plan de pago. El free tier usa el contenido para mejorar productos [Doc] y queda **prohibido** con fotos de personas.
- **fal:** guarda por defecto archivos en CDN con URLs públicas (Doc-Cliente §3). Por eso sus modelos baratos quedan como alternativa y no como principal **(decisión del autor)**.
- **AR en el dispositivo:** la única opción en la que nada sale del dispositivo.
- La preparación de prendas no involucra personas: sin consentimiento adicional (el personal no debe aparecer en la foto; si aparece una mano, la limpieza la elimina).
- Sigue vigente lo dicho sobre la LFPDPPP en Doc-Cliente §5 y Doc-Personal §6.4. No es asesoría legal.

---

## 7. Plan por fases (de la opción más barata a la más cara)

**Fase 0: piloto de calidad con las fotos reales (sin código en el repo, ≤ US$10, requiere aprobación del dueño para gastar)**
- 0.1 Preparar las prendas del piloto: chaleco oliva (frente `77358117`) y chamarra azul (frentes `ca14407c`, `2fecbed0`, `ffd806ec`). Las espaldas (`1a1afea4`, `8444a834`) entran solo como caso negativo. Recortar la franja útil de la captura, quitar el fondo con BiRefNet-lite (demo local) y probar la limpieza generativa con Cloudflare klein-4B y con Gemini 3.1 Flash Image 0.5K. Si existen las fotos originales del carrete, repetir con ellas. **Criterio:** el dueño aprueba ≥ 1 versión limpia por prenda sin logo deformado.
- 0.2 Volver a fotografiar las 2 prendas siguiendo la guía §2.5 (costo cero). **Criterio:** comparar calidad contra 0.1; se espera una mejora clara [NV].
- 0.3 Try-on con 3–4 voluntarios con consentimiento (personal de la tienda): cada prenda × cada persona × {Cloudflare klein-4B, Cloudflare klein-9B, Gemini 3.1 0.5K, FASHN (compra mínima US$7.50)}. Costo estimado: < US$1 en Cloudflare y Gemini + US$7.50 FASHN (cálculo). Puntuación de 1–5 en: identidad de la persona conservada, color correcto, logo legible, silueta y mangas plausibles, artefactos (mano/gancho). **Criterio go/no-go por proveedor:** ≥ 70 % de resultados con puntuación ≥ 4 (umbral de Doc-Cliente, a validar).
- 0.4 Medir la latencia percibida desde un teléfono con la red de la tienda.
- **Resultado de la fase:** decidir qué proveedor es el "estándar" (si klein-4B no pasa, el nivel A queda sin IA generativa para clientes) y cuál es el de "calidad alta".

**Fase 1: preparación de prendas (nivel A, US$0)**
- Baseline de migraciones Prisma (tarea previa, Doc-Personal §7.3). Campos `tryOnImageUrl`, `tryOnCategory`, `tryOnView`/`tryOnPreparedAt`.
- Recorte libre (no 1:1) para el insumo del probador, marca frente/espalda, BiRefNet en el navegador, limpieza generativa opcional con aprobación, subida con `uploadImage`. Tests puros del recorte y del flujo de estados (TDD, proveedor mockeado).
- Guía de foto dentro de la UI de alta (texto corto + ejemplo bueno/malo).

**Fase 2: núcleo de servidor + modo personal híbrido (nivel A)**
- `lib/tryon/` con la interfaz de Doc-Cliente §6.2 e implementación `CloudflareKleinProvider` + `MockProvider`. Contador `TryOnUsage` con presupuesto por nivel.
- `/probador`: vista de cámara local (sin IA), "Capturar" → Route Handler → resultado en memoria. Respaldo sin IA. Sesión + rol + re-lectura en BD (Doc-Personal §5).

**Fase 3: modo cliente por enlace/QR (nivel A)**
- Emisión de enlaces firmados desde la PWA y el webhook de WhatsApp; consentimiento; botón "Probar" solo con token válido; respaldo "puesta en modelo".

**Fase 4: nivel B**
- `FashnProvider` (ya diseñado en Doc-Cliente) como "calidad alta"; compra de 100 créditos; botón en el modo personal; degradación automática.

**Fase 5: nivel C (opcional)**
- Workers Paid si la cuota diaria se queda corta; más créditos FASHN; calidad alta limitada en cliente. Decart 30 s solo si el dueño lo pide tras ver el híbrido. Piloto de 10 demos y conciliación de la factura.

**Fase 6 (opcional, sin fecha): AR 2D en el dispositivo** como experiencia gratuita y privada. Solo si el híbrido no convence por privacidad.

---

## 8. Riesgos

1. **Calidad del proveedor barato sin probar.** Klein-4B no es un modelo de try-on y en Cloudflare recibe entradas < 512 px: puede deformar logos, cambiar caras o inventar mangas. Mitigación: Fase 0 con fotos reales y umbral go/no-go; FASHN como calidad alta.
2. **Fotos de producto inadecuadas.** Capturas de Instagram, mano, gancho, espalda, mangas fuera de cuadro. Mitigación: guía de foto, pipeline de preparación con aprobación humana, elegibilidad solo con `tryOnImageUrl`.
3. **Alucinaciones en la limpieza generativa.** El modelo puede "mejorar" la prenda (otro tono, logo inventado): sería publicidad engañosa. Mitigación: aprobación humana obligatoria y comparación lado a lado.
4. **Dependencia de free tiers y precios cambiantes.** Gemini 2.5 Flash Image se apagó este mes y FASHN subió de precio en 2025 (Doc-Cliente). La cuota de Cloudflare puede cambiar. Mitigación: interfaz de proveedor, topes en USD en la app, revisión trimestral.
5. **Privacidad del modo personal.** Los fotogramas ahora salen a un tercero. Mitigación: consentimiento expreso, aviso, proveedores sin entrenamiento, revisión legal.
6. **Licencias.** Riesgo de colar un componente no comercial (RMBG, fashn-human-parser, FLUX klein 9B autoalojado, CatVTON) o AGPL (@imgly). Mitigación: lista blanca de licencias en este documento; revisar cada dependencia nueva.
7. **Uso comercial en Vercel Hobby** [Doc]: riesgo de suspensión independiente del probador.
8. **Cuota compartida entre modos.** Con A, un pico de clientes podría dejar sin cuota al personal. Mitigación: reservar parte de la cuota diaria al modo personal (p. ej. 30 de 80).
9. **Expectativa del dueño.** El híbrido no es "video en vivo". Mitigación: demo del piloto antes de construir, y Decart 30 s como premium si hace falta "efecto wow".

---

## 9. Preguntas para el dueño

1. ¿Cuántas pruebas esperas al mes en cada modo (aprox. 100, 500 o 1.000)? ¿Qué nivel (A, B o C) quieres como punto de partida?
2. ¿Aceptas que el modo personal sea **híbrido** (vista en vivo sin IA y la IA solo en capturas) en vez de video en vivo con IA?
3. ¿Autorizas gastar hasta ~US$10 en el piloto (Fase 0), con la compra mínima de FASHN incluida?
4. ¿Aceptas crear una cuenta de **Cloudflare** solo para Workers AI (sin mover la app)?
5. ¿Tienes las **fotos originales** (carrete) de las historias, o solo las capturas de Instagram? ¿Puede el personal seguir la guía de foto con un fondo liso?
6. ¿Cuántas prendas hay en el catálogo y qué tipos (chamarras, chalecos, playeras, pantalones, accesorios)?
7. ¿El proyecto de Vercel está en **Hobby o Pro**? (Hobby no permite uso comercial.)
8. ¿Aceptas que el modo cliente funcione **solo por enlace/QR** (enviado por WhatsApp o impreso en tienda) en vez de abierto a cualquiera en `/catalogo`?
9. ¿Quién del personal aprueba las imágenes limpias de las prendas antes de publicarlas?
10. ¿Te interesa la imagen pregenerada "prenda puesta en un modelo" como respaldo gratuito, aunque el modelo no sea el cliente?

---

## 10. Decisiones del autor (el dueño debe validarlas)

- **Decisión del autor:** modo personal híbrido (cámara local + IA por captura) en lugar de video con IA por segundo; Decart solo como premium de 30 s en el nivel C.
- **Decisión del autor:** Cloudflare Workers AI FLUX.2 [klein] 4B como proveedor estándar candidato de los niveles A–C, condicionado al piloto.
- **Decisión del autor:** FASHN v1.6 directo como proveedor de "calidad alta" (prepago, sin cobro por fallos, base64).
- **Decisión del autor:** Gemini 3.1 Flash Image como alternativa media (solo plan de pago), no como principal, por ser pospago sin tope duro verificado.
- **Decisión del autor:** fal.ai solo como alternativa, por la retención en su CDN.
- **Decisión del autor:** no autoalojar modelos en GPU (licencia NC del parser de FASHN VTON; klein ya existe como API casi gratuita; esfuerzo alto).
- **Decisión del autor:** campo nuevo `Product.tryOnImageUrl` (más `tryOnCategory` y vista frente/espalda) sin tocar `imageUrl`.
- **Decisión del autor:** quitar el fondo en el navegador del personal con BiRefNet-lite (MIT). Excluir RMBG (NC) e @imgly (AGPL).
- **Decisión del autor:** limpieza generativa (mano/gancho/etiqueta) con aprobación humana obligatoria.
- **Decisión del autor:** modo cliente solo con enlace/QR firmado (HMAC, 24 h, 3–5 usos).
- **Decisión del autor:** caché solo de prendas y de imágenes "puestas en modelo" sintéticas; nunca de resultados con personas.
- **Decisión del autor:** niveles A ≈ US$0, B ≤ US$10, C ≤ US$50 con los topes de §4.3. Un video en vivo de 5 min requeriría un Nivel D (≥ ~US$150/mes) fuera de esta propuesta.
- **Decisión del autor:** reservar parte de la cuota diaria gratuita al modo personal.

---

## Fuentes consultadas (2026-10-19)

- [Doc] Cloudflare Workers AI precios y cuota gratuita: <https://developers.cloudflare.com/workers-ai/platform/pricing/>
- [Doc] Cloudflare FLUX.2 [klein] 4B en Workers AI (entradas, 4 referencias, < 512x512, 4 pasos): <https://developers.cloudflare.com/changelog/2026-01-15-flux-2-klein-4b-workers-ai>
- [Doc] Cloudflare Workers AI privacidad/uso de datos: <https://developers.cloudflare.com/workers-ai/platform/privacy/>
- [Doc] FLUX.2 [klein] 4B, licencia Apache-2.0, ~13 GB de VRAM: <https://huggingface.co/black-forest-labs/FLUX.2-klein-4B>
- [3ro] Licencia de klein 9B (no comercial) y uso por API: <https://help.bfl.ai/articles/8642316687-flux-2-klein-fast-generation-guide>, <https://venturebeat.com/technology/black-forest-labs-launches-open-source-flux-2-klein-to-generate-ai-images-in>
- [Doc/Prov] fal FLUX.2 [klein] 4B edit: <https://fal.ai/models/fal-ai/flux-2/klein/4b/edit> ; FLUX.2 edit: <https://fal.ai/models/fal-ai/flux-2/edit> ; Qwen-Image-Edit-2511: <https://fal.ai/models/fal-ai/qwen-image-edit-2511> ; fal CDN y data URIs: <https://docs.fal.ai/documentation/model-apis/fal-cdn>
- [Doc] Qwen-Image-Edit-2509 (Apache-2.0, multi-imagen): <https://huggingface.co/Qwen/Qwen-Image-Edit-2509> ; Lightning: <https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning> ; [3ro] tiempos: <https://ghost.oxen.ai/how-we-cut-inference-costs-from-46k-to-7-5k-fine-tuning-qwen-image-edit/>
- [Doc] Gemini API precios (3.1 Flash Image, 3 Pro Image, apagado de 2.5 Flash Image, uso de datos del free tier): <https://ai.google.dev/gemini-api/docs/pricing>
- [Doc] FASHN precios por crédito, fallos sin costo, Background Remove: <https://help.fashn.ai/plans-and-pricing/api-pricing>
- [Doc] FASHN VTON v1.5 abierto: <https://github.com/fashn-AI/fashn-vton-1.5>, <https://huggingface.co/fashn-ai/fashn-vton-1.5> ; parser: <https://huggingface.co/fashn-ai/fashn-human-parser> ; licencia NVIDIA SegFormer: <https://github.com/NVlabs/SegFormer/blob/master/LICENSE>
- [Doc] Decart precios (VTON realtime, Lucy Image 2): <https://docs.platform.decart.ai/getting-started/pricing.md>
- [Doc/3ro] Kling Kolors vía fal: <https://fal.ai/models/fal-ai/kling/v1-5/kolors-virtual-try-on/llms.txt> ; [3ro] <https://pricingsaas.com/companies/klingai>, <https://www.cometapi.com/models/kling/kling-virtual-try-on/>
- [Doc] Modal precios por segundo y crédito Starter: <https://modal.com/pricing> ; RunPod serverless: <https://www.runpod.io/pricing>
- [Doc] BiRefNet (MIT): <https://huggingface.co/ZhengPeng7/BiRefNet>, <https://huggingface.co/onnx-community/BiRefNet_lite-ONNX> ; [3ro] <https://www.promptlayer.com/models/birefnetlite>
- [Doc] RMBG-2.0 (CC BY-NC 4.0): <https://huggingface.co/briaai/RMBG-2.0>
- [Doc] @imgly/background-removal (AGPL-3.0): <https://github.com/imgly/background-removal-js>
- [Doc] MediaPipe Image Segmenter: <https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter>
- [Doc] Photoroom API precios: <https://www.photoroom.com/api/pricing> ; [3ro] remove.bg: <https://costbench.com/software/ai-media-apis/remove-bg-api/>, <https://saascrmreview.com/remove-bg-review/>
- [Doc] Vercel Blob precios: <https://vercel.com/docs/vercel-blob/usage-and-pricing> ; Vercel uso justo y restricción comercial de Hobby: <https://vercel.com/docs/limits/fair-use-guidelines> ; AI Gateway precios: <https://vercel.com/docs/ai-gateway/pricing>
- [3ro] Muapi, AIDC, Runware (try-on): <https://muapi.ai/virtual-try-on-api>, <https://docs.aidc-ai.com/aidge-resource/api-reference/e-commerce-virtual-model/virtual-tryon>, <https://runware.ai/docs/models/bfl-flux-virtual-try-on/schema.json>

**Lo que no pude verificar:** calidad de cualquier proveedor con prendas de LoloShop; precio de ModelsLab (no hallé fuente); si Decart Lucy Image 2 acepta una prenda de referencia; si el uso de klein 9B vía Cloudflare tiene licencia comercial; retención de entradas y región de Workers AI; existencia de un tope duro de gasto en la Gemini API; tiempos de inferencia en L4 y de arranque en frío en Modal; licencia del modelo SelfieMulticlass de MediaPipe; tamaño exacto de descarga y velocidad de BiRefNet-lite en móviles; precio actual de Vercel Pro; límites del free tier de Neon; si los US$5 mensuales de crédito gratuito de AI Gateway (cifra no confirmada en la página) cubren modelos de imagen.
