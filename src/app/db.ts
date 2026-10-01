import { createClient, type Client, type Row } from "@libsql/client";
import { hashPassword } from "@/app/lib/password";
import path from "node:path";

export type Role = "admin" | "cajero";

export type Product = {
  id: number;
  name: string;
  category: string;
  presentation: string | null;
  imageUrl: string | null;
  priceCents: number | null;
  costCents: number | null;
  active: number;
  /** null = sin control de stock (se vende sin límite). */
  stock: number | null;
  stockMin: number | null;
  /** Botellas por caja. null = este producto no se maneja por cajas. */
  unitsPerBox: number | null;
  /** Costo del empaque/canasta, por caja. Solo informational. */
  boxCostCents: number | null;
};

export type SaleItem = {
  productId: number;
  name: string;
  presentation: string | null;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number | null;
  discountCents: number;
  totalCents: number;
};

export type SalePayment = {
  method: PaymentMethod;
  amountCents: number;
  receivedCents: number | null;
  changeCents: number | null;
  reference: string | null;
};

export type Sale = {
  id: number;
  /** Momento real en que se registró. Nunca se modifica. */
  createdAt: string;
  /**
   * Día con el que cuenta la venta (totales y reportes). Empieza siendo el
   * día local de createdAt y solo cambia si alguien la mueve a otro día.
   */
  effectiveDate: string;
  dateMovedAt: string | null;
  dateMovedBy: string | null;
  dateMoveReason: string | null;
  totalCents: number;
  /** "mixto" cuando la venta combinó varios medios de pago. */
  paymentMethod: string;
  receivedCents: number | null;
  changeCents: number | null;
  user: string | null;
  voided: boolean;
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy: string | null;
  cashSessionId: number | null;
  payments: SalePayment[];
  items: SaleItem[];
};

export type CashSession = {
  id: number;
  openedAt: string;
  openedBy: string | null;
  openingCents: number;
  closedAt: string | null;
  closedBy: string | null;
  countedCents: number | null;
  expectedCents: number | null;
  note: string | null;
  salesCount: number;
  salesTotalCents: number;
  cashTotalCents: number;
};

export type StockMovement = {
  id: number;
  productId: number;
  productName: string;
  delta: number;
  reason: string;
  user: string | null;
  at: string;
};

export type AuditEntry = {
  id: number;
  at: string;
  user: string | null;
  action: string;
  detail: string;
};

export type PosUser = {
  id: number;
  username: string;
  role: Role;
  active: number;
  createdAt: string;
};

export const PAYMENT_METHODS = [
  "efectivo",
  "yape",
  "plin",
  "transferencia",
  "tarjeta",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Métodos donde se registra monto recibido y se calcula vuelto. */
const CHANGE_METHODS: ReadonlySet<string> = new Set(["efectivo"]);

/** Métodos digitales donde conviene dejar la referencia de la operación. */
export const REFERENCE_METHODS: ReadonlySet<string> = new Set([
  "yape",
  "plin",
  "transferencia",
]);

export class ValidationError extends Error {}
export class ForbiddenError extends Error {}

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

/**
 * Ancla de un día local como ISO a las 12:00 UTC. Así el día elegido se
 * muestra igual en cualquier huso horario (Perú es UTC-5) y los rangos
 * [inicio del día, fin del día] comparan bien como strings.
 */
export function dayAnchor(date: Date): string {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0),
  ).toISOString();
}

/** Convierte "2026-09-30" (input date) en el ancla de ese día. */
export function dayAnchorFromInput(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) return null;
  return dayAnchor(date);
}

async function backfillSaleDates(client: Client): Promise<void> {
  const pending = await client.execute(
    "SELECT id, created_at FROM sales WHERE effective_date IS NULL",
  );
  for (const row of pending.rows) {
    const created = new Date(String(row.created_at));
    const anchor = Number.isNaN(created.getTime())
      ? String(row.created_at)
      : dayAnchor(created);
    await client.execute({
      sql: "UPDATE sales SET effective_date = ? WHERE id = ?",
      args: [anchor, num(row.id)],
    });
  }
}

async function seedAdminUser(client: Client): Promise<void> {
  const password = process.env.POS_PASSWORD;
  if (!password) return;
  const username = (process.env.POS_USER || "admin").trim();
  const existing = await client.execute({
    sql: "SELECT id FROM users WHERE username = ?",
    args: [username],
  });
  if (existing.rows.length > 0) return;
  const { salt, hash } = hashPassword(password);
  // Sin OR IGNORE: si el INSERT falla queremos que se note, no que se silencie.
  await client.execute({
    sql: "INSERT INTO users (username, salt, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)",
    args: [username, salt, hash, new Date().toISOString()],
  });
}

