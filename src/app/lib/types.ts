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
  stock: number | null;
  stockMin: number | null;
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

export const PAYMENT_METHODS = [
  "efectivo",
  "yape",
  "plin",
  "transferencia",
  "tarjeta",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type SalePayment = {
  method: PaymentMethod;
  amountCents: number;
  receivedCents: number | null;
  changeCents: number | null;
  reference: string | null;
};

export type Sale = {
  id: number;
  createdAt: string;
  totalCents: number;
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

export type PosUser = {
  id: number;
  username: string;
  role: Role;
  active: number;
  createdAt: string;
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

export type View =
  | "ventas"
  | "catalogo"
  | "inventario"
  | "historial"
  | "caja"
  | "admin";

/** Línea del carrito: cantidad y descuento en soles (céntimos). */
export type CartLine = {
  qty: number;
  discountCents: number;
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
};

/** Métodos donde se registra monto recibido y se calcula vuelto. */
export const CHANGE_METHODS: ReadonlySet<PaymentMethod> = new Set(["efectivo"]);

/** Medios digitales donde conviene anotar la referencia de la operación. */
export const REFERENCE_METHODS: ReadonlySet<PaymentMethod> = new Set([
  "yape",
  "plin",
  "transferencia",
]);

const pen = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

export function formatPEN(cents: number): string {
  return pen.format(cents / 100);
}

export function parseSolesToCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(parseFloat(normalized) * 100);
  return cents > 0 ? cents : null;
}

/** Acepta 0 como valor válido (descuentos, stock, montos contados). */
export function parseSolesToCentsOrZero(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(parseFloat(normalized) * 100);
}

export function parseCount(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,7}$/.test(trimmed)) return null;
  return Number(trimmed);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function displayName(item: {
  name: string;
  presentation: string | null;
}): string {
  return item.presentation ? `${item.name} (${item.presentation})` : item.name;
}

export function lineProfit(item: SaleItem): number | null {
  if (item.unitCostCents === null) return null;
  return (item.unitPriceCents - item.unitCostCents) * item.quantity - item.discountCents;
}

export function saleProfit(sale: Sale): number | null {
  let total = 0;
  let known = false;
  for (const item of sale.items) {
    const profit = lineProfit(item);
    if (profit !== null) {
      total += profit;
      known = true;
    }
  }
  return known ? total : null;
}

export function paymentLabel(value: string): string {
  if (value === "mixto") return "Pago mixto";
  const found = PAYMENT_METHODS.find((m) => m === value);
  return found ? PAYMENT_LABELS[found] : value;
}

/** Fecha límite inclusiva para un input type="date" (fin del día en hora local). */
export function endOfDayIso(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, (d ?? 1), 23, 59, 59, 999).toISOString();
}

export function startOfDayIso(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, (d ?? 1), 0, 0, 0, 0).toISOString();
}

export function toLocalDateInput(date: Date): string {
  return [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join("-");
}
