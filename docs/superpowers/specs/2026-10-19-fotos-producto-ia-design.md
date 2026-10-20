# LoloShop: edición de fotografías de producto con APIs de generación de imagen

Fecha: 2026-10-19 · Estado: borrador de investigación para que el dueño lo valide · Autor: agente investigador/arquitecto

> Este documento no contiene código de producto ni valores de secretos. El repo es público, así que solo aparecen **nombres** de variables de entorno.
> Etiquetas de fuente: **[Doc]** documentación oficial consultada el 2026-10-19 (vía WebFetch, que pasa por un resumidor automático: revalidar cifras críticas antes de pagar); **[Prov]** afirmación comercial del proveedor; **[3ro]** terceros (blogs, agregadores); **[NV]** no verificado. **(cálculo)** = aritmética propia sobre cifras citadas.
> Documentos relacionados (no se repite su contenido):
> - `2026-10-19-probador-bajo-costo-design.md` (**Doc-BajoCosto**): análisis de las 6 fotos, guía de foto para el personal, opciones de quitar fondo (BiRefNet MIT, Photoroom US$0.02, licencias descartadas) y Cloudflare FLUX.2 [klein] 4B. Propone `Product.tryOnImageUrl`.
> - `2026-10-19-probador-cliente-foto-design.md` (**Doc-Cliente**): FASHN v1.6 a US$0.075/imagen.
> - `2026-10-19-probador-personal-vivo-design.md` (**Doc-Personal**): Decart en vivo a US$0.02/s.
> - `2026-10-19-loloshop-dominio-y4ga-design.md`: publicación en `loloshop.y4ga.app`.

---

## 1. Resumen y recomendación

**La hipótesis del dueño es correcta, con una condición.** Los modelos actuales de edición de imagen (Gemini "Nano Banana", gpt-image, FLUX, Seedream) hacen en una sola llamada lo que un quitar-fondo no puede: borran la mano, el gancho y las etiquetas, reconstruyen el cuello oculto, enderezan la perspectiva, corrigen la luz y producen un "ghost mannequin" o un flat-lay. La condición es que **redibujan la imagen**: pueden deformar el logo "THE NORTH FACE", cambiar el tono del azul o del oliva, o inventar cremalleras, costuras y bolsillos. Por eso el diseño se apoya en tres reglas: (1) **la foto original se conserva siempre**, (2) **nada generado se publica sin aprobación del owner**, (3) **hay un control automático de logo y color** antes de mostrar el candidato.

| Rol | Opción | Costo por imagen | Por qué |
|---|---|---|---|
| **Principal** | **Nano Banana 2.1** (`gemini-nano-banana-2.1`), por Vercel AI Gateway (`google/gemini-nano-banana-2.1`) | **US$0.0504 a 2K**, US$0.0336 a 1K (salida) + ~US$0.002 de entrada por foto de referencia (cálculo) [Doc] | Google lo recomienda para proyectos nuevos y declara mejor texto y consistencia [Doc]. Hasta 14 referencias [Doc]. Es **más barato** que Nano Banana 2 (US$0.067 a 1K) y que la versión Lite a 1K [Doc]. En el tier de pago, Google no usa los datos para mejorar productos [Doc]. Ya está en AI Gateway, sin recargo [Doc] y con presupuestos (budgets) [Doc] |
| **Respaldo (misma integración)** | **FLUX.3 Image** (`bfl/flux-3-image`, US$0.05 en AI Gateway) o **FLUX.2 [pro] edit** (US$0.03 + US$0.015/MP adicional en fal) | ~US$0.045–0.06 (cálculo) | Otro proveedor, otro modelo, mismo SDK: si Gemini falla en logo o color, se cambia el slug. FLUX.3 salió el 2026-10-01 [3ro] y está poco probado; FLUX.2 [pro] admite hasta 9 referencias [Doc fal] |
| **Respaldo especializado** | **Photoroom Ghost Mannequin** (Image Editing API, plan Plus) | **US$0.10** [Doc] | Endpoint específico de ropa (`ghostMannequin.mode=ai.auto`) [Doc]. Su sandbox da 1.000 llamadas al mes con marca de agua: el piloto sale **gratis** [Doc]. Salida a 1K; 2K/4K solo Enterprise [Doc] |
| **Barata** | Nano Banana 2.1 por **Gemini Batch API** (directo, sin Gateway) | US$0.0252 a 2K [Doc] | 50 % menos. Encaja con "profesional, no inmediato": la entrega puede tardar horas [NV: SLA exacto] |
| **Gratuita** | Sin IA generativa: guía de foto + BiRefNet en el navegador + fondo blanco (ver Doc-BajoCosto §2.4–2.5) | US$0 | Conserva los píxeles reales, así que no hay riesgo de alucinación. No quita una mano ni un gancho que toquen la prenda |

**Costo por producto (cálculo):** el paquete base (catálogo frontal a 2K + imagen lista para try-on a 1K), con 1.5 intentos en promedio, sale en **≈ US$0.13**. El paquete completo (además espalda y on-model) sale en **≈ US$0.30**. Es un **costo único por producto**, no por uso: el resultado aprobado se cachea en Blob.

**Topes propuestos** (detalle en §8): piloto con techo de **US$25 una sola vez**; operación con **US$10/mes** (≈ 70 productos con el paquete base); techo absoluto de **US$25/mes** con on-model activado. Todo se controla con crédito prepagado de AI Gateway **sin auto-recarga** más un budget de Vercel y un contador propio en la base de datos.

**¿Sirve como motor de try-on?** Para el **modo del owner** (captura → imagen, no video), sí, como **candidato más barato** que FASHN: US$0.034–0.05 contra US$0.075. Su calidad con personas reales y chamarras infladas está **sin verificar**, y estos modelos tienden a alterar la cara o el cuerpo de la persona (§5). **No sustituyen a Decart en tiempo real**: ninguno genera video en vivo. Recomendación: medirlo en el mismo piloto y decidir con datos.

---

## 2. Análisis de las fotos reales y qué hay que corregir

La tabla de las 6 fotos, el problema del recorte 1:1 sobre capturas de Instagram y la guía de foto ya están en **Doc-BajoCosto §2.1–2.5**. Aquí solo se añade lo que importa para la **edición generativa**.

### 2.1 Pares por prenda (aprovechar la multi-referencia)