function ensureSchema(): Promise<void> {
  if (!globalClient.posSchemaReady) {
    const client = getClient();
    const ready = (async () => {
      await client.batch(
        [
          `CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            category TEXT NOT NULL,
            presentation TEXT,
            image_url TEXT,
            price_cents INTEGER CHECK (price_cents IS NULL OR price_cents > 0),
            cost_cents INTEGER CHECK (cost_cents IS NULL OR cost_cents > 0),
            active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
            stock INTEGER CHECK (stock IS NULL OR stock >= 0),
            stock_min INTEGER CHECK (stock_min IS NULL OR stock_min >= 0),
            units_per_box INTEGER CHECK (units_per_box IS NULL OR units_per_box > 0),
            box_cost_cents INTEGER CHECK (box_cost_cents IS NULL OR box_cost_cents > 0)
          )`,
          `CREATE TABLE IF NOT EXISTS cash_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            opened_at TEXT NOT NULL,
            opened_by TEXT,
            opening_cents INTEGER NOT NULL DEFAULT 0 CHECK (opening_cents >= 0),
            closed_at TEXT,
            closed_by TEXT,
            counted_cents INTEGER CHECK (counted_cents IS NULL OR counted_cents >= 0),
            expected_cents INTEGER CHECK (expected_cents IS NULL OR expected_cents >= 0),
            note TEXT
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
            presentation TEXT,
            quantity INTEGER NOT NULL CHECK (quantity > 0),
            unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
            unit_cost_cents INTEGER CHECK (unit_cost_cents IS NULL OR unit_cost_cents > 0),
            total_cents INTEGER NOT NULL CHECK (total_cents > 0)
          )`,
          `CREATE TABLE IF NOT EXISTS sale_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id INTEGER NOT NULL REFERENCES sales(id),
            method TEXT NOT NULL,
            amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
            received_cents INTEGER,
            change_cents INTEGER,
            reference TEXT
          )`,
          `CREATE TABLE IF NOT EXISTS sale_date_moves (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id INTEGER NOT NULL,
            from_date TEXT NOT NULL,
            to_date TEXT NOT NULL,
            reason TEXT NOT NULL,
            user TEXT,
            at TEXT NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS stock_movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            delta INTEGER NOT NULL,
            reason TEXT NOT NULL,
            user TEXT,
            at TEXT NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            at TEXT NOT NULL,
            user TEXT,
            action TEXT NOT NULL,
            detail TEXT NOT NULL DEFAULT ''
          )`,
          `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            salt TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'cajero' CHECK (role IN ('admin', 'cajero')),
            active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
            created_at TEXT NOT NULL
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
        "ALTER TABLE products ADD COLUMN presentation TEXT",
        "ALTER TABLE sale_items ADD COLUMN presentation TEXT",
        "ALTER TABLE products ADD COLUMN image_url TEXT",
        "ALTER TABLE products ADD COLUMN stock INTEGER CHECK (stock IS NULL OR stock >= 0)",
        "ALTER TABLE products ADD COLUMN stock_min INTEGER CHECK (stock_min IS NULL OR stock_min >= 0)",
        "ALTER TABLE products ADD COLUMN units_per_box INTEGER CHECK (units_per_box IS NULL OR units_per_box > 0)",
        "ALTER TABLE products ADD COLUMN box_cost_cents INTEGER CHECK (box_cost_cents IS NULL OR box_cost_cents > 0)",
        "ALTER TABLE sale_items ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0)",
        "ALTER TABLE sales ADD COLUMN user TEXT",
        "ALTER TABLE sales ADD COLUMN voided_at TEXT",
        "ALTER TABLE sales ADD COLUMN void_reason TEXT",
        "ALTER TABLE sales ADD COLUMN voided_by TEXT",
        "ALTER TABLE sales ADD COLUMN cash_session_id INTEGER REFERENCES cash_sessions(id)",
        "ALTER TABLE sales ADD COLUMN effective_date TEXT",
        "ALTER TABLE sales ADD COLUMN date_moved_at TEXT",
        "ALTER TABLE sales ADD COLUMN date_moved_by TEXT",
        "ALTER TABLE sales ADD COLUMN date_move_reason TEXT",
      ]) {
        try {
          await client.execute(sql);
        } catch (error) {
          if (!/duplicate column name/i.test(String(error))) throw error;
        }
      }
      await backfillSaleDates(client);
      await seedAdminUser(client);
    })();
    globalClient.posSchemaReady = ready.catch((error) => {
      // Permite reintentar después de un fallo transitorio (Turso, red, etc).
      globalClient.posSchemaReady = undefined;
      throw error;
    });
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
    presentation:
      row.presentation === null || row.presentation === undefined
        ? null
        : String(row.presentation),
    imageUrl:
      row.imageUrl === null || row.imageUrl === undefined
        ? null
        : String(row.imageUrl),
    priceCents: nullableNum(row.priceCents),
    costCents: nullableNum(row.costCents),
    active: num(row.active),
    stock: nullableNum(row.stock),
    stockMin: nullableNum(row.stockMin),
    unitsPerBox: nullableNum(row.unitsPerBox),
    boxCostCents: nullableNum(row.boxCostCents),
  };
}

type SaleRow = {
  id: number;
  request_id: string;
  created_at: string;
  effective_date: string | null;
  date_moved_at: string | null;
  date_moved_by: string | null;
  date_move_reason: string | null;
  total_cents: number;
  payment_method: string;
  received_cents: number | null;
  change_cents: number | null;
  user: string | null;
  voided_at: string | null;
  void_reason: string | null;
  voided_by: string | null;
  cash_session_id: number | null;
};

type SaleItemRow = {
  sale_id: number;
  product_id: number;
  name: string;
  presentation: string | null;
  quantity: number;
  unit_price_cents: number;
  unit_cost_cents: number | null;
  discount_cents: number;
  total_cents: number;
};

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function toSaleRow(row: Row): SaleRow {
  return {
    id: num(row.id),
    request_id: String(row.request_id),
    created_at: String(row.created_at),
    effective_date:
      row.effective_date === null || row.effective_date === undefined
        ? String(row.created_at)
        : String(row.effective_date),
    date_moved_at: nullableText(row.date_moved_at),
    date_moved_by: nullableText(row.date_moved_by),
    date_move_reason: nullableText(row.date_move_reason),
    total_cents: num(row.total_cents),
    payment_method: String(row.payment_method),
    received_cents: nullableNum(row.received_cents),
    change_cents: nullableNum(row.change_cents),
    user: row.user === null || row.user === undefined ? null : String(row.user),
    voided_at:
      row.voided_at === null || row.voided_at === undefined
        ? null
        : String(row.voided_at),
    void_reason:
      row.void_reason === null || row.void_reason === undefined
        ? null
        : String(row.void_reason),
    voided_by:
      row.voided_by === null || row.voided_by === undefined
        ? null
        : String(row.voided_by),
    cash_session_id: nullableNum(row.cash_session_id),
  };
}

function toSaleItemRow(row: Row): SaleItemRow {
  return {
    sale_id: num(row.sale_id),
    product_id: num(row.product_id),
    name: String(row.name),
    presentation:
      row.presentation === null || row.presentation === undefined
        ? null
        : String(row.presentation),
    quantity: num(row.quantity),
    unit_price_cents: num(row.unit_price_cents),
    unit_cost_cents: nullableNum(row.unit_cost_cents),
    discount_cents: row.discount_cents === null || row.discount_cents === undefined
      ? 0
      : num(row.discount_cents),
    total_cents: num(row.total_cents),
  };
}

function assembleSale(
  row: SaleRow,
  items: SaleItemRow[],
  payments: SalePayment[],
): Sale {
  const cashReceived = payments.some((p) => p.receivedCents !== null)
    ? payments.reduce((sum, p) => sum + (p.receivedCents ?? 0), 0)
    : null;
  const change = payments.some((p) => p.changeCents !== null)
    ? payments.reduce((sum, p) => sum + (p.changeCents ?? 0), 0)
    : null;
  const paymentMethod =
    payments.length === 1 ? payments[0].method : "mixto";
  return {
    id: row.id,
    createdAt: row.created_at,
    effectiveDate: row.effective_date ?? row.created_at,
    dateMovedAt: row.date_moved_at,
    dateMovedBy: row.date_moved_by,
    dateMoveReason: row.date_move_reason,
    totalCents: row.total_cents,
    paymentMethod: payments.length > 0 ? paymentMethod : row.payment_method,
    receivedCents: cashReceived ?? row.received_cents,
    changeCents: change ?? row.change_cents,
    user: row.user,
    voided: row.voided_at !== null,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
    voidedBy: row.voided_by,
    cashSessionId: row.cash_session_id,
    payments,
    items: items.map((item) => ({
      productId: item.product_id,
      name: item.name,
      presentation: item.presentation,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      unitCostCents: item.unit_cost_cents,
      discountCents: item.discount_cents,
      totalCents: item.total_cents,
    })),
  };
}

type Executor = Pick<Client, "execute">;

async function loadPayments(db: Executor, saleId: number): Promise<SalePayment[]> {
  const rs = await db.execute({
    sql: "SELECT method, amount_cents, received_cents, change_cents, reference FROM sale_payments WHERE sale_id = ? ORDER BY id",
    args: [saleId],
  });
  return rs.rows.map((row) => ({
    method: String(row.method) as PaymentMethod,
    amountCents: num(row.amount_cents),
    receivedCents: nullableNum(row.received_cents),
    changeCents: nullableNum(row.change_cents),
    reference:
      row.reference === null || row.reference === undefined
        ? null
        : String(row.reference),
  }));
}

async function loadSale(db: Executor, saleId: number): Promise<Sale> {
  const row = await db.execute({
    sql: "SELECT * FROM sales WHERE id = ?",
    args: [saleId],
  });
  if (row.rows.length === 0) throw new Error("Venta no encontrada tras crearla.");
  const items = await db.execute({
    sql: "SELECT sale_id, product_id, name, presentation, quantity, unit_price_cents, unit_cost_cents, discount_cents, total_cents FROM sale_items WHERE sale_id = ? ORDER BY id",
    args: [saleId],
  });
  const payments = await loadPayments(db, saleId);
  return assembleSale(
    toSaleRow(row.rows[0]),
    items.rows.map(toSaleItemRow),
    payments,
  );
}

type SaleFilter = {
  from?: string;
  to?: string;
  user?: string;
  includeVoided?: boolean;
};

function saleWhere(filter: SaleFilter): { sql: string; args: Array<string | number> } {
  const clauses: string[] = [];
  const args: Array<string | number> = [];
  if (filter.from) {
    clauses.push("COALESCE(effective_date, created_at) >= ?");
    args.push(filter.from);
  }
  if (filter.to) {
    clauses.push("COALESCE(effective_date, created_at) <= ?");
    args.push(filter.to);
  }
  if (filter.user) {
    clauses.push("user = ?");
    args.push(filter.user);
  }
  if (!filter.includeVoided) clauses.push("voided_at IS NULL");
  return { sql: clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "", args };
}

async function attachSales(
  client: Executor,
  saleRows: SaleRow[],
): Promise<Sale[]> {
  if (saleRows.length === 0) return [];
  const ids = saleRows.map((row) => row.id);
  const placeholders = ids.map(() => "?").join(",");
  const itemsRs = await client.execute({
    sql: `SELECT sale_id, product_id, name, presentation, quantity, unit_price_cents, unit_cost_cents, discount_cents, total_cents
          FROM sale_items WHERE sale_id IN (${placeholders}) ORDER BY id`,
    args: ids,
  });
  const paymentsRs = await client.execute({
    sql: `SELECT sale_id, method, amount_cents, received_cents, change_cents, reference
          FROM sale_payments WHERE sale_id IN (${placeholders}) ORDER BY id`,
    args: ids,
  });
  const bySaleItems = new Map<number, SaleItemRow[]>();
  for (const row of itemsRs.rows.map(toSaleItemRow)) {
    const list = bySaleItems.get(row.sale_id) ?? [];
    list.push(row);
    bySaleItems.set(row.sale_id, list);
  }
  const bySalePayments = new Map<number, SalePayment[]>();
  for (const row of paymentsRs.rows) {
    const saleId = num(row.sale_id);
    const list = bySalePayments.get(saleId) ?? [];
    list.push({
      method: String(row.method) as PaymentMethod,
      amountCents: num(row.amount_cents),
      receivedCents: nullableNum(row.received_cents),
      changeCents: nullableNum(row.change_cents),
      reference:
        row.reference === null || row.reference === undefined
          ? null
          : String(row.reference),
    });
    bySalePayments.set(saleId, list);
  }
  return saleRows.map((row) =>
    assembleSale(
      row,
      bySaleItems.get(row.id) ?? [],
      bySalePayments.get(row.id) ?? [],
    ),
  );
}

export async function getProducts(): Promise<Product[]> {
  await ensureSchema();
  const rs = await getClient().execute(
    "SELECT id, name, category, presentation, image_url AS imageUrl, price_cents AS priceCents, cost_cents AS costCents, active, stock, stock_min AS stockMin, units_per_box AS unitsPerBox, box_cost_cents AS boxCostCents FROM products ORDER BY active DESC, id ASC",
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

function checkStock(value: number | null | undefined, label: string) {
  if (value === undefined || value === null) return;
  if (!Number.isInteger(value) || value < 0) {
    throw new ValidationError(`${label} debe ser 0 o mayor.`);
  }
  if (value > 1_000_000) {
    throw new ValidationError(`${label} supera el máximo permitido.`);
  }
}

function checkUnitsPerBox(value: number | null | undefined) {
  if (value === undefined || value === null) return;
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError("Las botellas por caja deben ser mayores a 0.");
  }
  if (value > 1_000) {
    throw new ValidationError("Las botellas por caja superan el máximo permitido.");
  }
}

function checkPresentation(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined || value === null) return value;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 40) {
    throw new ValidationError("La presentación debe tener máximo 40 caracteres.");
  }
  return trimmed;
}

function checkImageUrl(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 500) {
    throw new ValidationError("La URL de la foto es demasiado larga.");
  }
  if (!/^https?:\/\/.+\..+/.test(trimmed)) {
    throw new ValidationError("La foto debe ser una URL válida (http:// o https://).");
  }
  return trimmed;
}

export async function createProduct(input: {
  name: string;
  category: string;
  presentation?: string | null;
  imageUrl?: string | null;
  priceCents?: number | null;
  costCents?: number | null;
  stock?: number | null;
  stockMin?: number | null;
  unitsPerBox?: number | null;
  boxCostCents?: number | null;
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
  checkMoney("costo de la caja", input.boxCostCents);
  checkStock(input.stock, "El stock");
  checkStock(input.stockMin, "El stock mínimo");
  checkUnitsPerBox(input.unitsPerBox);
  const presentation = checkPresentation(input.presentation);
  const imageUrl = checkImageUrl(input.imageUrl);
  await ensureSchema();
  try {
    await getClient().execute({
      sql: "INSERT INTO products (name, category, presentation, image_url, price_cents, cost_cents, stock, stock_min, units_per_box, box_cost_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        name,
        category,
        presentation ?? null,
        imageUrl ?? null,
        input.priceCents ?? null,
        input.costCents ?? null,
        input.stock ?? null,
        input.stockMin ?? null,
        input.unitsPerBox ?? null,
        input.boxCostCents ?? null,
      ],
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
  patch: {
    priceCents?: number | null;
    costCents?: number | null;
    active?: boolean;
    presentation?: string | null;
    imageUrl?: string | null;
    stock?: number | null;
    stockMin?: number | null;
    unitsPerBox?: number | null;
    boxCostCents?: number | null;
  },
): Promise<Product[]> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError("Producto inválido.");
  }
  const {
    priceCents,
    costCents,
    active,
    presentation,
    imageUrl,
    stock,
    stockMin,
    unitsPerBox,
    boxCostCents,
  } = patch;
  if (
    priceCents === undefined &&
    costCents === undefined &&
    active === undefined &&
    presentation === undefined &&
    imageUrl === undefined &&
    stock === undefined &&
    stockMin === undefined &&
    unitsPerBox === undefined &&
    boxCostCents === undefined
  ) {
    throw new ValidationError("Nada que actualizar.");
  }
  checkMoney("precio", priceCents);
  checkMoney("costo", costCents);
  checkMoney("costo de la caja", boxCostCents);
  checkStock(stock, "El stock");
  checkStock(stockMin, "El stock mínimo");
  checkUnitsPerBox(unitsPerBox);
  const cleanPresentation = checkPresentation(presentation);
  const cleanImageUrl = checkImageUrl(imageUrl);
  await ensureSchema();
  const sets: string[] = [];
  const args: Array<number | string | null> = [];
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
  if (presentation !== undefined) {
    sets.push("presentation = ?");
    args.push(cleanPresentation ?? null);
  }
  if (imageUrl !== undefined) {
    sets.push("image_url = ?");
    args.push(cleanImageUrl ?? null);
  }
  if (stock !== undefined) {
    sets.push("stock = ?");
    args.push(stock);
  }
  if (stockMin !== undefined) {
    sets.push("stock_min = ?");
    args.push(stockMin);
  }
  if (unitsPerBox !== undefined) {
    sets.push("units_per_box = ?");
    args.push(unitsPerBox);
  }
  if (boxCostCents !== undefined) {
    sets.push("box_cost_cents = ?");
    args.push(boxCostCents);
  }
  args.push(id);
  const result = await getClient().execute({
    sql: `UPDATE products SET ${sets.join(", ")} WHERE id = ?`,
    args,
  });
  if (result.rowsAffected === 0) {
    throw new ValidationError("Producto no encontrado.");
  }
  if (stock !== undefined) {
    const before = await getClient().execute({
      sql: "SELECT stock FROM products WHERE id = ?",
      args: [id],
    });
    const previous = nullableNum(before.rows[0]?.stock);
    const delta = (stock ?? 0) - (previous ?? 0);
    if (delta !== 0) {
      await recordStockMovement(getClient(), {
        productId: id,
        delta,
        reason: "Ajuste manual de inventario",
        user: null,
      });
    }
  }
  return getProducts();
}

export async function deleteProduct(
  id: number,
  user: string | null,
): Promise<Product[]> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError("Producto inválido.");
  }
  await ensureSchema();
  const used = await getClient().execute({
    sql: "SELECT COUNT(*) AS n FROM sale_items WHERE product_id = ?",
    args: [id],
  });
  if (num(used.rows[0]?.n) > 0) {
    throw new ValidationError(
      "No se puede eliminar: el producto ya aparece en ventas. Ocúltalo en su lugar.",
    );
  }
  const result = await getClient().execute({
    sql: "DELETE FROM products WHERE id = ?",
    args: [id],
  });
  if (result.rowsAffected === 0) {
    throw new ValidationError("Producto no encontrado.");
  }
  await logAudit(user, "producto.eliminado", `#${id}`);
  return getProducts();
}

export async function getSales(filter: SaleFilter = {}): Promise<Sale[]> {
  await ensureSchema();
  const client = getClient();
  const where = saleWhere(filter);
  const rs = await client.execute({
    sql: `SELECT * FROM sales${where.sql} ORDER BY COALESCE(effective_date, created_at) DESC, id DESC LIMIT 500`,
    args: where.args,
  });
  return attachSales(client, rs.rows.map(toSaleRow));
}

/** Ventas sin límite de 500, para reportes por rango de fechas. */
export async function getSalesForReport(filter: SaleFilter = {}): Promise<Sale[]> {
  await ensureSchema();
  const client = getClient();
  const where = saleWhere(filter);
  const rs = await client.execute({
    sql: `SELECT * FROM sales${where.sql} ORDER BY COALESCE(effective_date, created_at) ASC, id ASC`,
    args: where.args,
  });
  return attachSales(client, rs.rows.map(toSaleRow));
}

/**
 * Anula una venta: la marca como anulada, devuelve el stock y deja rastro
 * en la auditoría. No borra el histórico.
 */
export async function voidSale(input: {
  id: number;
  reason: string;
  user: string | null;
}): Promise<Sale[]> {
  const { id, reason, user } = input;
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError("Venta inválida.");
  }
  const clean = reason.trim();
  if (clean.length < 5) {
    throw new ValidationError("Escribe el motivo de la anulación (mínimo 5 caracteres).");
  }
  if (clean.length > 200) {
    throw new ValidationError("El motivo es demasiado largo (máximo 200 caracteres).");
  }
  await ensureSchema();
  const tx = await getClient().transaction("write");
  try {
    const found = await tx.execute({
      sql: "SELECT id, voided_at FROM sales WHERE id = ?",
      args: [id],
    });
    if (found.rows.length === 0) {
      throw new ValidationError("Venta no encontrada.");
    }
    if (found.rows[0].voided_at !== null && found.rows[0].voided_at !== undefined) {
      throw new ValidationError("La venta ya está anulada.");
    }
    await tx.execute({
      sql: "UPDATE sales SET voided_at = ?, void_reason = ?, voided_by = ? WHERE id = ?",
      args: [new Date().toISOString(), clean, user, id],
    });
    // Devuelve el stock de cada línea que sí lo controlaba.
    const items = await tx.execute({
      sql: "SELECT product_id, quantity FROM sale_items WHERE sale_id = ?",
      args: [id],
    });
    for (const row of items.rows) {
      const productId = num(row.product_id);
      const quantity = num(row.quantity);
      const updated = await tx.execute({
        sql: "UPDATE products SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL",
        args: [quantity, productId],
      });
      if (updated.rowsAffected > 0) {
        await tx.execute({
          sql: "INSERT INTO stock_movements (product_id, delta, reason, user, at) VALUES (?, ?, ?, ?, ?)",
          args: [
            productId,
            quantity,
            `Anulación de venta #${id}`,
            user,
            new Date().toISOString(),
          ],
        });
      }
    }
    await tx.execute({
      sql: "INSERT INTO audit_log (at, user, action, detail) VALUES (?, ?, ?, ?)",
      args: [
        new Date().toISOString(),
        user,
        "venta.anulada",
        `Venta #${id}: ${clean}`,
      ],
    });
    await tx.commit();
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // la transacción ya terminó
    }
    throw error;
  }
  return getSales({ includeVoided: true });
}

/**
 * Mueve una venta a otro día. Solo cambia el día con el que cuenta (totales y
 * reportes): el momento real del registro y el turno de caja no se tocan, y
 * queda registrado quién lo hizo, desde qué día y por qué.
 */
export async function moveSaleDate(input: {
  id: number;
  date: string;
  reason: string;
  user: string | null;
}): Promise<Sale[]> {
  const { id, reason, user } = input;
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError("Venta inválida.");
  }
  const reasonClean = reason.trim();
  if (reasonClean.length < 5) {
    throw new ValidationError("Escribe el motivo del cambio de fecha (mínimo 5 caracteres).");
  }
  if (reasonClean.length > 200) {
    throw new ValidationError("El motivo es demasiado largo (máximo 200 caracteres).");
  }
  const anchor = dayAnchorFromInput(input.date);
  if (!anchor) {
    throw new ValidationError("Elige una fecha válida.");
  }
  const today = dayAnchor(new Date());
  if (anchor > today) {
    throw new ValidationError("No se puede mover una venta a un día futuro.");
  }
  const earliest = dayAnchor(new Date(new Date().getFullYear() - 5, 0, 1));
  if (anchor < earliest) {
    throw new ValidationError("Esa fecha es demasiado antigua.");
  }

  await ensureSchema();
  const tx = await getClient().transaction("write");
  try {
    const found = await tx.execute({
      sql: "SELECT id, effective_date, created_at, voided_at FROM sales WHERE id = ?",
      args: [id],
    });
    if (found.rows.length === 0) {
      throw new ValidationError("Venta no encontrada.");
    }
    if (found.rows[0].voided_at) {
      throw new ValidationError("No se puede cambiar la fecha de una venta anulada.");
    }
    const fromDate = String(found.rows[0].effective_date ?? found.rows[0].created_at);
    if (fromDate === anchor) {
      throw new ValidationError("Esa venta ya cuenta para ese día.");
    }
    const now = new Date().toISOString();
    await tx.execute({
      sql: "UPDATE sales SET effective_date = ?, date_moved_at = ?, date_moved_by = ?, date_move_reason = ? WHERE id = ?",
      args: [anchor, now, user, reasonClean, id],
    });
    await tx.execute({
      sql: "INSERT INTO sale_date_moves (sale_id, from_date, to_date, reason, user, at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [id, fromDate, anchor, reasonClean, user, now],
    });
    await tx.execute({
      sql: "INSERT INTO audit_log (at, user, action, detail) VALUES (?, ?, ?, ?)",
      args: [
        now,
        user,
        "venta.fecha_cambiada",
        `Venta #${id} del ${fromDate.slice(0, 10)} al ${anchor.slice(0, 10)}: ${reasonClean}`,
      ],
    });
    await tx.commit();
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // la transacción ya terminó
    }
    throw error;
  }
  return getSales({ includeVoided: true });
}

export type ReceiptLine = {
  productId: number;
  /** Cajas recibidas en esta línea (pueden ser 0 si son unidades sueltas). */
  boxes: number | null;
  /** Botellas por caja de ESTA recepción (puede venir incompleta). */
  unitsPerBox: number | null;
  /** Botellas sueltas, para lo que no viene en caja. */
  looseUnits: number | null;
};

export type ReceiptResult = {
  line: number;
  productId: number;
  name: string;
  boxes: number;
  unitsPerBox: number;
  delta: number;
  stockBefore: number | null;
  stockAfter: number | null;
  note: string;
};

/**
 * Registra la recepción de un pedido. Las líneas pueden venir en cajas
 * (cajas × botellas por caja) o en unidades sueltas, y ambos a la vez.
 * El servidor calcula el total: la UI solo sugiere.
 */
export async function receiveStock(input: {
  lines: ReceiptLine[];
  user: string | null;
  note?: string | null;
}): Promise<{ applied: ReceiptResult[]; products: Product[] }> {
  const { lines, user } = input;
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new ValidationError("Agrega al menos un producto al pedido.");
  }
  if (lines.length > 100) {
    throw new ValidationError("Máximo 100 líneas por recepción.");
  }
  const note = (input.note ?? "").trim();
  if (note.length > 100) {
    throw new ValidationError("La nota del pedido es demasiado larga (máximo 100).");
  }
  for (const line of lines) {
    if (!line || !Number.isInteger(line.productId) || line.productId <= 0) {
      throw new ValidationError("Hay una línea con producto inválido.");
    }
  }

  await ensureSchema();
  const tx = await getClient().transaction("write");
  const applied: ReceiptResult[] = [];
  try {
    for (const line of lines) {
      const found = await tx.execute({
        sql: "SELECT id, name, stock, units_per_box AS unitsPerBox FROM products WHERE id = ?",
        args: [line.productId],
      });
      if (found.rows.length === 0) {
        throw new ValidationError(
          `Producto #${line.productId} no encontrado.`,
        );
      }
      const name = String(found.rows[0].name);
      const stockBefore = nullableNum(found.rows[0].stock);
      if (stockBefore === null) {
        throw new ValidationError(
          `Activa el control de stock de "${name}" antes de recibirlo.`,
        );
      }
      const defaultPerBox = nullableNum(found.rows[0].unitsPerBox);

      const boxes = line.boxes ?? 0;
      const loose = line.looseUnits ?? 0;
      for (const [label, value] of [
        ["cajas", boxes],
        ["botellas sueltas", loose],
      ] as const) {
        if (!Number.isInteger(value) || value < 0) {
          throw new ValidationError(`En "${name}": ${label} debe ser 0 o mayor.`);
        }
        if (value > 10_000) {
          throw new ValidationError(`En "${name}": ${label} es demasiado grande.`);
        }
      }
      // Si no se indica por caja en esta línea, se usa el del producto.
      const perBox =
        line.unitsPerBox === null || line.unitsPerBox === undefined
          ? defaultPerBox
          : line.unitsPerBox;
      if (boxes > 0) {
        if (perBox === null) {
          throw new ValidationError(
            `En "${name}": indica cuántas botellas trae cada caja.`,
          );
        }
        if (!Number.isInteger(perBox) || perBox <= 0) {
          throw new ValidationError(
            `En "${name}": las botellas por caja deben ser mayores a 0.`,
          );
        }
        if (perBox > 1_000) {
          throw new ValidationError(
            `En "${name}": las botellas por caja son demasiadas.`,
          );
        }
      }
      const delta = boxes * (perBox ?? 0) + loose;
      if (delta === 0) continue;

      const updated = await tx.execute({
        sql: "UPDATE products SET stock = stock + ? WHERE id = ?",
        args: [delta, line.productId],
      });
      if (updated.rowsAffected === 0) {
        throw new ValidationError(`No se pudo actualizar el stock de "${name}".`);
      }
      const notes: string[] = [];
      if (boxes > 0) {
        notes.push(
          `Recepción de pedido: ${boxes} ${boxes === 1 ? "caja" : "cajas"} de ${perBox} botellas${note ? ` · ${note}` : ""}`,
        );
      } else {
        notes.push(`Recepción de pedido: ${loose} botellas${note ? ` · ${note}` : ""}`);
      }
      // Una caja vino con menos botellas de lo habitual: queda como nuevo
      // predeterminado para la próxima recepción.
      if (boxes > 0 && perBox !== null && perBox !== defaultPerBox) {
        await tx.execute({
          sql: "UPDATE products SET units_per_box = ? WHERE id = ?",
          args: [perBox, line.productId],
        });
        notes.push(`caja ahora de ${perBox}`);
      }
      await recordStockMovement(tx, {
        productId: line.productId,
        delta,
        reason: notes.join(" · "),
        user,
      });
      applied.push({
        line: applied.length,
        productId: line.productId,
        name,
        boxes,
        unitsPerBox: perBox ?? 0,
        delta,
        stockBefore,
        stockAfter: stockBefore + delta,
        note: note || (delta > 0 ? `${delta} botellas` : `${delta}`),
      });
    }
    if (applied.length === 0) {
      throw new ValidationError("No hay cantidades que ingresar.");
    }
    await tx.execute({
      sql: "INSERT INTO audit_log (at, user, action, detail) VALUES (?, ?, ?, ?)",
      args: [
        new Date().toISOString(),
        user,
        "stock.recibido",
        applied
          .map((r) => `${r.name}: +${r.delta} (${r.note})`)
          .join("; "),
      ],
    });
    await tx.commit();
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // la transacción ya terminó
    }
    throw error;
  }
  return { applied, products: await getProducts() };
}

