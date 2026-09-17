import { createClient, type Client, type Row } from "@libsql/client";
import path from "node:path";

export type Product = {
  id: number;
  name: string;
  category: string;
  priceCents: number | null;
  costCents: number | null;
  active: number;
};

export type SaleItem = {
  productId: number;
  name: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number | null;
  totalCents: number;
};

export type Sale = {
  id: number;
  createdAt: string;
  totalCents: number;
  paymentMethod: string;
  receivedCents: number | null;
  changeCents: number | null;
  items: SaleItem[];
};

export const PAYMENT_METHODS = ["efectivo", "tarjeta", "yape", "cheque"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Métodos donde se registra monto recibido y se calcula vuelto.
const CHANGE_METHODS: ReadonlySet<string> = new Set(["efectivo", "cheque"]);

export class ValidationError extends Error {}

const catalog: Array<[string, string]> = [
  ["Vinos Jose Santos", "Vino emblema"],
  ["Malbec fermentado en tinaja", "Línea patrimonial"],
  ["Mollar fermentado en tinaja", "Línea patrimonial"],
  ["Negra Criolla fermentado en tinaja", "Línea patrimonial"],
  ["Quebranta fermentado en tinaja", "Línea patrimonial"],
  ["Semi Seco Rosé", "Semisecos"],
  ["Semi Seco Tinto", "Semisecos"],
  ["Semi Seco Blanco", "Semisecos"],
  ["Semi Seco Borgoña", "Semisecos"],
  ["Pisco Acholado", "Piscos clásicos"],
  ["Pisco Italia", "Piscos clásicos"],
  ["Pisco Quebranta", "Piscos clásicos"],
  ["Pisco Machu Picchu Acholado", "Piscos Machu Picchu"],
  ["Pisco Machu Picchu Italia", "Piscos Machu Picchu"],
  ["Pisco Machu Picchu Quebranta", "Piscos Machu Picchu"],
];

const globalClient = globalThis as typeof globalThis & {
  posClient?: Client;
  posSchemaReady?: Promise<void>;
};

function getClient(): Client {
  if (globalClient.posClient) return globalClient.posClient;

  // En Vercel: TURSO_DATABASE_URL + TURSO_AUTH_TOKEN. En local: archivo SQLite.
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const client = tursoUrl
    ? createClient({ url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN })
    : createClient({
        url: `file:${process.env.POS_DATABASE_PATH ?? path.join(process.cwd(), "pos.sqlite")}`,
      });
  globalClient.posClient = client;
  return client;
}

function ensureSchema(): Promise<void> {
  if (!globalClient.posSchemaReady) {
    const client = getClient();
    globalClient.posSchemaReady = (async () => {
      await client.batch(
        [
          `CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            category TEXT NOT NULL,
            price_cents INTEGER CHECK (price_cents IS NULL OR price_cents > 0),
            cost_cents INTEGER CHECK (cost_cents IS NULL OR cost_cents > 0),
            active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
          )`,
          `CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            total_cents INTEGER NOT NULL CHECK (total_cents > 0),
            payment_method TEXT NOT NULL,
            received_cents INTEGER,
            change_cents INTEGER
          )`,
          `CREATE TABLE IF NOT EXISTS sale_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id INTEGER NOT NULL REFERENCES sales(id),
            product_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            quantity INTEGER NOT NULL CHECK (quantity > 0),
            unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
            unit_cost_cents INTEGER CHECK (unit_cost_cents IS NULL OR unit_cost_cents > 0),
            total_cents INTEGER NOT NULL CHECK (total_cents > 0)
          )`,
          ...catalog.map((item) => ({
            sql: "INSERT OR IGNORE INTO products (name, category) VALUES (?, ?)",
            args: [item[0], item[1]],
          })),
        ],
        "write",
      );
      // Migración para BDs creadas antes de estas columnas.
      for (const sql of [
        "ALTER TABLE products ADD COLUMN cost_cents INTEGER CHECK (cost_cents IS NULL OR cost_cents > 0)",
        "ALTER TABLE sale_items ADD COLUMN unit_cost_cents INTEGER CHECK (unit_cost_cents IS NULL OR unit_cost_cents > 0)",
        "ALTER TABLE products ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))",
      ]) {
        try {
          await client.execute(sql);
        } catch (error) {
          if (!/duplicate column name/i.test(String(error))) throw error;
        }
      }
    })();
  }
  return globalClient.posSchemaReady;
}

function num(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : (value as number);
}

function nullableNum(value: unknown): number | null {
  return value === null || value === undefined ? null : num(value);
}

function toProduct(row: Row): Product {
  return {
    id: num(row.id),
    name: String(row.name),
    category: String(row.category),
    priceCents: nullableNum(row.priceCents),
    costCents: nullableNum(row.costCents),
    active: num(row.active),
  };
}

type SaleRow = {
  id: number;
  request_id: string;
  created_at: string;
  total_cents: number;
  payment_method: string;
  received_cents: number | null;
  change_cents: number | null;
};

type SaleItemRow = {
  sale_id: number;
  product_id: number;
  name: string;
  quantity: number;
  unit_price_cents: number;
  unit_cost_cents: number | null;
  total_cents: number;
};

function toSaleRow(row: Row): SaleRow {
  return {
    id: num(row.id),
    request_id: String(row.request_id),
    created_at: String(row.created_at),
    total_cents: num(row.total_cents),
    payment_method: String(row.payment_method),
    received_cents: nullableNum(row.received_cents),
    change_cents: nullableNum(row.change_cents),
  };
}

function toSaleItemRow(row: Row): SaleItemRow {
  return {
    sale_id: num(row.sale_id),
    product_id: num(row.product_id),
    name: String(row.name),
    quantity: num(row.quantity),
    unit_price_cents: num(row.unit_price_cents),
    unit_cost_cents: nullableNum(row.unit_cost_cents),
    total_cents: num(row.total_cents),
  };
}

function assembleSale(row: SaleRow, items: SaleItemRow[]): Sale {
  return {
    id: row.id,
    createdAt: row.created_at,
    totalCents: row.total_cents,
    paymentMethod: row.payment_method,
    receivedCents: row.received_cents,
    changeCents: row.change_cents,
    items: items.map((item) => ({
      productId: item.product_id,
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      unitCostCents: item.unit_cost_cents,
      totalCents: item.total_cents,
    })),
  };
}

type Executor = Pick<Client, "execute">;

async function loadSale(db: Executor, saleId: number): Promise<Sale> {
  const row = await db.execute({
    sql: "SELECT * FROM sales WHERE id = ?",
    args: [saleId],
  });
  if (row.rows.length === 0) throw new Error("Venta no encontrada tras crearla.");
  const items = await db.execute({
    sql: "SELECT sale_id, product_id, name, quantity, unit_price_cents, unit_cost_cents, total_cents FROM sale_items WHERE sale_id = ? ORDER BY id",
    args: [saleId],
  });
  return assembleSale(toSaleRow(row.rows[0]), items.rows.map(toSaleItemRow));
}

export async function getProducts(): Promise<Product[]> {
  await ensureSchema();
  const rs = await getClient().execute(
    "SELECT id, name, category, price_cents AS priceCents, cost_cents AS costCents, active FROM products ORDER BY id",
  );
  return rs.rows.map(toProduct);
}

function checkMoney(label: string, value: number | null | undefined) {
  if (value === undefined || value === null) return;
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`El ${label} debe ser mayor a S/ 0.00.`);
  }
  if (value > 100_000_000) {
    throw new ValidationError(`El ${label} supera el máximo permitido.`);
  }
}

