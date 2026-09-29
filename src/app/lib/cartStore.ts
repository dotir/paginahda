import type { CartLine } from "@/app/lib/types";

const KEY = "el_arbolito_cart_v1";
const EVENT = "el_arbolito_cart_change";

/** Caché del valor leído de localStorage: estable entre renders. */
let cached: string | null | undefined;

function readStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function subscribeCart(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => {
    cached = undefined;
    onChange();
  };
  window.addEventListener("storage", handler);
  window.addEventListener(EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(EVENT, handler);
  };
}

export function getCartSnapshot(): string | null {
  if (cached === undefined) cached = readStorage();
  return cached;
}

export function getCartServerSnapshot(): string | null {
  return null;
}

export function parseCart(snapshot: string | null): Record<number, CartLine> {
  if (!snapshot) return {};
  try {
    const parsed = JSON.parse(snapshot) as Record<
      string,
      { qty?: number; discountCents?: number }
    >;
    const result: Record<number, CartLine> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const id = Number(key);
      if (!Number.isInteger(id) || !value) continue;
      const qty = Math.max(0, Math.min(999, Math.trunc(value.qty ?? 0)));
      const discountCents = Math.max(0, Math.trunc(value.discountCents ?? 0));
      if (qty > 0) result[id] = { qty, discountCents };
    }
    return result;
  } catch {
    return {};
  }
}

export function writeCart(cart: Record<number, CartLine>): void {
  const raw = JSON.stringify(cart);
  cached = raw;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, raw);
    } catch {
      // modo privado o cuota llena: el carrito durará lo que dure la pestaña
    }
    window.dispatchEvent(new Event(EVENT));
  }
}