export async function getStockMovements(limit = 100): Promise<StockMovement[]> {
  await ensureSchema();
  const rs = await getClient().execute({
    sql: `SELECT m.id, m.product_id AS productId, COALESCE(p.name, 'producto #' || m.product_id) AS productName,
                 m.delta, m.reason, m.user, m.at
          FROM stock_movements m LEFT JOIN products p ON p.id = m.product_id
          ORDER BY m.id DESC LIMIT ?`,
    args: [limit],
  });
  return rs.rows.map((row) => ({
    id: num(row.id),
    productId: num(row.productId),
    productName: String(row.productName),
    delta: num(row.delta),
    reason: String(row.reason),
    user: row.user === null || row.user === undefined ? null : String(row.user),
    at: String(row.at),
  }));
}

async function recordStockMovement(
  client: Executor,
  input: {
    productId: number;
    delta: number;
    reason: string;
    user: string | null;
  },
): Promise<void> {
  await client.execute({
    sql: "INSERT INTO stock_movements (product_id, delta, reason, user, at) VALUES (?, ?, ?, ?, ?)",
    args: [
      input.productId,
      input.delta,
      input.reason,
      input.user,
      new Date().toISOString(),
    ],
  });
}

async function logAudit(
  user: string | null,
  action: string,
  detail: string,
): Promise<void> {
  await getClient().execute({
    sql: "INSERT INTO audit_log (at, user, action, detail) VALUES (?, ?, ?, ?)",
    args: [new Date().toISOString(), user, action, detail],
  });
}