| Prenda | Fotos de frente | Fotos de espalda | Mejor referencia para logo |
|---|---|---|---|
| Chaleco Nuptse oliva/negro | `77358117` (mano + gancho blanco "El Palacio de Hierro", fondo de tienda) | `1a1afea4` (sobre banco, zapato y jeans visibles) | `77358117`: logo bordado nítido en el pecho, del lado derecho de la imagen |
| Chamarra Nuptse azul/negro | `ffd806ec` (la más frontal, logo nítido, manga derecha cortada); `ca14407c` (sobre banco, mangas dobladas, gancho de madera); `2fecbed0` (mano, en ángulo, logo en perspectiva) | `8444a834` (sobre banco, bota y caja Jordan al fondo) | `ffd806ec` |

**Decisión del autor:** enviar al modelo **varias fotos de la misma prenda** (frente principal + otro frente + espalda) e indicarle cuál es la principal. Así el modelo puede reconstruir la manga cortada de `ffd806ec` a partir de `ca14407c`, en lugar de inventarla.

### 2.2 Detalles que el modelo NO puede alterar (lista de control del piloto)

1. **Logo frontal** "THE NORTH FACE" con el semicírculo de tres franjas: bordado blanco sobre el canesú negro, pecho izquierdo del usuario (lado derecho de la imagen), en tres líneas apiladas.
2. **Logo trasero**: mismo logo, más grande, en el omóplato derecho del usuario (lado derecho de la imagen en las fotos de espalda).
3. **Estampado "700"** (relleno de plumón): bajo frontal izquierdo del chaleco (`77358117`) y zona frontal de la chamarra (`ca14407c`). Es un detalle pequeño, y los modelos lo borran o lo convierten en otro número [NV, criterio del autor].
4. **Cremallera** central negra con tirador, **cuello alto** con capucha guardada (en la chamarra se ve un cordón con tope).
5. **Bolsillos de mano** con cremallera vertical, **cordones de ajuste** con topes en el bajo.
6. **Distribución bicolor**: canesú negro y cuerpo de color, con la línea de corte a la altura del pecho. El número de cámaras (tubos de plumón) y la textura ripstop.
7. **Color**: azul saturado y oliva. Son difíciles: los modelos los "embellecen" hacia un azul más eléctrico o un verde más neutro [NV]. **El piloto debe medirlo** (§10.3).

### 2.3 Qué se corrige en cada salida

| Problema en la foto | Catálogo (salida 1) | Lista para try-on (salida 2) | On-model (salida 3) |
|---|---|---|---|
| UI de Instagram (barras, avatar, "Responder", texto "Talla:…") | Recortar **antes** de la IA, sin IA: franja central y≈480–1920 px del original 1080x2400 | Igual | Igual |
| Mano que sostiene el gancho | Eliminar | Eliminar | No aplica (la prenda va puesta) |
| Gancho (blanco con marca de tercero, o de madera) | Eliminar, sobre todo el de "El Palacio de Hierro": es marca ajena | Eliminar | No aplica |
| Etiquetas de cartón colgando | Eliminar en la imagen principal (la original las conserva) | Eliminar | Eliminar |
| Fondo (mosaico, estantes, plantas, persona, caja Jordan, bota) | Blanco puro #FFFFFF o gris estudio muy claro | Blanco puro | Estudio neutro |
| Banco redondo bajo la prenda | Eliminar | Eliminar | No aplica |
| Mangas dobladas o cortadas por el encuadre | Reconstruir con la otra foto de referencia; si no hay, **marcar el candidato como "reconstruido"** para que el owner lo revise con más cuidado | Reconstruir | El modelo las genera puestas |
| Perspectiva (`2fecbed0`) | Frontal ortogonal | Frontal ortogonal | No aplica |
| Luz (tubos fluorescentes, sombra dura) | Iluminación de estudio suave y uniforme, sin cambiar el color | Igual | Igual |

**Hallazgo del repo que hay que cambiar:** `ProductPhotoCapture` aplica `computeSquareCrop` (recorte 1:1 centrado) y `autoLevels` **antes** de subir, con un máximo de 1080 px. Para la IA hay que enviar la foto **sin recortar, sin auto-niveles** (alteran el color de referencia) y a 2048 px en el lado mayor. **Decisión del autor:** separar "original para IA" de "vista previa".

---

## 3. Matriz comparativa de modelos y servicios

Precios de salida por imagen, salvo que se indique otra cosa. "GW" = disponible en Vercel AI Gateway según su lista de modelos de imagen [Doc: vercel.com/ai-gateway/models?type=image].

### 3.1 Modelos generalistas de edición