export async function createProduct(input: {
  name: string;
  category: string;
  priceCents?: number | null;
  costCents?: number | null;
}): Promise<Product[]> {
  const name = input.name.trim();
  const category = input.category.trim();
  if (name.length === 0 || name.length > 120) {
    throw new ValidationError("El nombre debe tener entre 1 y 120 caracteres.");
  }
  if (category.length === 0 || category.length > 60) {
    throw new ValidationError("La categoría debe tener entre 1 y 60 caracteres.");
  }
  checkMoney("precio", input.priceCents);
  checkMoney("costo", input.costCents);
  await ensureSchema();
  try {
    await getClient().execute({
      sql: "INSERT INTO products (name, category, price_cents, cost_cents) VALUES (?, ?, ?, ?)",
      args: [name, category, input.priceCents ?? null, input.costCents ?? null],
    });
  } catch (error) {
    if (/unique constraint/i.test(String(error))) {
      throw new ValidationError(`Ya existe un producto llamado "${name}".`);
    }
    throw error;
  }
  return getProducts();
}

export async function updateProduct(
  id: number,
  patch: { priceCents?: number | null; costCents?: number | null; active?: boolean },
): Promise<Product[]> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError("Producto inválido.");
  }
  const { priceCents, costCents, active } = patch;
  if (priceCents === undefined && costCents === undefined && active === undefined) {
    throw new ValidationError("Nada que actualizar.");
  }
  checkMoney("precio", priceCents);
  checkMoney("costo", costCents);
  await ensureSchema();
  const sets: string[] = [];
  const args: Array<number | null> = [];
  if (priceCents !== undefined) {
    sets.push("price_cents = ?");
    args.push(priceCents);
  }
  if (costCents !== undefined) {
    sets.push("cost_cents = ?");
    args.push(costCents);
  }
  if (active !== undefined) {
    sets.push("active = ?");
    args.push(active ? 1 : 0);
  }
  args.push(id);
  const result = await getClient().execute({
    sql: `UPDATE products SET ${sets.join(", ")} WHERE id = ?`,
    args,
  });
  if (result.rowsAffected === 0) {
    throw new ValidationError("Producto no encontrado.");
  }
  return getProducts();
}