export async function getAuditLog(limit = 100): Promise<AuditEntry[]> {
  await ensureSchema();
  const rs = await getClient().execute({
    sql: "SELECT id, at, user, action, detail FROM audit_log ORDER BY id DESC LIMIT ?",
    args: [limit],
  });
  return rs.rows.map((row) => ({
    id: num(row.id),
    at: String(row.at),
    user: row.user === null || row.user === undefined ? null : String(row.user),
    action: String(row.action),
    detail: String(row.detail),
  }));
}

export type SalePaymentInput = {
  method: string;
  amountCents?: number | null;
  receivedCents?: number | null;
  reference?: string | null;
};

export async function createSale(input: {
  requestId: string;
  items: Array<{ productId: number; quantity: number; discountCents?: number }>;
  paymentMethod: string;
  receivedCents: number | null;
  payments?: SalePaymentInput[];
  user?: string | null;
}): Promise<{ sale: Sale; created: boolean }> {
  const { requestId, items, receivedCents } = input;
  const user = input.user ?? null;

  if (typeof requestId !== "string" || requestId.length < 8 || requestId.length > 128) {
    throw new ValidationError("Identificador de venta inválido.");
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw new ValidationError("La venta debe tener entre 1 y 100 líneas.");
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
        sql: "SELECT id, name, presentation, price_cents AS priceCents, cost_cents AS costCents, active, stock FROM products WHERE id = ?",
        args: [item.productId],
      });
      if (found.rows.length === 0) {
        throw new ValidationError(`Producto #${item.productId} no encontrado.`);
      }
      const product = {
        id: num(found.rows[0].id),
        name: String(found.rows[0].name),
        presentation:
          found.rows[0].presentation === null || found.rows[0].presentation === undefined
            ? null
            : String(found.rows[0].presentation),
        priceCents: nullableNum(found.rows[0].priceCents),
        costCents: nullableNum(found.rows[0].costCents),
        active: num(found.rows[0].active),
        stock: nullableNum(found.rows[0].stock),
      };
      if (product.active !== 1) {
        throw new ValidationError(`"${product.name}" está desactivado.`);
      }
      if (product.priceCents === null) {
        throw new ValidationError(`"${product.name}" aún no tiene precio de venta.`);
      }
      const gross = product.priceCents * item.quantity;
      const discount = item.discountCents ?? 0;
      if (
        !Number.isInteger(discount) ||
        discount < 0 ||
        discount > 100_000_000
      ) {
        throw new ValidationError(`El descuento de "${product.name}" no es válido.`);
      }
      if (discount >= gross) {
        throw new ValidationError(
          `El descuento de "${product.name}" no puede ser mayor al total de la línea.`,
        );
      }
      if (product.stock !== null && product.stock < item.quantity) {
        throw new ValidationError(
          `Stock insuficiente de "${product.name}": quedan ${product.stock}.`,
        );
      }
      const lineTotal = gross - discount;
      total += lineTotal;
      lines.push({
        productId: product.id,
        name: product.name,
        presentation: product.presentation,
        quantity: item.quantity,
        unitPriceCents: product.priceCents,
        unitCostCents: product.costCents,
        discountCents: discount,
        totalCents: lineTotal,
      });
    }
    if (total <= 0) throw new ValidationError("El total debe ser mayor a cero.");

    const payments = normalizePayments(
      input.payments && input.payments.length > 0
        ? input.payments
        : [
            {
              method: input.paymentMethod,
              amountCents: total,
              receivedCents,
            },
          ],
      total,
    );

    const session = await tx.execute({
      sql: "SELECT id FROM cash_sessions WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1",
    });
    const cashSessionId =
      session.rows.length > 0 ? num(session.rows[0].id) : null;

    const paymentMethod =
      payments.length === 1 ? payments[0].method : "mixto";
    const cashReceived =
      payments.find((p) => p.receivedCents !== null)?.receivedCents ?? null;
    const totalChange =
      payments.find((p) => p.changeCents !== null)?.changeCents ?? null;

    const createdAt = new Date().toISOString();
    const inserted = await tx.execute({
      sql: "INSERT INTO sales (request_id, created_at, effective_date, total_cents, payment_method, received_cents, change_cents, user, cash_session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        requestId,
        createdAt,
        dayAnchor(new Date(createdAt)),
        total,
        paymentMethod,
        cashReceived,
        totalChange,
        user,
        cashSessionId,
      ],
    });
    const saleId = Number(inserted.lastInsertRowid);
    for (const line of lines) {
      await tx.execute({
        sql: "INSERT INTO sale_items (sale_id, product_id, name, presentation, quantity, unit_price_cents, unit_cost_cents, discount_cents, total_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          saleId,
          line.productId,
          line.name,
          line.presentation,
          line.quantity,
          line.unitPriceCents,
          line.unitCostCents,
          line.discountCents,
          line.totalCents,
        ],
      });
      const stock = await tx.execute({
        sql: "SELECT stock FROM products WHERE id = ?",
        args: [line.productId],
      });
      if (nullableNum(stock.rows[0]?.stock) !== null) {
        await tx.execute({
          sql: "UPDATE products SET stock = stock - ? WHERE id = ?",
          args: [line.quantity, line.productId],
        });
        await recordStockMovement(tx, {
          productId: line.productId,
          delta: -line.quantity,
          reason: `Venta #${saleId}`,
          user,
        });
      }
    }
    for (const payment of payments) {
      await tx.execute({
        sql: "INSERT INTO sale_payments (sale_id, method, amount_cents, received_cents, change_cents, reference) VALUES (?, ?, ?, ?, ?, ?)",
        args: [
          saleId,
          payment.method,
          payment.amountCents,
          payment.receivedCents,
          payment.changeCents,
          payment.reference,
        ],
      });
    }
    await tx.execute({
      sql: "INSERT INTO audit_log (at, user, action, detail) VALUES (?, ?, ?, ?)",
      args: [
        createdAt,
        user,
        "venta.registrada",
        `Venta #${saleId} por S/ ${(total / 100).toFixed(2)} (${paymentMethod})`,
      ],
    });
    const sale = await loadSale(tx, saleId);
    await tx.commit();
    return { sale, created: true };
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // la transacción ya terminó
    }
    throw error;
  }
}

