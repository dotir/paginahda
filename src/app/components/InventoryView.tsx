"use client";

import { useState } from "react";
import { AlertTriangle, Boxes, Download, PackageX } from "lucide-react";
import {
  formatDate,
  formatPEN,
  parseCount,
  type Product,
  type StockMovement,
} from "@/app/lib/ui";

type Props = {
  products: Product[];
  movements: StockMovement[];
  canEdit: boolean;
  onSaveStock: (id: number, stock: number | null) => Promise<void>;
  onExport: () => void;
};

export default function InventoryView({
  products,
  movements,
  canEdit,
  onSaveStock,
  onExport,
}: Props) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tracked = products.filter((p) => p.stock !== null);
  const low = tracked.filter(
    (p) => p.stockMin !== null && (p.stock as number) <= p.stockMin,
  );
  const out = tracked.filter((p) => p.stock === 0);
  const inventoryValue = tracked.reduce(
    (sum, p) => sum + (p.costCents ?? 0) * (p.stock as number),
    0,
  );
  const saleValue = tracked.reduce(
    (sum, p) => sum + (p.priceCents ?? 0) * (p.stock as number),
    0,
  );
  // El valor del inventario se deriva del costo: solo el admin lo ve.
  const unitsInStock = tracked.reduce((sum, p) => sum + (p.stock as number), 0);

  async function save(id: number) {
    const raw = (drafts[id] ?? "").trim();
    setError(null);
    if (raw === "") {
      await onSaveStock(id, null);
      return;
    }
    const parsed = parseCount(raw);
    if (parsed === null) {
      setError("El stock debe ser un número entero (0 o mayor).");
      return;
    }
    setSavingId(id);
    try {
      await onSaveStock(id, parsed);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section aria-label="Inventario" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
            Con control
          </p>
          <p className="mt-1 text-2xl font-extrabold text-stone-900">
            {tracked.length}
          </p>
        </div>
        <div
          className={`rounded-2xl border p-4 shadow-sm ${
            low.length > 0
              ? "border-amber-300 bg-amber-50"
              : "border-stone-200 bg-white"
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
            Stock bajo
          </p>
          <p
            className={`mt-1 text-2xl font-extrabold ${
              low.length > 0 ? "text-amber-700" : "text-stone-900"
            }`}
          >
            {low.length}
          </p>
        </div>
        <div
          className={`rounded-2xl border p-4 shadow-sm ${
            out.length > 0
              ? "border-red-300 bg-red-50"
              : "border-stone-200 bg-white"
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
            Agotados
          </p>
          <p
            className={`mt-1 text-2xl font-extrabold ${
              out.length > 0 ? "text-red-700" : "text-stone-900"
            }`}
          >
            {out.length}
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
            {canEdit ? "Valor a costo" : "Unidades en stock"}
          </p>
          <p className="mt-1 text-2xl font-extrabold text-stone-900">
            {canEdit ? formatPEN(inventoryValue) : unitsInStock}
          </p>
          {canEdit && (
            <p className="text-[11px] text-stone-500">
              Venta potencial {formatPEN(saleValue)}
            </p>
          )}
        </div>
      </div>

      {low.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-extrabold text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            Repón estos productos ({low.length})
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {low.map((p) => (
              <li
                key={p.id}
                className="rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-900 shadow-sm"
              >
                {p.name} · {p.stock}/{p.stockMin}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onExport}
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-red-900 bg-white py-3 text-sm font-bold text-red-900 transition hover:bg-red-50"
          >
            <Download className="h-4 w-4" />
            Descargar inventario (CSV)
          </button>
          <p className="text-xs text-stone-500">
            Deja el stock vacío si el producto no lleva control (se vende sin
            límite).
          </p>
        </div>
      )}

      {error && (
        <p
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-900"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2.5 font-bold">Producto</th>
              <th className="px-3 py-2.5 text-right font-bold">Stock</th>
              <th className="px-3 py-2.5 text-right font-bold">Mínimo</th>
              <th className="px-3 py-2.5 text-right font-bold">Estado</th>
              {canEdit && <th className="px-3 py-2.5 font-bold">Ajustar</th>}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const isOut = p.stock === 0;
              const isLow =
                p.stock !== null && p.stockMin !== null && p.stock <= p.stockMin;
              return (
                <tr
                  key={p.id}
                  className="border-t border-stone-100 align-middle"
                >
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-stone-900">{p.name}</p>
                    <p className="text-xs text-stone-500">
                      {p.category}
                      {p.presentation ? ` · ${p.presentation}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-stone-900">
                    {p.stock === null ? (
                      <span className="text-xs font-normal text-stone-400">
                        sin control
                      </span>
                    ) : (
                      p.stock
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-stone-600">
                    {p.stockMin ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {p.stock === null ? (
                      <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-bold uppercase text-stone-600">
                        Sin control
                      </span>
                    ) : p.active !== 1 ? (
                      <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-bold uppercase text-stone-600">
                        Oculto
                      </span>
                    ) : isOut ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-800">
                        Agotado
                      </span>
                    ) : isLow ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                        Bajo
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                        OK
                      </span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          value={drafts[p.id] ?? ""}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [p.id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") save(p.id);
                          }}
                          placeholder={p.stock === null ? "libre" : String(p.stock)}
                          aria-label={`Stock de ${p.name}`}
                          className="w-24 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm font-bold outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
                        />
                        <button
                          type="button"
                          onClick={() => save(p.id)}
                          disabled={savingId === p.id}
                          className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-stone-700 disabled:opacity-50"
                        >
                          {savingId === p.id ? "…" : "Guardar"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {movements.length > 0 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-stone-900">
            <Boxes className="h-4 w-4 text-red-900" />
            Últimos movimientos de stock
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {movements.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-2 border-b border-stone-100 pb-1.5 text-xs text-stone-600 last:border-0"
              >
                <span
                  className={`rounded px-1.5 py-0.5 font-extrabold ${
                    m.delta > 0
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-stone-200 text-stone-700"
                  }`}
                >
                  {m.delta > 0 ? `+${m.delta}` : m.delta}
                </span>
                <span className="font-semibold text-stone-900">
                  {m.productName}
                </span>
                <span className="text-stone-500">{m.reason}</span>
                <span className="ml-auto text-stone-400">
                  {m.user ?? "—"} · {formatDate(m.at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {products.length === 0 && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <PackageX className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-2 text-sm font-semibold text-stone-600">
            Todavía no hay productos en el catálogo.
          </p>
        </div>
      )}
    </section>
  );
}
