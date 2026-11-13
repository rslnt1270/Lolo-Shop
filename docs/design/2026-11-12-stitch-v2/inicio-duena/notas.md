# Inicio — dueña (móvil 390 px)

Stitch: `8e07d7073a29480a905b1ec38e3dd5bc`.

## Componentes
- "Hola, Dueña ejemplo" 32 px 800 · chip "Dueña · Todas las tiendas".
- Dos mosaicos primarios 112 px, radio 16, relleno `turquesa`, icono y texto tinta: "Vender" ("Caja y cobro rápido") y "Escanear" ("Alta o sumar piezas").
- Tres mosaicos contorno 64 px: "Productos", "Etiquetas", "Ventas".
- Tarjetas `niebla` radio 16: "Hoy" ("$000 vendido", "0 ventas", "Ver ventas ›"); "Por publicar" (contador 3, "3 prendas con stock aún no están en el sitio web", contorno "Revisar"); "Tiendas" ("Tienda ejemplo (Tienda)", "Almacén ejemplo (Almacén)", "000 piezas", "+ Tienda"); "Poco stock" ("Quedan 1" en `agotado`).

## Desviaciones (manda el spec)
- Saludo y texto de mosaicos usan `text-primary` (#006A6A) y `on-primary-container` (#004343): sustituir por `turquesa-titular` (saludo ≥ 28 px) y tinta (mosaicos).
- Contornos usan `secondary` (#006A6A): usar `turquesa-texto` #0C7C7C.
- "Poco stock" usa `tertiary` (#A03F32): usar `agotado` #9A3B2E.
- Barra de estado falsa "09:41" con señal/batería: no implementar.
- "Revisar" y "+ Tienda" miden < 44 px: subir.
- Subtítulo "Caja y cobro rápido": inventado; aceptable o quitar.
- "Playera ejemplo · L": la app usa tallas CH/M/G; usar "G".