function normalizePayments(
  payments: SalePaymentInput[],
  total: number,
): SalePayment[] {
  if (payments.length > 5) {
    throw new ValidationError("Máximo 5 pagos por venta.");
  }
  const normalized: SalePayment[] = [];
  let sum = 0;
  for (const raw of payments) {
    const method = String(raw.method ?? "");
    if (!PAYMENT_METHODS.includes(method as PaymentMethod)) {
      throw new ValidationError("Método de pago inválido.");
    }
    const amount = raw.amountCents ?? null;
    if (!Number.isInteger(amount) || (amount as number) <= 0) {
      throw new ValidationError("Indica cuánto cubre cada pago.");
    }
    let received: number | null = null;
    let change: number | null = null;
    if (CHANGE_METHODS.has(method)) {
      const given = raw.receivedCents ?? amount;
      if (!Number.isInteger(given) || (given as number) <= 0) {
        throw new ValidationError("Indica el monto recibido en efectivo.");
      }
      if ((given as number) < (amount as number)) {
        throw new ValidationError("El monto recibido es menor al pago asignado.");
      }
      received = given as number;
      change = received - (amount as number);
    }
    let reference: string | null = null;
    if (raw.reference !== undefined && raw.reference !== null) {
      const trimmed = String(raw.reference).trim();
      if (trimmed.length > 0) {
        if (trimmed.length > 40) {
          throw new ValidationError("La referencia del pago es demasiado larga.");
        }
        reference = trimmed;
      }
    }
    sum += amount as number;
    normalized.push({
      method: method as PaymentMethod,
      amountCents: amount as number,
      receivedCents: received,
      changeCents: change,
      reference,
    });
  }
  if (sum !== total) {
    const diff = sum - total;
    if (diff > 0) {
      throw new ValidationError(
        `Los pagos suman S/ ${(sum / 100).toFixed(2)}: sobra S/ ${(diff / 100).toFixed(2)}.`,
      );
    }
    throw new ValidationError(
      `Los pagos suman menos que el total: falta S/ ${((-diff) / 100).toFixed(2)}.`,
    );
  }
  return normalized;
}

