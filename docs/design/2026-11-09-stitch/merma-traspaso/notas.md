# merma-traspaso: panel de movimientos de stock en /escanear

- **Stitch:** pantalla `950b3fd3faf24490a0ec04c8db3ec4e0`.
- **Tareas del plan:** 1.2 (`StockMovementPanel`) y 1.8 (traspasos).

## Estados que cubre
- Producto existente con tallas y piezas de **tu** tienda, y "Agregar talla".
- Entrada (todos).
- Merma o corrección (owner y manager): Merma resta; Corrección suma o resta; motivo obligatorio.
- Errores: "Solo hay 1 en esta tienda." y "Escribe el motivo."
- Traspasar (owner y manager): origen, destino, piezas, nota; éxito.
- Aviso de venta con enlace a `/pos`.

## Jerarquía (obligatoria)
1. **"Entrada"** es el primer botón del panel, relleno #007272.
2. "Merma o corrección", contorno, solo owner y manager.
3. "Traspasar", contorno, solo owner y manager (el manager con tienda solo desde o hacia la suya).
4. "¿Vendiste la prenda? Regístrala en Vender." con enlace a `/pos`.
**No existe botón "Salida".**

## Textos exactos
- "Entrada" · "Merma o corrección" · "Merma" / "Corrección" · "Motivo" (obligatorio, 3–120 caracteres, sin 7+ dígitos)
- INSUFFICIENT: "Solo hay N en esta tienda."
- Éxito de traspaso: "Se movieron N de {origen} a {destino}."
- "¿Vendiste la prenda? Regístrala en Vender."

## Diferencias y avisos
- La barra inferior (Inventario, Escanear, Movimientos, Ajustes) es invento de Stitch: **no implementarla**.
- La etiqueta "Exclusivo Manager" debe decir "Solo owner y manager" o quitarse.
- La tarjeta muestra "$000 SKU: 000-00": es staff, se permite, pero no es requisito.
- El botón dice "REGISTRAR MERMA" en mayúsculas; usar "Registrar merma" (y "Registrar corrección" con Corrección).
- El mockup abre los tres formularios a la vez; en la app, uno a la vez.
- Mismo `requestId` en reintentos: botón deshabilitado mientras espera, sin duplicar con doble toque.
- Con colaborador solo se ven Entrada y el aviso de Vender.
- Origen = destino → error INVALID bajo los selects.
