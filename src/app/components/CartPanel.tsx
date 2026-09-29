"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import {
  displayName,
  formatPEN,
  parseSolesToCents,
  type CartLine,
  type Product,
} from "@/app/lib/ui";

export type CartEntry = {
  product: Product;
  qty: number;
  discountCents: number;
  lineTotal: number;
};

type Props = {
  products: Product[];
  cart: Record<number, CartLine>;
  onChangeQty: (id: number, delta: number) => void;
  onRemove: (id: number) => void;
  onSetDiscount: (id: number, discountCents: number) => void;
  onClearCart: () => void;
  onCheckout: () => void;
  onClose?: () => void;
};

export function buildCartEntries(
  cart: Record<number, CartLine>,
  products: Product[],
): CartEntry[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const list: CartEntry[] = [];
  for (const [key, line] of Object.entries(cart)) {
    const product = byId.get(Number(key));
    if (!product || product.active !== 1 || product.priceCents === null) continue;
    if (line.qty <= 0) continue;
    const gross = product.priceCents * line.qty;
    const discount = Math.max(0, Math.min(line.discountCents, gross - 1));
    list.push({
      product,
      qty: line.qty,
      discountCents: discount,
      lineTotal: gross - discount,
    });
  }
  return list.sort((a, b) => a.product.name.localeCompare(b.product.name));
}

export default function CartPanel({
  products,
  cart,
  onChangeQty,
  onRemove,
  onSetDiscount,
  onClearCart,
  onCheckout,
  onClose,
}: Props) {
  const [confirmClear, setConfirmClear] = useState(false);
  const entries = useMemo(() => buildCartEntries(cart, products), [cart, products]);
  const total = entries.reduce((sum, e) => sum + e.lineTotal, 0);
  const count = entries.reduce((sum, e) => sum + e.qty, 0);
  const savings = entries.reduce((sum, e) => sum + e.discountCents, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900">
          <ShoppingCart className="h-5 w-5 text-red-900" />
          Venta actual
          {count > 0 && (
            <span className="rounded-full bg-red-900 px-2 py-0.5 text-xs font-bold text-white">
              {count}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-1">
          {entries.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="rounded-lg p-2 text-stone-500 transition hover:bg-stone-100 hover:text-red-800"
              title="Vaciar carrito"
              aria-label="Vaciar carrito"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-stone-500 transition hover:bg-stone-100 lg:hidden"
              aria-label="Cerrar carrito"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {confirmClear && (
        <div className="border-b border-amber-200 bg-amber-50 p-3 text-xs">
          <p className="font-bold text-amber-900">
            ¿Vaciar toda la venta? Se pierden {count} productos agregados.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onClearCart();
                setConfirmClear(false);
              }}
              className="rounded-lg bg-red-900 px-3 py-1.5 font-bold text-white"
            >
              Sí, vaciar
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-bold text-stone-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {entries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <ShoppingCart className="h-10 w-10 text-stone-300" />
            <p className="text-sm text-stone-500">
              Toca un producto para agregarlo a la venta.
            </p>
            <p className="text-xs text-stone-400">
              La venta se guarda en este dispositivo si recargas.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => {
              const { product, qty } = entry;
              const maxQty =
                product.stock === null ? 999 : Math.max(product.stock, 1);
              return (
                <li
                  key={product.id}
                  className="rounded-xl border border-stone-200 bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-stone-900">
                      {displayName(product)}
                    </p>
                    <button
                      type="button"
                      onClick={() => onRemove(product.id)}
                      className="rounded p-1 text-stone-400 transition hover:bg-red-50 hover:text-red-800"
                      aria-label={`Quitar ${displayName(product)}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {formatPEN(product.priceCents ?? 0)} c/u
                    {product.stock !== null && (
                      <span
                        className={
                          product.stock === 0 ||
                          (product.stockMin !== null && product.stock <= product.stockMin)
                            ? "ml-1 font-bold text-amber-700"
                            : "ml-1"
                        }
                      >
                        · quedan {product.stock}
                      </span>
                    )}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onChangeQty(product.id, -1)}
                        className="rounded-lg border border-stone-300 p-1.5 text-stone-700 transition hover:bg-stone-100"
                        aria-label="Disminuir cantidad"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center text-sm font-bold">{qty}</span>
                      <button
                        type="button"
                        onClick={() => onChangeQty(product.id, 1)}
                        disabled={qty >= maxQty}
                        className="rounded-lg border border-stone-300 p-1.5 text-stone-700 transition hover:bg-stone-100 disabled:opacity-40"
                        aria-label="Aumentar cantidad"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-sm font-bold text-red-900">
                      {formatPEN(entry.lineTotal)}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <label className="flex flex-1 items-center gap-1.5 rounded-lg bg-stone-50 px-2 py-1">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                        Desc.
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={
                          entry.discountCents > 0
                            ? (entry.discountCents / 100).toFixed(2)
                            : ""
                        }
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          if (raw === "") {
                            onSetDiscount(product.id, 0);
                            return;
                          }
                          const cents = parseSolesToCents(raw) ?? 0;
                          const gross = (product.priceCents ?? 0) * qty;
                          onSetDiscount(
                            product.id,
                            Math.max(0, Math.min(cents, gross - 1)),
                          );
                        }}
                        placeholder="0.00"
                        aria-label={`Descuento de ${product.name}`}
                        className="w-full bg-transparent text-xs font-bold text-stone-900 outline-none"
                      />
                    </label>
                    {entry.discountCents > 0 && (
                      <span className="text-[10px] font-bold text-emerald-700">
                        -{formatPEN(entry.discountCents)}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-stone-200 px-4 py-4">
        {savings > 0 && (
          <div className="mb-1 flex items-center justify-between text-xs font-bold text-emerald-700">
            <span>Descuentos</span>
            <span>-{formatPEN(savings)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-lg font-bold text-stone-900">
          <span>Total</span>
          <span>{formatPEN(total)}</span>
        </div>
        <button
          type="button"
          onClick={onCheckout}
          disabled={entries.length === 0}
          className="mt-3 w-full rounded-xl bg-red-900 py-3 text-base font-bold text-white shadow transition hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Cobrar {total > 0 && formatPEN(total)}
        </button>
      </div>
    </div>
  );
}