async function cashTotals(
  client: Executor,
  sessionIds: number[],
): Promise<Map<number, { cash: number; count: number; total: number }>> {
  const map = new Map<
    number,
    { cash: number; count: number; total: number }
  >();
  if (sessionIds.length === 0) return map;
  const placeholders = sessionIds.map(() => "?").join(",");
  // Dos consultas separadas: un JOIN con sale_payments duplicaría
  // total_cents en las ventas de pago mixto.
  const salesRs = await client.execute({
    sql: `SELECT cash_session_id AS sessionId,
                 COUNT(*) AS salesCount,
                 COALESCE(SUM(total_cents), 0) AS totalCents
          FROM sales
          WHERE cash_session_id IN (${placeholders}) AND voided_at IS NULL
          GROUP BY cash_session_id`,
    args: sessionIds,
  });
  for (const row of salesRs.rows) {
    const id = num(row.sessionId);
    map.set(id, { cash: 0, count: num(row.salesCount), total: num(row.totalCents) });
  }
  const cashRs = await client.execute({
    sql: `SELECT s.cash_session_id AS sessionId,
                 COALESCE(SUM(CASE WHEN p.method = 'efectivo' THEN p.amount_cents ELSE 0 END), 0) AS cashCents
          FROM sales s JOIN sale_payments p ON p.sale_id = s.id
          WHERE s.cash_session_id IN (${placeholders}) AND s.voided_at IS NULL
          GROUP BY s.cash_session_id`,
    args: sessionIds,
  });
  for (const row of cashRs.rows) {
    const id = num(row.sessionId);
    const current = map.get(id) ?? { cash: 0, count: 0, total: 0 };
    map.set(id, { ...current, cash: num(row.cashCents) });
  }
  return map;
}

