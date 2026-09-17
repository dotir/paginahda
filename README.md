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

## Notas

- El ticket es **comprobante interno, no válido como comprobante fiscal**.
- Métodos de pago: efectivo, tarjeta, yape y cheque. Efectivo y cheque
  registran monto recibido y vuelto (calculado en el servidor).
- Las ventas son idempotentes por `requestId`: reintentar no duplica.
