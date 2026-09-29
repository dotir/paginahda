import {
  PAYMENT_METHODS,
  REFERENCE_METHODS,
  type PaymentMethod,
  type Role,
} from "@/app/lib/types";

export {
  CHANGE_METHODS,
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  REFERENCE_METHODS,
  displayName,
  endOfDayIso,
  formatDate,
  formatDay,
  formatPEN,
  lineProfit,
  parseCount,
  parseSolesToCents,
  parseSolesToCentsOrZero,
  paymentLabel,
  saleProfit,
  startOfDayIso,
  toLocalDateInput,
} from "@/app/lib/types";
export type {
  AuditEntry,
  CashSession,
  CartLine,
  PaymentMethod,
  PosUser,
  Product,
  Role,
  Sale,
  SaleItem,
  SalePayment,
  StockMovement,
  View,
} from "@/app/lib/types";

/** Etiqueta del campo de referencia según el medio de pago. */
export function referenceMethodLabel(method: PaymentMethod): string {
  if (method === "yape" || method === "plin") return "N° operación";
  return "Referencia";
}

export function roleLabel(role: Role | null): string {
  if (role === "admin") return "Administrador";
  if (role === "cajero") return "Cajero";
  return "Sin sesión";
}

export function paymentIconName(method: PaymentMethod): string {
  if (method === "efectivo") return "banknote";
  if (method === "tarjeta") return "credit-card";
  if (REFERENCE_METHODS.has(method)) return "smartphone";
  return "wallet";
}

export const PAYMENT_ICONS: Record<PaymentMethod, string> = PAYMENT_METHODS.reduce(
  (acc, method) => {
    acc[method] = paymentIconName(method);
    return acc;
  },
  {} as Record<PaymentMethod, string>,
);