export async function getCashSessions(): Promise<CashSession[]> {
  await ensureSchema();
  const client = getClient();
  const rs = await client.execute(
    "SELECT * FROM cash_sessions ORDER BY id DESC LIMIT 30",
  );
  const rows = rs.rows.map((row) => ({
    id: num(row.id),
    openedAt: String(row.opened_at),
    openedBy: row.opened_by === null || row.opened_by === undefined ? null : String(row.opened_by),
    openingCents: num(row.opening_cents),
    closedAt:
      row.closed_at === null || row.closed_at === undefined ? null : String(row.closed_at),
    closedBy: row.closed_by === null || row.closed_by === undefined ? null : String(row.closed_by),
    countedCents: nullableNum(row.counted_cents),
    expectedCents: nullableNum(row.expected_cents),
    note: row.note === null || row.note === undefined ? null : String(row.note),
  }));
  const totals = await cashTotals(client, rows.map((row) => row.id));
  return rows.map((row) => {
    const t = totals.get(row.id) ?? { cash: 0, count: 0, total: 0 };
    return {
      ...row,
      salesCount: t.count,
      salesTotalCents: t.total,
      cashTotalCents: row.openingCents + t.cash,
    };
  });
}

export async function getOpenCashSession(): Promise<CashSession | null> {
  const sessions = await getCashSessions();
  return sessions.find((s) => s.closedAt === null) ?? null;
}

