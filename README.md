# El Arbolito · Punto de venta

POS para distribuidor independiente de vinos y piscos **Hacienda del Abuelo**
(Valle de Vítor, Arequipa). No es tienda oficial de la bodega.

Next.js (App Router) + SQLite vía `@libsql/client`:

- **Local**: usa `pos.sqlite` (se crea solo al arrancar).
- **Vercel**: usa Turso con `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`.

## Uso local

```bash
npm install
npm run dev
```

Abrir <http://127.0.0.1:3000>. Los precios empiezan pendientes:
pestaña **Catálogo** → registra tus precios de reventa en soles.

## Despliegue en Vercel + Turso

1. Crea la BD (gratis) en <https://turso.tech> o con su CLI:
   `turso db create lacava && turso db show lacava --url` y
   `turso db tokens create lacava`.
2. En Vercel → proyecto → Settings → Environment Variables:
   - `TURSO_DATABASE_URL` = URL (`libsql://...`)
   - `TURSO_AUTH_TOKEN` = token
3. Deploy. El esquema y el catálogo se crean solos al primer arranque.

## Variables de entorno

| Variable       | Para qué sirve                                              |
| -------------- | ----------------------------------------------------------- |
| `POS_USER`     | Usuario administrador inicial (por defecto `admin`)         |
| `POS_PASSWORD` | Clave del administrador. **Si no está, el POS queda abierto** |
| `POS_SECRET`   | Clave para firmar la sesión (si no, se usa `POS_PASSWORD`)  |

Al primer arranque se crea en la tabla `users` un administrador con
`POS_USER` / `POS_PASSWORD`. Después puedes crear cajeros desde la
pestaña **Admin**.

## Pestañas

- **Ventas**: punto de venta. Busca por nombre o categoría, agrega al carrito
  con un toque y cobra. El carrito **se guarda en el dispositivo**: si recargas
  o se te cierra la página, no pierdes la venta.
- **Catálogo**: crea productos y anota costo, precio, presentación, foto,
  stock y stock mínimo. Oculta lo que ya no vendas y elimina lo que nunca se
  vendió.
- **Stock**: inventario. Deja el stock vacío si el producto no lleva control
  (se vende sin límite); ponle un mínimo para que te avise cuando esté por
  agotarse.
- **Historial**: ventas del periodo con ganancia, anulación y reporte CSV.
- **Caja**: abre el turno con el fondo de caja y ciérralo contando el
  efectivo. Te dice si sobra o falta.
- **Admin** (solo admin): usuarios, movimientos de stock y auditoría.

## Reglas del negocio

- El ticket es **comprobante interno, no válido como comprobante fiscal**.
- **Medios de pago**: efectivo (registra monto recibido y calcula el vuelto),
  yape, plin, transferencia y tarjeta. Se puede **dividir una venta en varios
  medios**; en los digitales queda la referencia de la operación.
- **Descuentos por línea** en el carrito; el servidor los valida.
- Las ventas son **idempotentes por `requestId`**: reintentar no duplica.
- Cada venta guarda el **costo del momento**, así la ganancia histórica no
  cambia si editas el costo después.
- **Anular** una venta exige un motivo: queda marcada como anulada (no se
  borra), sale de los totales y **devuelve el stock**.
- El servidor **rechaza** vender más del stock disponible.

## Roles

- **Administrador**: ve costos y ganancias, edita catálogo y stock, anula
  ventas, gestiona usuarios y exporta el inventario.
- **Cajero**: registra ventas y cobra. No ve costos ni ganancias, no edita el
  catálogo y no puede anular. El servidor le oculta `costCents` incluso en la
  API.

No se puede desactivar ni degradar al último administrador activo.

## Notas técnicas

- **Sesión**: cookie `httpOnly` con HMAC-SHA256 (WebCrypto) que lleva usuario y
  rol, válida 7 días. Los passwords se guardan con **scrypt + salt** en la
  tabla `users`. Las sesiones no se pueden revocar de forma individual (no hay
  lista de revocación): para expulsar a alguien, cámbiala la clave o desactiva
  su usuario.
- **Auditoría**: toda venta, anulación, ajuste de stock y movimiento de caja
  queda en `audit_log` con usuario y fecha.
- **Migraciones**: las columnas nuevas se agregan solas al arrancar
  (`ALTER TABLE` idempotente), por eso no hay que tocar la BD a mano.
- El carrito persiste en `localStorage`; la app tiene `manifest.webmanifest`
  para instalarse como PWA, aunque **todavía no funciona sin conexión** (las
  ventas requieren servidor).

## Lo que no tiene

- Comprobante fiscal (SUNAT) ni impresora térmica ESC/POS: el ticket se
  imprime con `window.print()`.
- Clientes, fiado/cuenta corriente, proveedores o compras.
- Venta sin conexión (modo offline real).
- Códigos de barras.
