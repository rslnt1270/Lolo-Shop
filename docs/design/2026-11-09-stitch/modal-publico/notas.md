# modal-publico: detalle público de un producto

- **Stitch:** pantalla `db065b230b7b4c17b93cb352e2b7d08c`.
- **Tareas del plan:** 2.1, 2.2 y 2.4.

## Estados que cubre
- Fotos de frente y de atrás (miniaturas e indicador 1/2).
- Tallas: agotada (tachada), seleccionada, disponibles.
- Disponible en tienda, código público y CTA de WhatsApp.
- Alternativa sin número válido: solo el texto "Consulta disponibilidad en tienda.".

## Jerarquía
Cerrar → foto grande → miniaturas Frente/Atrás → marca → nombre → precio de la talla elegida → Talla → disponibilidad → código → "Consultar por WhatsApp".

## Textos exactos
- "Consultar por WhatsApp" (fondo #007272, texto blanco, 56 px)
- Mensaje de WhatsApp: `Hola, me interesa {marca} {nombre} en talla {talla}. ¿Sigue disponible? Código {codigo}`
- Sin número: "Consulta disponibilidad en tienda." (sin botón ni enlace `wa.me`)
- Leyenda: "Tachada = agotada"; nombre accesible de la talla: "S, agotada".

## Reglas públicas
Sin SKU, código de barras, conteos ni almacén. El número sale de `NEXT_PUBLIC_WHATSAPP_NUMBER` (`^52\d{10}$`); en ejemplos usar `52XXXXXXXXXX`. Nunca mostrar el número en pantalla.

## Diferencias y avisos
- El PNG se corta antes del CTA; el HTML trae el CTA y el estado sin número.
- "Te responde la tienda por WhatsApp." la agregó el prompt: es neutra, pero el dueño puede quitarla.
- La tarjeta "Sin número configurado:" es documentación; en la app solo aparece el texto alterno.
- Accesibilidad (2.4): `role="dialog"`, `aria-modal`, `aria-labelledby`; Esc cierra y el foco vuelve; scroll bloqueado; con `key` = id del producto la talla se reinicia.
- "Disponible en tienda" cambia a "Agotado" (#9A3B2E con texto) si la talla elegida no tiene existencias.