export async function getSales(): Promise<Sale[]> {
  await ensureSchema();
  const client = getClient();
  const salesRs = await client.execute(
    "SELECT * FROM sales ORDER BY id DESC LIMIT 500",
  );
  const saleRows = salesRs.rows.map(toSaleRow);
  if (saleRows.length === 0) return [];
  const ids = saleRows.map((row) => row.id);
  const itemsRs = await client.execute({
    sql: `SELECT sale_id, product_id, name, quantity, unit_price_cents, unit_cost_cents, total_cents
          FROM sale_items WHERE sale_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`,
    args: ids,
  });
  const bySale = new Map<number, SaleItemRow[]>();
  for (const row of itemsRs.rows.map(toSaleItemRow)) {
    const list = bySale.get(row.sale_id) ?? [];
    list.push(row);
    bySale.set(row.sale_id, list);
  }
  return saleRows.map((row) => assembleSale(row, bySale.get(row.id) ?? []));
}

export async function createSale(input: {
  requestId: string;
  items: Array<{ productId: number; quantity: number }>;
  paymentMethod: string;
  receivedCents: number | null;
}): Promise<{ sale: Sale; created: boolean }> {
  const { requestId, items, paymentMethod, receivedCents } = input;

  if (typeof requestId !== "string" || requestId.length < 8 || requestId.length > 128) {
    throw new ValidationError("Identificador de venta inválido.");
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw new ValidationError("La venta debe tener entre 1 y 100 líneas.");
  }
  if (!PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)) {
    throw new ValidationError("Método de pago inválido.");
  }
  for (const item of items) {
    if (
      !item ||
      !Number.isInteger(item.productId) ||
      item.productId <= 0 ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > 999
    ) {
      throw new ValidationError("Hay una línea con producto o cantidad inválida.");
    }
  }

  await ensureSchema();
  const tx = await getClient().transaction("write");
  try {
    const existing = await tx.execute({
      sql: "SELECT id FROM sales WHERE request_id = ?",
      args: [requestId],
    });
    if (existing.rows.length > 0) {
      const sale = await loadSale(tx, num(existing.rows[0].id));
      await tx.commit();
      return { sale, created: false };
    }

    const lines: SaleItem[] = [];
    let total = 0;
    for (const item of items) {
      const found = await tx.execute({
        sql: "SELECT id, name, price_cents AS priceCents, cost_cents AS costCents, active FROM products WHERE id = ?",
        args: [item.productId],
      });
      if (found.rows.length === 0) {
        throw new ValidationError(`Producto #${item.productId} no encontrado.`);
      }
      const product = {
        id: num(found.rows[0].id),
        name: String(found.rows[0].name),
        priceCents: nullableNum(found.rows[0].priceCents),
        costCents: nullableNum(found.rows[0].costCents),
        active: num(found.rows[0].active),
      };
      if (product.active !== 1) {
        throw new ValidationError(`"${product.name}" está desactivado.`);
      }
      if (product.priceCents === null) {
        throw new ValidationError(`"${product.name}" aún no tiene precio de venta.`);
      }
      const lineTotal = product.priceCents * item.quantity;
      total += lineTotal;
      lines.push({
        productId: product.id,
        name: product.name,
        quantity: item.quantity,
        unitPriceCents: product.priceCents,
        unitCostCents: product.costCents,
        totalCents: lineTotal,
      });
    }
    if (total <= 0) throw new ValidationError("El total debe ser mayor a cero.");

    let received: number | null = null;
    let change: number | null = null;
    if (CHANGE_METHODS.has(paymentMethod)) {
      if (!Number.isInteger(receivedCents) || (receivedCents as number) <= 0) {
        throw new ValidationError("Indica el monto recibido.");
      }
      if ((receivedCents as number) < total) {
        throw new ValidationError("El monto recibido es menor al total.");
      }
      received = receivedCents;
      change = (receivedCents as number) - total;
    }

    const createdAt = new Date().toISOString();
    const inserted = await tx.execute({
      sql: "INSERT INTO sales (request_id, created_at, total_cents, payment_method, received_cents, change_cents) VALUES (?, ?, ?, ?, ?, ?)",
      args: [requestId, createdAt, total, paymentMethod, received, change],
    });
    const saleId = Number(inserted.lastInsertRowid);
    for (const line of lines) {
      await tx.execute({
        sql: "INSERT INTO sale_items (sale_id, product_id, name, quantity, unit_price_cents, unit_cost_cents, total_cents) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [
          saleId,
          line.productId,
          line.name,
          line.quantity,
          line.unitPriceCents,
          line.unitCostCents,
          line.totalCents,
        ],
      });
    }
    const sale = await loadSale(tx, saleId);
    await tx.commit();
    return { sale, created: true };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}
