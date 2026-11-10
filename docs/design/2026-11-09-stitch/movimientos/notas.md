# movimientos: historial de movimientos

- **Stitch:** pantalla `a69044c1e448426e8338724eeed721da`.
- **Tarea del plan:** 1.9 (`/movimientos`, `listMovementsAction`).

## Estados que cubre
- Filtros: Tienda, Tipo, Persona, Prenda (escanear o buscar), Fechas (hoy por omisión).
- Renglones de los 6 tipos, incluido un traspaso en par (−1 origen, +1 destino).
- "Ver más" y el estado vacío.

## Renglón (orden)
Fecha y hora de México (mono) · tipo con icono **y** texto · delta con signo (mono, a la derecha) → prenda · talla y tienda → quién · motivo, nota o folio.

## Textos exactos
- Tipos: "Venta", "Entrada", "Merma", "Corrección", "Traspaso", "Devolución"
- "Mostrando hoy · hora de México" · "Limpiar filtros" · "Ver más" (suma 50)
- Vacío: "No hay movimientos con estos filtros."
- Motivo: "Motivo: …"; venta: "Folio V-…"; traspaso: "Nota: …" y "Lomas → ClubAlva"

## Diferencias y avisos
- El estado vacío aparece bajo la lista solo para documentarlo; en la app es uno u otro.
- "Ver más" desaparece cuando `nextCursor` es null.
- Colaborador: los filtros de tienda y fecha quedan fijos (su tienda, hoy) y se muestran deshabilitados con texto, no ocultos.
- Rango > 93 días (INVALID): mostrar el mensaje del servidor en #9A3B2E bajo el filtro de fechas (texto sugerido, no del spec: "El rango máximo es de 93 días.").
- Ningún renglón muestra alias de cliente.
- Ajuste local al HTML: "Ticket T-1042" → "Folio V-0000"; el PNG conserva el texto viejo de Stitch.
- Los motivos del mockup ("Recepción de proveedor", "Ajuste de inventario físico") son ejemplos; las entradas no llevan motivo obligatorio.