export async function openCashSession(input: {
  openingCents: number;
  user: string | null;
}): Promise<CashSession> {
  const opening = input.openingCents;
  if (!Number.isInteger(opening) || opening < 0 || opening > 100_000_000) {
    throw new ValidationError("El monto de apertura debe ser 0 o mayor.");
  }
  await ensureSchema();
  const open = await getOpenCashSession();
  if (open) {
    throw new ValidationError("Ya hay una caja abierta. Ciérrala antes de abrir otra.");
  }
  await getClient().execute({
    sql: "INSERT INTO cash_sessions (opened_at, opened_by, opening_cents) VALUES (?, ?, ?)",
    args: [new Date().toISOString(), input.user, opening],
  });
  await logAudit(input.user, "caja.abierta", `Fondo de caja S/ ${(opening / 100).toFixed(2)}`);
  const session = await getOpenCashSession();
  if (!session) throw new Error("No se pudo abrir la caja.");
  return session;
}

export async function closeCashSession(input: {
  id: number;
  countedCents: number;
  note?: string | null;
  user: string | null;
}): Promise<CashSession[]> {
  const { id, countedCents, user } = input;
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError("Caja inválida.");
  }
  if (!Number.isInteger(countedCents) || countedCents < 0 || countedCents > 100_000_000) {
    throw new ValidationError("El monto contado debe ser 0 o mayor.");
  }
  let note = input.note?.trim() ?? "";
  if (note.length > 200) {
    throw new ValidationError("La nota es demasiado larga (máximo 200 caracteres).");
  }
  await ensureSchema();
  const sessions = await getCashSessions();
  const session = sessions.find((s) => s.id === id);
  if (!session) throw new ValidationError("Caja no encontrada.");
  if (session.closedAt !== null) {
    throw new ValidationError("La caja ya está cerrada.");
  }
  const expected = session.cashTotalCents;
  const diff = countedCents - expected;
  if (note === "" && diff !== 0) {
    note = diff > 0
      ? `Sobrante de S/ ${(diff / 100).toFixed(2)}`
      : `Faltante de S/ ${(-diff / 100).toFixed(2)}`;
  }
  await getClient().execute({
    sql: "UPDATE cash_sessions SET closed_at = ?, closed_by = ?, counted_cents = ?, expected_cents = ?, note = ? WHERE id = ?",
    args: [
      new Date().toISOString(),
      user,
      countedCents,
      expected,
      note === "" ? null : note,
      id,
    ],
  });
  await logAudit(
    user,
    "caja.cerrada",
    `Caja #${id}: contado S/ ${(countedCents / 100).toFixed(2)}, esperado S/ ${(expected / 100).toFixed(2)}`,
  );
  return getCashSessions();
}

export type UserCredentials = {
  username: string;
  salt: string;
  hash: string;
  role: Role;
  active: number;
};

export async function getUserCredentials(
  username: string,
): Promise<UserCredentials | null> {
  await ensureSchema();
  const rs = await getClient().execute({
    sql: "SELECT username, salt, password_hash AS hash, role, active FROM users WHERE username = ?",
    args: [username],
  });
  if (rs.rows.length === 0) return null;
  const row = rs.rows[0];
  return {
    username: String(row.username),
    salt: String(row.salt),
    hash: String(row.hash),
    role: String(row.role) as Role,
    active: num(row.active),
  };
}

export async function getUsers(): Promise<PosUser[]> {
  await ensureSchema();
  const rs = await getClient().execute(
    "SELECT id, username, role, active, created_at AS createdAt FROM users ORDER BY id",
  );
  return rs.rows.map((row) => ({
    id: num(row.id),
    username: String(row.username),
    role: String(row.role) as Role,
    active: num(row.active),
    createdAt: String(row.createdAt),
  }));
}

export async function createUser(input: {
  username: string;
  password: string;
  role: Role;
}): Promise<PosUser[]> {
  const username = input.username.trim();
  if (username.length < 3 || username.length > 40) {
    throw new ValidationError("El usuario debe tener entre 3 y 40 caracteres.");
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    throw new ValidationError("Solo letras, números, punto, guion y guion bajo.");
  }
  if (typeof input.password !== "string" || input.password.length < 4 || input.password.length > 100) {
    throw new ValidationError("La clave debe tener entre 4 y 100 caracteres.");
  }
  if (input.role !== "admin" && input.role !== "cajero") {
    throw new ValidationError("Rol inválido.");
  }
  await ensureSchema();
  const { salt, hash } = hashPassword(input.password);
  try {
    await getClient().execute({
      sql: "INSERT INTO users (username, salt, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [username, salt, hash, input.role, new Date().toISOString()],
    });
  } catch (error) {
    if (/unique constraint/i.test(String(error))) {
      throw new ValidationError(`El usuario "${username}" ya existe.`);
    }
    throw error;
  }
  return getUsers();
}

export async function updateUser(
  id: number,
  patch: { role?: Role; active?: boolean; password?: string },
): Promise<PosUser[]> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError("Usuario inválido.");
  }
  await ensureSchema();
  const users = await getUsers();
  const target = users.find((u) => u.id === id);
  if (!target) throw new ValidationError("Usuario no encontrado.");
  const sets: string[] = [];
  const args: Array<string | number> = [];
  if (patch.role !== undefined) {
    if (patch.role !== "admin" && patch.role !== "cajero") {
      throw new ValidationError("Rol inválido.");
    }
    if (target.role === "admin" && patch.role !== "admin") {
      const admins = users.filter((u) => u.role === "admin" && u.active === 1);
      if (admins.length <= 1) {
        throw new ValidationError("Debe quedar al menos un administrador activo.");
      }
    }
    sets.push("role = ?");
    args.push(patch.role);
  }
  if (patch.active !== undefined) {
    if (target.role === "admin" && !patch.active) {
      const admins = users.filter((u) => u.role === "admin" && u.active === 1);
      if (admins.length <= 1) {
        throw new ValidationError("No puedes desactivar al único administrador.");
      }
    }
    sets.push("active = ?");
    args.push(patch.active ? 1 : 0);
  }
  if (patch.password !== undefined && patch.password !== "") {
    if (patch.password.length < 4 || patch.password.length > 100) {
      throw new ValidationError("La clave debe tener entre 4 y 100 caracteres.");
    }
    const { salt, hash } = hashPassword(patch.password);
    sets.push("salt = ?", "password_hash = ?");
    args.push(salt, hash);
  }
  if (sets.length === 0) throw new ValidationError("Nada que actualizar.");
  args.push(id);
  const result = await getClient().execute({
    sql: `UPDATE users SET ${sets.join(", ")} WHERE id = ?`,
    args,
  });
  if (result.rowsAffected === 0) {
    throw new ValidationError("Usuario no encontrado.");
  }
  return getUsers();
}