| Modelo (ID vigente) | Precio | Latencia | Multi-referencia | Logos/texto | Color | Marca de agua | Datos y uso comercial | GW / SDK |
|---|---|---|---|---|---|---|---|---|
| **Nano Banana 2.1** `gemini-nano-banana-2.1` | 1K US$0.0336 · 2K US$0.0504 · 4K US$0.113; Batch a la mitad; entrada US$1.50/M tokens [Doc: ai.google.dev/gemini-api/docs/pricing] | Con "thinking" activo, que no se puede desactivar; hasta 2 imágenes intermedias [Doc]. Segundos exactos [NV] | Hasta 14 referencias en total [Doc] | Google declara "improved text rendering" frente a NB2 [Doc]. Fidelidad de logos bordados [NV → piloto] | [NV → piloto] | **SynthID en todas las imágenes** [Doc]. La marca visible (destello) aparece en AI Studio, no en la API de pago, según un foro [3ro/NV] | Tier de pago: no se usan datos para mejorar productos; el tier gratuito sí [Doc]. Sin tier gratuito para imagen [Doc] | **Sí**: `google/gemini-nano-banana-2.1` con `generateText` → `result.files` [Doc] |
| **Nano Banana 2** `gemini-3.1-flash-image` | 0.5K US$0.045 · 1K US$0.067 · 2K US$0.101 [Doc] | [NV] | Hasta 14 [Doc] | Bueno [NV] | [NV] | SynthID [Doc] | Igual que 2.1 | Sí |
| **Nano Banana 2 Lite** `gemini-3.1-flash-lite-image` | 1K US$0.0336 (solo 1K) [Doc] | La más rápida [Doc] | **No optimizada** para multi-referencia ni edición en varios turnos [Doc] | [NV] | [NV] | SynthID | Igual | Sí |
| **Nano Banana Pro** `gemini-3-pro-image` | 1K/2K US$0.134 · 4K US$0.24; entrada ~US$0.0011 por imagen [Doc] | Más lenta [NV] | Hasta 14 en total, 6 de objeto [Doc, tabla parcialmente legible] | El mejor de Google para "tareas visuales complejas" [Doc] | [NV] | SynthID | Igual | Sí |
| ~~Nano Banana~~ `gemini-2.5-flash-image` | US$0.039 | — | — | — | — | — | **Se apagó el 2026-10-02** [Doc] | Descartado |
| **gpt-image-2.5-sunburst** (edición precisa) / **-flare** (rápido) | Por tokens: imagen de entrada US$8/M, salida US$30/M [Doc]. Por imagen ≈ US$0.03 (medium) a ≈ US$0.13+ (high) a 1024² (cálculo con conteos de tokens de gpt-image-1, **[NV]** para 2.5) | "Hasta 2 minutos" en prompts complejos [Doc] | Varias imágenes en `/v1/images/edits`; el ejemplo usa 4, sin límite documentado [Doc] | OpenAI lista "consistency for recurring brands" y texto como **limitaciones** [Doc] | [NV] | **C2PA + SynthID** en imágenes de la API [Doc: help.openai.com/en/articles/8912793] | No entrena por defecto; registros de `/v1/images/*` 30 días; ZDR con aprobación previa [Doc] | **Sí** (`openai/gpt-image-2`, `-2.5-*`) con `generateImage` [Doc] |
| **gpt-image-2** (`gpt-image-2-2026-04-21`) | Mismas tarifas por token que 2.5 [Doc] | [NV] | Sí [Doc] | Igual | [NV] | C2PA + SynthID | Igual | Sí |
| **gpt-image-1-mini** | Imagen: entrada US$2.50/M, salida US$8/M [Doc] | [NV] | Sí | Inferior [NV] | [NV] | C2PA | Igual | Sí |
| **FLUX.3 Image** (BFL, 2026-10-01) | US$0.05 en GW [Doc]; en BFL US$0.041 a 768², US$0.048 a 1K [3ro] | [NV] | Hasta 10 referencias, "pixel-exact local edits" [3ro] | [NV] | [NV] | [NV] | Términos de la API de BFL [NV]; pesos abiertos no publicados [3ro] | **Sí** `bfl/flux-3-image` (y `-klein` US$0.01) [Doc] |
| **FLUX.2 [pro] edit** | US$0.03 el 1.er MP de salida + US$0.015 por cada MP adicional de entrada o salida [Doc fal]. Con 2 referencias de 1 MP y salida de 1 MP ≈ US$0.06 (cálculo) | [NV] | Hasta 9 (9 MP en total) [Doc fal] | Bueno en tipografía [NV] | [NV] | [NV] | [NV] | Sí `bfl/flux-2-pro` (precio no visible en la lista) |
| **FLUX.1 Kontext [pro]/[max]** | US$0.04 / US$0.08 en GW [Doc] | Rápido [NV] | Una imagen (pro) [NV] | Generación anterior | [NV] | [NV] | [NV] | Sí |
| **Seedream 5.0 Pro / Lite** (ByteDance) | GW: US$0.04 [Doc]. BytePlus: Pro US$0.045 hasta 2.36 MP; referencias extra a US$0.003 [3ro]. Lite US$0.035 [3ro] | [NV] | 2–10 referencias [3ro] | [NV] | [NV] | [NV] | Proveedor BytePlus; jurisdicción y retención [NV]: **revisar antes de enviar fotos de personas** | **Sí** `bytedance/seedream-5.0-pro` / `-lite` |
| **Qwen-Image-Edit-2511** (pesos abiertos) | Autoalojado: costo de GPU. Vía fal ~US$0.03 [NV] | 20B parámetros en BF16 [Doc] → GPU grande; no corre en la RPi5 | Sí, multi-imagen [Doc] | Mejor consistencia que la versión 2509 [Doc] | [NV] | Ninguna | **Apache-2.0** [Doc: huggingface.co/Qwen/Qwen-Image-Edit-2511] | **No** en GW |
| **Cloudflare FLUX.2 [klein] 4B** | ~US$0.0013; cuota gratuita de ~85 imágenes al día | Rápido | 4 referencias, **entradas < 512x512** | Probablemente deforma el logo pequeño | — | — | Ver Doc-BajoCosto | No (Workers AI) |
| Recraft v4.1 | GW (precio no visible) | — | — | Fuerte en diseño gráfico y vector | — | — | — | Sí. **Poco adecuado** para fidelidad fotográfica de prenda [criterio del autor] |
| Ideogram | — | — | — | Fuerte en tipografía generada | — | — | — | **No** en GW [Doc]. No evaluado |
| MAI-Image-2.6 (Microsoft), Muse Image (Meta), Grok Imagine | En GW [Doc] | — | — | — | — | — | — | No evaluados; candidatos para una 2.ª ronda |

### 3.2 Servicios especializados en fotografía de producto

| Servicio | Funciones relevantes | Precio | Notas |
|---|---|---|---|
| **Photoroom API** | Ghost Mannequin, Flat Lay, Virtual Model, AI Relighting, AI Shadows, AI Backgrounds (plan Plus) [Doc] | **US$0.10/imagen** (Plus); quitar fondo US$0.02 (Basic); sandbox con 1.000 llamadas al mes con marca de agua; 10 llamadas de producción gratis [Doc] | Plan mensual; las imágenes no usadas **no se acumulan** [Doc]. Ghost mannequin a 1K por defecto [Doc]. Uso de datos y retención [NV] |
| **Claid.ai** | Ghost mannequin, modelos IA (on-model), quitar fondo, upscaling, corrección de color [Doc, genérico] | Créditos [NV: cifras no visibles] | Pedir precio. Tiene conectores de almacenamiento |
| **Pebblely** | Fondos y escenas de producto; API | ~US$0.20 (45 imágenes por US$9) a ~US$0.05 por volumen [3ro] | Orientado a escenas, no a ghost mannequin [NV] |
| **Botika** | Modelos IA vistiendo la prenda (on-model) | Suscripción por créditos (Lite ~US$33/mes por 30 créditos) [Prov]. **API pública sin confirmar** [3ro, fuentes contradictorias] | ≈ US$0.7–1.1 por imagen (cálculo). Caro para LoloShop |
| **FASHN** | Try-on y Background Remove; modelos on-model [Doc-Cliente] | US$0.075 por crédito | Ver Doc-Cliente |
| **FLUX VTO** (BFL) | Try-on de BFL | Aparece en la calculadora de bfl.ai [Doc]; precio [NV] | Candidato para §5 |

