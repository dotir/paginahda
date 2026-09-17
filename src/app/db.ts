import Database from "better-sqlite3";
import path from "node:path";

export type Product = {
  id: number;
  name: string;
  category: string;
  priceCents: number | null;
};

export type SaleItem = {
  productId: number;
  name: string;
  quantity: number;
  unitPriceCents: number;
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

const globalDb = globalThis as typeof globalThis & {
  posDatabase?: Database.Database;
};

function getDatabase() {
  if (globalDb.posDatabase) return globalDb.posDatabase;

  const db = new Database(
    process.env.POS_DATABASE_PATH ?? path.join(process.cwd(), "pos.sqlite"),
  );
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      price_cents INTEGER CHECK (price_cents IS NULL OR price_cents > 0)
    );
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      total_cents INTEGER NOT NULL CHECK (total_cents > 0),
      payment_method TEXT NOT NULL,
      received_cents INTEGER,
      change_cents INTEGER
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
      total_cents INTEGER NOT NULL CHECK (total_cents > 0)
    );
  `);

  const insert = db.prepare(
    "INSERT OR IGNORE INTO products (name, category) VALUES (?, ?)",
  );
  db.transaction(() => {
    for (const [name, category] of catalog) insert.run(name, category);
  })();

  globalDb.posDatabase = db;
  return db;
}

export function getProducts(): Product[] {
  return getDatabase()
    .prepare(
      "SELECT id, name, category, price_cents AS priceCents FROM products ORDER BY id",
    )
    .all() as Product[];
}

export function updateProductPrice(id: number, priceCents: number): Product[] {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError("Producto inválido.");
  }
  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    throw new ValidationError("El precio debe ser mayor a S/ 0.00.");
  }
  if (priceCents > 100_000_000) {
    throw new ValidationError("El precio supera el máximo permitido.");
  }
  const result = getDatabase()
    .prepare("UPDATE products SET price_cents = ? WHERE id = ?")
    .run(priceCents, id);
  if (result.changes === 0) {
    throw new ValidationError("Producto no encontrado.");
  }
  return getProducts();
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
  product_id: number;
  name: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
};

function toSale(row: SaleRow, items: SaleItemRow[]): Sale {
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
      totalCents: item.total_cents,
    })),
  };
}

function loadSale(db: Database.Database, saleId: number): Sale {
  const row = db.prepare("SELECT * FROM sales WHERE id = ?").get(saleId) as
    | SaleRow
    | undefined;
  if (!row) throw new Error("Venta no encontrada tras crearla.");
  const items = db
    .prepare(
      "SELECT product_id, name, quantity, unit_price_cents, total_cents FROM sale_items WHERE sale_id = ? ORDER BY id",
    )
    .all(saleId) as SaleItemRow[];
  return toSale(row, items);
}

export function getSales(): Sale[] {
  const db = getDatabase();
  const rows = db
    .prepare("SELECT * FROM sales ORDER BY id DESC LIMIT 500")
    .all() as SaleRow[];
  const itemsStmt = db.prepare(
    "SELECT product_id, name, quantity, unit_price_cents, total_cents FROM sale_items WHERE sale_id = ? ORDER BY id",
  );
  return rows.map((row) =>
    toSale(row, itemsStmt.all(row.id) as SaleItemRow[]),
  );
}

export function createSale(input: {
  requestId: string;
  items: Array<{ productId: number; quantity: number }>;
  paymentMethod: string;
  receivedCents: number | null;
}): { sale: Sale; created: boolean } {
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

  const db = getDatabase();
  return db.transaction(() => {
    const existing = db
      .prepare("SELECT id FROM sales WHERE request_id = ?")
      .get(requestId) as { id: number } | undefined;
    if (existing) {
      return { sale: loadSale(db, existing.id), created: false };
    }

    const productStmt = db.prepare(
      "SELECT id, name, price_cents AS priceCents FROM products WHERE id = ?",
    );
    const lines: SaleItem[] = [];
    let total = 0;
    for (const item of items) {
      const product = productStmt.get(item.productId) as
        | { id: number; name: string; priceCents: number | null }
        | undefined;
      if (!product) {
        throw new ValidationError(`Producto #${item.productId} no encontrado.`);
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
    const saleId = (
      db
        .prepare(
          "INSERT INTO sales (request_id, created_at, total_cents, payment_method, received_cents, change_cents) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(requestId, createdAt, total, paymentMethod, received, change)
        .lastInsertRowid as number
    );
    const itemStmt = db.prepare(
      "INSERT INTO sale_items (sale_id, product_id, name, quantity, unit_price_cents, total_cents) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const line of lines) {
      itemStmt.run(
        saleId,
        line.productId,
        line.name,
        line.quantity,
        line.unitPriceCents,
        line.totalCents,
      );
    }
    return { sale: loadSale(db, saleId), created: true };
  })();
}
