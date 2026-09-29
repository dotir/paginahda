"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Minus,
  PackageX,
  Plus,
  Search,
  Tag,
  Wine,
} from "lucide-react";
import { categoryStyle } from "@/app/components/CatalogView";
import {
  displayName,
  formatPEN,
  parseSolesToCents,
  type CartLine,
  type Product,
} from "@/app/lib/ui";

type Props = {
  products: Product[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearch: (value: string) => void;
  categories: string[];
  category: string;
  onCategory: (value: string) => void;
  cart: Record<number, CartLine>;
  onAdd: (id: number) => void;
  onChangeQty: (id: number, delta: number) => void;
  brokenImages: Set<number>;
  onImageError: (id: number) => void;
  canEdit: boolean;
  onQuickPrice: (id: number, priceCents: number) => Promise<void>;
  onRetry: () => void;
};

export default function SalesView({
  products,
  loading,
  error,
  search,
  onSearch,
  categories,
  category,
  onCategory,
  cart,
  onAdd,
  onChangeQty,
  brokenImages,
  onImageError,
  canEdit,
  onQuickPrice,
  onRetry,
}: Props) {
  const [quickPriceId, setQuickPriceId] = useState<number | null>(null);
  const [quickPrice, setQuickPrice] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((p) => {
      if (p.active !== 1) return false;
      if (category !== "Todas" && p.category !== category) return false;
      if (
        term &&
        !`${p.name} ${p.category} ${p.presentation ?? ""}`
          .toLowerCase()
          .includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [products, search, category]);

  async function saveQuickPrice(id: number) {
    const cents = parseSolesToCents(quickPrice);
    if (cents === null) return;
    await onQuickPrice(id, cents);
    setQuickPriceId(null);
    setQuickPrice("");
  }

  return (
    <section className="min-w-0 flex-1" aria-label="Catálogo de venta">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative min-w-0 flex-1 sm:min-w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar vino o pisco…"
            className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm outline-none placeholder:text-stone-400 focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
          />
        </label>
        <div
          className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1"
          role="group"
          aria-label="Filtrar por categoría"
        >
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onCategory(c)}
              aria-pressed={category === c}
              className={`whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-bold transition ${
                category === c
                  ? "bg-red-900 text-white shadow"
                  : "border border-stone-300 bg-white text-stone-600 hover:border-red-900 hover:text-red-900"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          role="alert"
        >
          <p className="font-semibold">No se pudo cargar el catálogo.</p>
          <p className="mt-1">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 rounded-lg bg-red-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-950"
          >
            Reintentar
          </button>
        </div>
      )}

      {loading ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-52 animate-pulse rounded-2xl border border-stone-200 bg-white"
              aria-hidden
            />
          ))}
        </div>
      ) : (
        <>
          {filtered.length === 0 && !error && (
            <div className="mt-4 rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
              Sin resultados para esa búsqueda.
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p) => {
              const style = categoryStyle(p.category);
              const qty = cart[p.id]?.qty ?? 0;
              const soldOut = p.stock === 0;
              const hasPrice = p.priceCents !== null;
              const enabled = hasPrice && !soldOut;
              const maxQty = p.stock === null ? 999 : p.stock;
              return (
                <article
                  key={p.id}
                  className={`flex flex-col rounded-2xl border bg-white p-3 shadow-sm transition ${
                    enabled
                      ? "border-stone-200 hover:border-red-900/40 hover:shadow-md"
                      : "border-dashed border-stone-300 opacity-75"
                  }`}
                >
                  {p.imageUrl && !brokenImages.has(p.id) ? (
                    // <img> intencional: URLs arbitrarias del usuario, sin dominios fijos para next/image.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt={`Foto de ${displayName(p)}`}
                      loading="lazy"
                      onError={() => onImageError(p.id)}
                      className="h-40 w-full rounded-xl bg-white object-contain"
                    />
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded-xl bg-stone-50">
                      <span
                        className="bottle"
                        style={{ "--bottle": style.bottle } as React.CSSProperties}
                        aria-hidden
                      >
                        <span className="bottle-body" />
                      </span>
                    </div>
                  )}
                  <div className="min-w-0 pt-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${style.badge}`}
                    >
                      {p.category}
                    </span>
                    <h3 className="mt-1 text-sm font-bold leading-snug text-stone-900">
                      {p.name}
                    </h3>
                    {p.presentation && (
                      <p className="mt-0.5 text-[11px] font-semibold text-stone-500">
                        {p.presentation}
                      </p>
                    )}
                    {p.stock !== null && (
                      <p
                        className={`mt-0.5 text-[11px] font-bold ${
                          soldOut
                            ? "text-red-700"
                            : p.stockMin !== null && p.stock <= p.stockMin
                              ? "text-amber-700"
                              : "text-stone-400"
                        }`}
                      >
                        {soldOut
                          ? "Agotado"
                          : `Quedan ${p.stock}${
                              p.stockMin !== null ? ` · aviso en ${p.stockMin}` : ""
                            }`}
                      </p>
                    )}
                  </div>
                  <div className="mt-auto pt-3">
                    {hasPrice ? (
                      <p className="text-lg font-extrabold text-red-900">
                        {formatPEN(p.priceCents as number)}
                      </p>
                    ) : quickPriceId === p.id ? (
                      <div className="flex gap-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={quickPrice}
                          onChange={(e) => setQuickPrice(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveQuickPrice(p.id);
                          }}
                          autoFocus
                          placeholder="0.00"
                          aria-label={`Precio de ${p.name}`}
                          className="w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm font-bold outline-none focus:border-red-900"
                        />
                        <button
                          type="button"
                          onClick={() => saveQuickPrice(p.id)}
                          className="rounded-lg bg-red-900 px-2.5 text-xs font-bold text-white"
                        >
                          ✓
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
                        Precio pendiente
                      </p>
                    )}
                    {!hasPrice && canEdit && quickPriceId !== p.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuickPriceId(p.id);
                          setQuickPrice("");
                        }}
                        className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-amber-400 px-2 py-1.5 text-[11px] font-bold text-amber-800 transition hover:bg-amber-50"
                      >
                        <Tag className="h-3.5 w-3.5" />
                        Poner precio
                      </button>
                    )}
                    {!hasPrice && !canEdit && (
                      <p className="mt-1 text-[11px] text-stone-400">
                        Pídeselo al administrador
                      </p>
                    )}
                    {soldOut ? (
                      <p className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-stone-100 py-2.5 text-xs font-bold text-stone-500">
                        <PackageX className="h-4 w-4" />
                        Agotado
                      </p>
                    ) : qty === 0 ? (
                      <button
                        type="button"
                        onClick={() => onAdd(p.id)}
                        disabled={!enabled}
                        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-red-900 py-2.5 text-sm font-bold text-white transition hover:bg-red-950 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400"
                      >
                        <Plus className="h-4 w-4" />
                        Agregar
                      </button>
                    ) : (
                      <div className="mt-2 flex items-center justify-between rounded-xl bg-red-50 p-1">
                        <button
                          type="button"
                          onClick={() => onChangeQty(p.id, -1)}
                          className="rounded-lg bg-white p-2 text-red-900 shadow-sm transition hover:bg-red-100"
                          aria-label={`Quitar uno de ${p.name}`}
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="text-sm font-extrabold text-red-900">
                          {qty} en venta
                        </span>
                        <button
                          type="button"
                          onClick={() => onChangeQty(p.id, 1)}
                          disabled={qty >= maxQty}
                          className="rounded-lg bg-white p-2 text-red-900 shadow-sm transition hover:bg-red-100 disabled:opacity-40"
                          aria-label={`Agregar uno de ${p.name}`}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                    {!soldOut && hasPrice && p.stock !== null && qty >= maxQty && (
                      <p className="mt-1 flex items-center justify-center gap-1 text-[10px] font-bold text-amber-700">
                        <AlertTriangle className="h-3 w-3" />
                        Llegaste al stock disponible
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

export function SalesEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-center">
      <Wine className="h-10 w-10 text-stone-300" />
      <p className="text-sm text-stone-500">
        Toca un producto para agregarlo a la venta.
      </p>
    </div>
  );
}