**Lectura de la matriz (criterio del autor):** con la información pública, ningún proveedor garantiza la fidelidad del logo. Gemini 2.1 gana en **precio por calidad nominal y madurez**, y además está en el Gateway que ya usa la plataforma del proyecto. gpt-image-2.5 se reserva para casos difíciles por su costo y latencia. Photoroom es el único con un endpoint pensado para *ghost mannequin*, y su sandbox gratuito lo convierte en el **comparador de referencia** del piloto.

---

## 4. Prompts de ejemplo

Los prompts van en inglés, porque los modelos siguen mejor las instrucciones en ese idioma [NV, práctica común]. Cada prompt lleva un identificador de versión (`promptVersion`) que se guarda con el resultado. Notación: `[IMG1]` es la foto principal, `[IMG2..n]` son las referencias de la misma prenda.

### 4.1 Bloque común de fidelidad (se antepone a todos)

```
You are editing a real retail product photo for an e-commerce catalog. The output MUST depict the exact same physical item.
Do NOT change: garment colors (match the reference pixels exactly), logo shape, logo text, logo position and size, embroidery,
printed numbers (e.g. "700"), zipper, pockets, seams, number and spacing of quilted baffles, drawcords, collar shape, fabric texture.
Do NOT add any logo, text, label, pattern, pocket, zipper or detail that is not visible in the references.
If a part of the garment is not visible in any reference, reconstruct it conservatively and plainly; never invent branding there.
Remove any Instagram/phone UI if present.
```

### 4.2 Salida 1: catálogo (ghost mannequin, frente)

```
[IMG1] is the main front photo of the garment. [IMG2] is another front photo of the SAME garment; [IMG3] is its back view, use only for structure.
Create a professional e-commerce product photo of this garment in "ghost mannequin" (invisible mannequin) style:
front view, perfectly centered, symmetrical, upright, full garment visible including both sleeves and the hem, 3D natural volume as if worn,
collar open showing the inner neck area. Remove the hand, the hanger, the price tags and cardboard labels, the stool, and the entire background.
Pure white seamless background (#FFFFFF), soft even studio lighting, subtle natural shadow beneath, no reflections or color cast.
Square 1:1 composition with ~8% margin. Photorealistic, sharp fabric detail.
```

**Variante flat-lay:** cambiar el párrafo de estilo por *"neatly laid flat, shot from directly above, sleeves extended symmetrically at slight angles, no wrinkles added or removed beyond what is natural"*. **Variante espalda:** usar la foto de espalda como `[IMG1]` y el frente como referencia de color.

### 4.3 Salida 2: lista para try-on

```
[IMG1] main front photo; [IMG2..] same garment.
Output ONLY the garment, front view, flat and frontal (orthographic, no perspective), sleeves fully extended downward and slightly outward,
zipper closed, no hanger, no hand, no tags, no mannequin, no shadow, pure white background (#FFFFFF), even flat lighting.
Garment fills ~85% of the frame height, portrait 3:4. Keep logo and all details exactly as in the references.
```

(Formato pensado para FASHN y similares: prenda sola, frontal, fondo liso. Ver Doc-Cliente.)

### 4.4 Salida 3 (opcional): on-model para catálogo

```
[IMG1] is the approved catalog image of the garment (source of truth). [IMG2] is the original photo for color reference.
Generate a photorealistic e-commerce photo of a fictional adult model (not resembling any real or famous person) wearing EXACTLY this garment,
zipper closed, standing straight, front view, neutral expression, plain dark jeans, light grey seamless studio background, soft studio light,
full upper body to mid-thigh. The garment must keep the same fit, colors, logo (position, size, text), "700" print, pockets and baffles.
Do not add accessories with logos.
```

**Decisión del autor:** el on-model parte de la imagen de catálogo **ya aprobada**, no de la foto cruda, para no propagar mano, gancho o fondo.

### 4.5 Prompt del "juez" (control automático, modelo de visión barato)

```
Compare image A (original) and image B (AI edited) of the same garment. Answer in JSON:
{ "logo_text_exact": bool, "logo_position_same": bool, "extra_or_missing_details": [..], "color_shift": "none|slight|strong",
  "hand_or_hanger_remaining": bool, "tags_remaining": bool, "notes": "..." }
```

Si `logo_text_exact=false` o `color_shift=strong`, el candidato se marca "sospechoso" y aparece en rojo en la revisión. El juez **no aprueba**: solo prioriza la revisión. Costo del juez: centavos de centavo con un modelo Flash de texto y visión [NV, cálculo pendiente].

---

## 5. Uso como motor de try-on (frente a FASHN y Decart)

| Criterio | Generalistas (Nano Banana 2.1 / gpt-image / FLUX / Seedream) | FASHN v1.6 (Doc-Cliente) | Decart en vivo (Doc-Personal) |
|---|---|---|---|
| Entrada | Persona + prenda (multi-referencia) + prompt | Persona + prenda + categoría | Video de cámara + prenda |
| Costo | 1K: US$0.034 (NB2.1) · US$0.04 (Seedream, GW) · ~US$0.05 (FLUX.3) (cálculo) | US$0.075 | US$0.02/s (US$6 por demo de 5 min) |
| Latencia | Segundos a decenas de segundos; gpt-image hasta 2 min [Doc] | 5–17 s [Doc] | Tiempo real |
| Identidad de la persona | **Riesgo**: puede retocar la cara, el cuerpo o la pose [NV, criterio del autor] | Diseñado para preservar a la persona [Prov] | Diseñado para eso [Prov] |
| Fidelidad de la prenda | Depende del prompt; logo en riesgo | Especializado en prenda [Prov] | [NV] |
| Restricciones | Políticas de uso de cada proveedor sobre personas reales [NV en detalle]; SynthID/C2PA en la salida | Moderación configurable | — |
| Datos | Gemini de pago: no entrena [Doc]; OpenAI: 30 días de registros [Doc] | Base64 sin retención [Doc-Cliente] | [ver Doc-Personal] |

**Conclusión (decisión del autor):**
- **Modo owner, por captura** (el híbrido de Doc-BajoCosto: cámara local y "Capturar"): Nano Banana 2.1 a 1K, a **US$0.034 por captura**, es la mitad de FASHN. Vale la pena probarlo en el piloto con **solo el owner como sujeto** y su consentimiento. Si conserva la cara y el logo en 4 de 5 casos, se adopta como motor por defecto, con FASHN como "calidad alta".
- **Modo cliente**: no adoptarlo sin piloto. Una cara alterada en la foto de un cliente es peor experiencia que no tener probador.
- **Tiempo real**: los generalistas no lo cubren. Decart sigue siendo la única opción de video en vivo, ya acotada en Doc-BajoCosto.
- Prompt base: *"[IMG1] is a photo of a person. [IMG2] is a garment. Make the person in IMG1 wear the garment from IMG2. Keep the person's face, hair, body shape, pose, background and lighting EXACTLY unchanged; change only the clothing on the upper body. Keep the garment logo, colors and details exactly."*

---

## 6. Flujo propuesto en la app, con revisión humana

### 6.1 Principios

1. **Original intocable**: la foto original (EXIF corregido, sin recorte ni auto-niveles) se sube **siempre** a Blob como `originalImageUrl`.
2. **Generar → revisar → aprobar → publicar**. Mientras no haya aprobación, el catálogo muestra la imagen actual (la original procesada como hoy).
3. **Solo el owner** dispara generaciones y aprueba (validación en el servidor, igual que `createLocationAction`). Hoy `uploadProductImageAction` solo exige sesión, de cualquier rol, así que la acción de IA necesita su propia comprobación de rol.
4. **No es inmediato**: la generación es asíncrona para el usuario. El alta del producto no espera a la IA.

### 6.2 Flujo

```
ALTA (/productos → NewProductForm)
  1. Foto (cámara/carrete). Advertencia si parece captura de pantalla (relación 9:20 con franjas negras) → sugerir recorte.
  2. Cliente: EXIF upright, recorte guiado opcional (rectángulo libre), máximo 2048 px → "original".
     Aparte, la vista previa 1:1 con auto-niveles actual (sin cambios) → imageUrl provisional.
  3. Servidor: sube original → originalImageUrl; crea el producto como hoy.
  4. Opcional: el personal marca la vista (frente/espalda) y agrupa más fotos de la misma prenda.

MEJORAR CON IA (botón "Mejorar foto" en /productos, solo owner; o en lote: "Mejorar pendientes")
  5. Servidor: comprueba rol, kill switch, presupuesto mensual y diario, intentos del producto y caché por hash (§7.3).
  6. Llama al modelo (AI Gateway) con el prompt versionado → recibe la imagen → la sube a Blob como candidato.
  7. Llama al juez (§4.5) → guarda el veredicto.
  8. Registra el costo estimado y real (el uso que devuelve el SDK) en el ledger.

REVISIÓN (/productos/revision, solo owner)
  9. Vista lado a lado: original | candidato, con zoom sincronizado sobre el logo, más el veredicto del juez.
 10. Aprobar → imageUrl (o tryOnImageUrl / onModelImageUrl según el tipo) = candidato; revalidatePath("/catalogo").
     Rechazar (motivo: logo, color, detalle inventado, restos de mano o gancho, otro) → borrar el blob del candidato.
     "Regenerar" → nuevo intento, que cuenta para el tope.
 11. "Restaurar original" disponible siempre.
```

### 6.3 Transporte (decisión del autor)

- **Fase 1:** una Server Action o Route Handler síncrona con `maxDuration` de unos 120 s, una llamada por clic. Es suficiente para el volumen de una tienda. La UI muestra "Generando…" y luego el candidato queda en la cola de revisión.
- **Fase 3 (opcional):** un cron nocturno que junta los pendientes y los manda a la **Gemini Batch API** (50 % menos). Requiere llamar a Gemini directo, sin Gateway, con su propia clave. Alternativa con más garantías: Vercel Queues o Workflow [NV, no evaluado aquí].
- El proyecto está en Next 14 y **no tiene** el paquete `ai`. Hay que añadir AI SDK y comprobar compatibilidad con la versión de Next vigente (PR #17 de Next 15 pendiente) [NV].

---

## 7. Datos y almacenamiento

### 7.1 Cambios en Prisma (vía `prisma migrate`, nunca SQL a mano)

**Aviso previo:** el repo **no tiene `prisma/migrations/`** (hallazgo de Doc-Personal y confirmado hoy). Primero hay que crear el baseline de migraciones contra la base de producción.

`Product` (campos nuevos, todos opcionales, sin romper nada):
- `originalImageUrl String?`: foto original intocable.
- `imageUrl String?`: **se mantiene** como la imagen pública del catálogo (original procesada o candidato aprobado).
- `tryOnImageUrl String?`: compartido con Doc-BajoCosto y Doc-Cliente (mismo nombre, mismo significado).
- `onModelImageUrl String?`: opcional, salida 3.
- `imageSource String @default("original")`: valores `original | ai_approved`, para mostrar la leyenda (§9).

Modelo nuevo `ProductImageJob` (candidatos y auditoría; **decisión del autor**: una tabla, no campos sueltos):
- `id`, `productId` (relación con borrado en cascada), `kind` (`catalog_front | catalog_back | tryon | on_model`)
- `status` (`pending | generated | approved | rejected | failed`)
- `provider`, `model` (p. ej. `google/gemini-nano-banana-2.1`), `promptVersion`, `inputHash` (sha256 de las entradas + tipo + modelo + promptVersion)
- `inputUrls String[]`, `outputUrl String?`, `judgeResult Json?`
- `costUsd Decimal?`, `latencyMs Int?`, `errorCode String?`
- `requestedById`, `reviewedById?`, `reviewedAt?`, `rejectReason?`, `createdAt`
- Índices: `@@index([status])`, `@@index([productId, kind])`, `@@index([createdAt])`

El presupuesto mensual se calcula con `SUM(costUsd) WHERE createdAt >= inicio de mes`, sin tabla extra.

### 7.2 Blob

- Rutas: `productos/original/…`, `productos/candidatos/…`, `productos/aprobadas/…`. Se reutiliza `lib/image/upload.ts`, generalizado para aceptar `Buffer`/`Uint8Array` y prefijo.
- Hoy todo es `access: "public"`. Los candidatos quedan en una URL pública pero no adivinable (sufijo aleatorio) durante la revisión y **se borran al rechazarlos**. Si Blob ofrece acceso privado en el plan vigente, usarlo para candidatos y originales [NV].
- Volumen: ~5 imágenes de ~300 KB por producto ≈ 1.5 MB; 300 productos ≈ 450 MB (cálculo). Hobby incluye 1 GB [Doc-BajoCosto]. **Decisión del autor:** guardar el original a 2048 px en JPEG de calidad 0.9 y los candidatos en WebP.

### 7.3 Caché y reintentos

- **Caché por `inputHash`**: si ya existe un trabajo `generated` o `approved` con el mismo hash, no se vuelve a llamar. "Regenerar" fuerza un intento nuevo con otra semilla y cuenta contra el tope.
- **Reintentos automáticos** solo ante errores transitorios (429, 5xx, timeout): máximo **1** reintento con backoff. Un resultado malo **no** se reintenta automáticamente: lo decide el owner.
- Gemini cobra cada imagen generada aunque sea mala [NV: política de cobro de fallos]. Photoroom y Seedream cobran por éxito [Doc/3ro]. El ledger registra todo.

---

## 8. Presupuesto y límites

### 8.1 Costo unitario de referencia (cálculo)

| Operación | Modelo | Costo por llamada |
|---|---|---|
| Catálogo frente, 2K, 2–3 referencias | Nano Banana 2.1 | ≈ US$0.055 |
| Lista para try-on, 1K | Nano Banana 2.1 | ≈ US$0.038 |
| On-model, 2K | Nano Banana 2.1 | ≈ US$0.055 |
| Juez | Modelo de visión barato | < US$0.002 [NV] |
| Caso difícil (logo deformado dos veces) | gpt-image-2.5-sunburst high | ≈ US$0.15–0.25 [NV] |

**Por producto (1.5 intentos en promedio):** base (catálogo + try-on) ≈ **US$0.14**; completo (más espalda y on-model) ≈ **US$0.31**. Con Batch, la mitad.

### 8.2 Topes concretos (valores iniciales, configurables)

| Control | Valor | Mecanismo |
|---|---|---|
| Piloto (una sola vez) | **US$25** | Crédito prepagado de AI Gateway por US$25 **sin auto top-up** = tope duro. Photoroom en sandbox (US$0) |
| Presupuesto mensual | **US$10** (≈ 70 productos con el paquete base) | `PHOTO_AI_MONTHLY_BUDGET_USD`; el servidor rechaza con un mensaje claro al llegar al tope. Además, un budget de AI Gateway en Vercel [Doc] |
| Techo absoluto (con on-model) | **US$25/mes** | Budget de Vercel por proyecto o API key [Doc] |
| Carga inicial del catálogo existente | Autorización aparte: hasta **US$0.15 por producto**; con 300 productos ≈ US$45, o ≈ US$23 con Batch | Se ejecuta por lotes de 50, con revisión entre lotes |
| Llamadas por día | **40** | `PHOTO_AI_DAILY_MAX_CALLS` |
| Intentos por producto y tipo | **4** (después, solo foto nueva) | `PHOTO_AI_MAX_ATTEMPTS_PER_KIND` |
| Modelo caro (gpt-image-2.5 high) | Máximo **10 al mes**, solo con botón explícito | `PHOTO_AI_PREMIUM_MONTHLY_MAX` |
| Interruptor | Apagado por defecto | `PHOTO_AI_ENABLED` |
| Alerta | Al 50 % y al 80 % del mensual | Aviso en el dashboard del owner |

### 8.3 Variables de entorno (solo nombres; ninguna con `NEXT_PUBLIC_`)

`AI_GATEWAY_API_KEY` (o la autenticación OIDC de Vercel en producción), `PHOTO_AI_ENABLED`, `PHOTO_AI_MODEL` (slug principal), `PHOTO_AI_FALLBACK_MODEL`, `PHOTO_AI_JUDGE_MODEL`, `PHOTO_AI_MONTHLY_BUDGET_USD`, `PHOTO_AI_DAILY_MAX_CALLS`, `PHOTO_AI_MAX_ATTEMPTS_PER_KIND`, `PHOTO_AI_PREMIUM_MONTHLY_MAX`, `PHOTOROOM_API_KEY` (solo si se adopta), `GEMINI_API_KEY` (solo para Batch, fase 3). `BLOB_READ_WRITE_TOKEN` ya existe.

**Costos fuera de este presupuesto:** Vercel Hobby es "non-commercial" y una tienda requiere Pro (ver Doc-BajoCosto §1). La ZDR por petición de AI Gateway solo existe en Pro/Enterprise [Doc].

---

## 9. Riesgos legales y éticos

1. **Representación fiel del artículo (riesgo principal).** La foto debe mostrar el artículo real: color, estado, detalles. En México, la Ley Federal de Protección al Consumidor exige información y publicidad veraz y no engañosa (art. 32) [NV en esta consulta; confirmar con asesoría]. Un azul más brillante, un logo distinto o un bolsillo inventado pueden generar reclamaciones o devoluciones. Mitigación: revisión humana obligatoria, juez automático y **mostrar también la foto original** en la ficha del producto (galería: "Foto real").
2. **Alucinaciones de detalle**: cremalleras, número de cámaras, "700", cordones, logo reescrito ("THE NORTH FACF", semicírculo con dos franjas). Mitigación: lista de control de §2.2 en la pantalla de revisión, zoom sincronizado al logo y rechazo con motivo para medir la tasa de error por modelo.
3. **Marcas registradas.** Editar la foto de un artículo de marca **genuino** para venderlo es práctica habitual de reventa. Generar o redibujar el logo con IA crea dos riesgos: un logo deformado (calidad y confusión) y un on-model que sugiera respaldo de la marca. Las políticas de uso de Google y OpenAI prohíben infringir derechos de terceros [NV en detalle]. Mitigaciones: nunca pedir "añade el logo"; preferir que el logo salga de los píxeles originales; nada de texto como "oficial" o "autorizado" salvo que lo sea. **Pregunta al dueño:** ¿la mercancía es original y de qué canal proviene? (§11).
4. **Marca de tercero en el gancho** ("El Palacio de Hierro"): eliminarla es correcto, porque no debe aparecer en el catálogo.
5. **Personas reales**: el on-model usa un modelo ficticio. Prohibido generar con la cara del personal, de clientes o de famosos sin consentimiento por escrito. Para el try-on del owner: consentimiento del owner y fotos que no se persisten (como en Doc-BajoCosto).
6. **Transparencia**: las imágenes llevan SynthID (Gemini) o C2PA + SynthID (OpenAI) [Doc]. **Decisión del autor:** no quitarlos, y añadir la leyenda "Imagen editada con IA a partir de la foto real" (catálogo) o "Modelo generado con IA" (on-model). Algunas plataformas de venta exigen declarar las imágenes con IA [NV].
7. **Datos**: las fotos de producto no son datos personales, salvo que aparezca una persona (mano, jeans, cara de fondo en `77358117`). Recortar antes de enviar. Usar solo tiers de pago, porque el tier gratuito de Gemini sí usa datos para mejorar productos [Doc].
8. **Dependencia del proveedor**: Nano Banana original se apagó el 2026-10-02 [Doc]. Los modelos cambian cada pocos meses. Mitigación: slug configurable, `promptVersion` en el ledger y re-piloto corto ante cada cambio de modelo.

---

## 10. Plan por fases (empezando por el piloto)

### Fase 0: piloto con las 6 fotos reales (sin tocar la app; scripts locales fuera del repo o en una rama)

**10.1 Preparación (sin IA):** recortar la franja de foto de cada captura (y≈480–1920 en el original 1080x2400), sin auto-niveles. Agrupar por prenda (§2.1). Si es posible, pedir al personal **las fotos originales del carrete** de las mismas prendas y repetir con ellas: es la comparación más valiosa del piloto.

**10.2 Matriz del experimento:**

| Eje | Valores |
|---|---|
| Fotos/tareas | 6 fotos → catálogo (6) + try-on (4 frentes) + on-model (2: una por prenda) = **12 tareas** |
| Modelos | Nano Banana 2.1 (2K), Nano Banana Pro (2K), gpt-image-2.5-sunburst (high), FLUX.3 Image, Seedream 5.0 Pro, Qwen-Image-Edit-2511 (fal), Photoroom Ghost Mannequin (sandbox, solo catálogo) |
| Prompts | 2 variantes por tarea: A = §4 completo; B = A + 1 referencia extra de la misma prenda |
| Semillas | 1 por combinación (2 si el resultado es límite) |

**10.3 Criterios de evaluación (rúbrica de 0 a 2 por criterio; evalúan el owner y una segunda persona a ciegas, sin saber el modelo):**

1. Logo exacto (texto, forma, posición, tamaño). **Eliminatorio si da 0.**
2. Color: ΔE2000 medio entre una muestra del cuerpo de la prenda en el original y en el resultado. Objetivo ≤ 5; más de 10 es rechazo (medición con script) [umbral: decisión del autor].
3. Detalles preservados según la lista de §2.2 (cuenta de faltantes y añadidos).
4. Limpieza: sin mano, gancho, etiquetas, banco ni UI.
5. Calidad "de catálogo": centrado, luz, volumen ghost mannequin creíble.
6. Para try-on/on-model: identidad conservada y prenda correcta.
7. Latencia y costo real por imagen (del ledger o de la factura).

**Umbral de adopción:** ≥ 80 % de las salidas de catálogo aprobables sin edición y **0 logos deformados aceptados**.

**10.4 Costo estimado del piloto (cálculo):** unas 24 llamadas por modelo (12 tareas × 2 variantes): NB2.1 ≈ US$1.3 · NB Pro ≈ US$3.3 · gpt-image-2.5 high ≈ US$4–6 [NV] · FLUX.3 ≈ US$1.2 · Seedream ≈ US$1.0 · Qwen ≈ US$0.7 [NV] · Photoroom US$0 (sandbox; la marca de agua no afecta la evaluación de fidelidad) · juez ≈ US$0.1. **Total ≈ US$12–14; con reintentos ≈ US$18; tope US$25.**

### Fase 1: MVP en la app (después del piloto)
Baseline de migraciones, campos y `ProductImageJob`, subida del original, botón "Mejorar foto" solo para el owner con el modelo ganador por AI Gateway, pantalla de revisión, topes y kill switch. Solo salida 1 (catálogo).

### Fase 2: lista para try-on
Salida 2 → `tryOnImageUrl`, que alimenta los probadores (Doc-BajoCosto, Doc-Cliente). Prueba del motor de try-on generalista en el modo owner (§5).

### Fase 3: optimización
Lote nocturno con Gemini Batch (50 %), on-model opcional, carga del catálogo existente por lotes y respaldo automático al modelo secundario si el juez rechaza dos veces.

### Fase 4: revisión
Tasa de aprobación por modelo y por `promptVersion`, costo real contra presupuesto y re-piloto ante cada cambio de modelo.

---

## 11. Preguntas para el dueño

1. ¿El estilo del catálogo es **ghost mannequin** o **flat-lay**? ¿Fondo blanco puro o gris claro de estudio?
2. ¿Se quiere la **salida 3 (on-model)**? Sube el costo por producto de ≈ US$0.14 a ≈ US$0.31.
3. ¿Aprueba **US$25 para el piloto** y **US$10/mes** de operación? ¿Cuántos productos nuevos se dan de alta al mes y cuántos existen hoy?
4. ¿Puede el personal mandar **fotos originales del carrete** en lugar de capturas de historias? Es la mejora más barata.
5. ¿Solo el owner aprueba, o también un manager?
6. ¿La mercancía TNF es original y de qué canal proviene? (Influye en cómo usar la marca en imágenes generadas.)
7. ¿Se acepta mostrar la leyenda "Imagen editada con IA" y la foto real en la galería?
8. ¿Se prefiere no depender de un proveedor de EE. UU./China para imágenes con personas (try-on)? Afecta a Seedream.
9. ¿El proyecto de Vercel ya está en Pro? (Requisito comercial y de ZDR.)

---

## 12. Decisiones del autor (el dueño debe validarlas)

1. **Decisión del autor:** modelo principal **Nano Banana 2.1 vía AI Gateway**; respaldo **FLUX.3 / FLUX.2 [pro]** por el mismo SDK; **Photoroom Ghost Mannequin** como referencia especializada en el piloto. Todo queda pendiente del piloto.
2. **Decisión del autor:** la foto original se conserva siempre (`originalImageUrl`) y `imageUrl` solo cambia con aprobación del owner.
3. **Decisión del autor:** una tabla `ProductImageJob` para candidatos, auditoría y costo, en lugar de campos de estado sueltos en `Product`.
4. **Decisión del autor:** enviar a la IA la foto sin recorte 1:1 ni auto-niveles, a 2048 px, y recortar antes la UI de Instagram y las personas.
5. **Decisión del autor:** multi-referencia (varias fotos de la misma prenda) para reconstruir partes ocultas en lugar de inventarlas.
6. **Decisión del autor:** el on-model se genera desde la imagen de catálogo aprobada, nunca desde la foto cruda.
7. **Decisión del autor:** un juez automático (modelo de visión barato) prioriza la revisión pero **nunca aprueba**.
8. **Decisión del autor:** generación síncrona por clic en la fase 1; Batch nocturno en la fase 3.
9. **Decisión del autor:** topes de US$25 (piloto), US$10/mes y US$25/mes absoluto, con crédito prepagado sin auto-recarga como tope duro.
10. **Decisión del autor:** leyenda de IA visible y SynthID/C2PA sin quitar.
11. **Decisión del autor:** nombre `tryOnImageUrl` compartido con Doc-BajoCosto, para no duplicar campos.

---

## Fuentes consultadas (2026-10-19)

- [Doc] Gemini API precios (Nano Banana 2.1, 3.1 Flash Image, Lite, 3 Pro Image, apagado de 2.5 Flash Image, uso de datos por tier): <https://ai.google.dev/gemini-api/docs/pricing>
- [Doc] Gemini generación de imágenes (modelos, 14 referencias, resoluciones, SynthID, thinking): <https://ai.google.dev/gemini-api/docs/image-generation>
- [3ro] Marca visible y SynthID de Gemini: <https://discuss.ai.google.dev/t/regression-forced-visible-star-watermark-breaks-gemini-nano-banana-pro-image-to-image-and-flow-frame-to-video-workflows/114193>, <https://pcworld.com/article/3213409/google-now-lets-you-nix-visible-gemini-image-watermarks.html>
- [Doc] OpenAI precios (gpt-image-2.5-sunburst/flare, gpt-image-2, 1.5, 1-mini, 1): <https://developers.openai.com/api/docs/pricing>
- [Doc] OpenAI guía de generación de imágenes (calidades, ediciones multi-imagen, latencia, limitaciones): <https://developers.openai.com/api/docs/guides/image-generation>
- [Doc] OpenAI gpt-image-2 (snapshot 2026-04-21, endpoints, rate limits): <https://developers.openai.com/api/docs/models/gpt-image-2>
- [Doc] OpenAI datos de la API (no entrena por defecto, 30 días, ZDR en imágenes): <https://developers.openai.com/api/docs/guides/your-data>
- [Doc] OpenAI C2PA y SynthID: <https://help.openai.com/en/articles/8912793>
- [Doc] Vercel AI Gateway generación de imágenes: <https://vercel.com/docs/ai-gateway/capabilities/image-generation> ; con AI SDK: <https://vercel.com/docs/ai-gateway/modalities/image-generation/ai-sdk> ; lista de modelos de imagen y precios: <https://vercel.com/ai-gateway/models?type=image> ; precios, sin recargo, budgets, ZDR: <https://vercel.com/docs/ai-gateway/pricing> ; changelog de modelos de imagen: <https://vercel.com/changelog/image-only-models-available-in-vercel-ai-gateway>
- [Doc] BFL precios (calculadora, créditos, FLUX VTO listado): <https://bfl.ai/pricing>, <https://docs.bfl.ai/quick_start/pricing>
- [Doc fal] FLUX.2 [pro] edit (precio por MP, 9 referencias): <https://fal.ai/models/fal-ai/flux-2-pro/edit>
- [3ro] FLUX.3 Image (fecha, precios, 10 referencias): <https://openrouter.ai/black-forest-labs/flux-3-image>, <https://www.llmreference.com/model/flux-3-image>, <https://kingy.ai/ai-launch-tracker/flux-3-image-2026-10-01/>
- [3ro] Seedream 5.0 Pro/Lite (precio, referencias): <https://www.atlascloud.ai/blog/ai-updates/seedream-5-0-pro-price>, <https://mer.vin/2026/07/seedream-5-0-pro-api-on-byteplus-precision-image-generation-and-multi-reference-editing/>
- [Doc] Qwen-Image-Edit-2511 (Apache-2.0, multi-imagen, 20B): <https://huggingface.co/Qwen/Qwen-Image-Edit-2511>
- [Doc] Photoroom API precios: <https://www.photoroom.com/api/pricing> ; Ghost Mannequin: <https://docs.photoroom.com/image-editing-api-plus-plan/ghost-mannequin>, <https://www.photoroom.com/api/ghost-mannequin>
- [Doc] Claid API (genérico): <https://docs.claid.ai/>, <https://claid.ai/pricing>
- [3ro/Prov] Botika: <https://botika.io/pricing>, <https://apis.io/providers/botika/>, <https://www.photta.app/pricing-and-reviews/botika> ; Pebblely: <https://us.fitgap.com/products/048891/pebblely>
- Documentos internos: Doc-BajoCosto, Doc-Cliente y Doc-Personal (fuentes de FASHN, Decart, Cloudflare, BiRefNet, Photoroom quitar fondo, Vercel Hobby).

**Lo que no pude verificar:** la calidad real de cualquier modelo con estas prendas (por eso el piloto); el costo exacto por imagen de gpt-image-2.5 por calidad (la página no lo da, solo tarifas por token); la latencia de Nano Banana 2.1; los términos de retención de BFL, BytePlus/Seedream, Photoroom y Claid; los precios de Claid; si FLUX.3 tiene buena fidelidad de logos (lleva menos de tres semanas publicado); si los fallos de Gemini se cobran; si la Gemini Batch API está disponible a través de AI Gateway; el SLA de Batch; las políticas detalladas de Google y OpenAI sobre marcas y personas reales; el artículo exacto de la LFPC y las políticas de marketplaces sobre imágenes con IA; si Vercel Blob ofrece acceso privado en el plan vigente; la compatibilidad de AI SDK con Next 14.
