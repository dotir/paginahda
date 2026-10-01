"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Download,
  PackageX,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  displayName,
  formatDate,
  formatPEN,
  parseCount,
  parseSolesToCentsOrZero,
  type Product,
  type StockMovement,
} from "@/app/lib/ui";

type Props = {
  products: Product[];
  movements: StockMovement[];
  canEdit: boolean;
  onSaveStock: (
    id: number,
    patch: { stock?: number | null; stockMin?: number | null; unitsPerBox?: number | null; boxCostCents?: number | null },
  ) => Promise<void>;
  onExport: () => void;
  onReceive: (
    lines: Array<{
      productId: number;
      boxes: number | null;
      unitsPerBox: number | null;
      looseUnits: number | null;
    }>,
    note: string,
  ) => Promise<number>;
  onEnableControl: (id: number) => void;
};

type Row = {
  stock: string;
  stockMin: string;
  unitsPerBox: string;
  boxCost: string;
  boxes: string;
  perBox: string;
  loose: string;
};

const EMPTY_ROW: Row = {
  stock: "",
  stockMin: "",
  unitsPerBox: "",
  boxCost: "",
  boxes: "",
  perBox: "",
  loose: "",
};

export default function InventoryView({
  products,
  movements,
  canEdit,
  onSaveStock,
  onExport,
  onReceive,
  onEnableControl,
}: Props) {
  const [rows, setRows] = useState<Record<number, Row>>({});
  const [note, setNote] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [openReceive, setOpenReceive] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const controlled = products.filter((p) => p.stock !== null);
  const uncontrolled = products.filter((p) => p.stock === null);
  const tracked = controlled;
  const low = tracked.filter(
    (p) => p.stockMin !== null && (p.stock as number) <= p.stockMin,
  );
  const out = tracked.filter((p) => p.stock === 0);
  const boxesInStock = tracked.reduce(
    (sum, p) =>
      p.unitsPerBox === null
        ? sum
        : sum + Math.floor((p.stock as number) / p.unitsPerBox),
    0,
  );
  const openBoxes = tracked.filter(
    (p) => p.unitsPerBox !== null && (p.stock as number) % p.unitsPerBox !== 0,
  );
  const inventoryValue = tracked.reduce(
    (sum, p) => sum + (p.costCents ?? 0) * (p.stock as number),
    0,
  );
  const saleValue = tracked.reduce(
    (sum, p) => sum + (p.priceCents ?? 0) * (p.stock as number),
    0,
  );
  const unitsInStock = tracked.reduce((sum, p) => sum + (p.stock as number), 0);

  const rowFor = (id: number): Row => rows[id] ?? EMPTY_ROW;

  function setField(id: number, field: keyof Row, value: string) {
    setRows((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? EMPTY_ROW), [field]: value },
    }));
    setError(null);
  }

  function toggleReceive(id: number) {
    setOpenReceive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearRow(id: number) {
    setRows((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  /** Botellas que suma la fila tal como está escrita. */
  function incoming(product: Product): { units: number; perBox: number | null } {
    const row = rowFor(product.id);
    const boxes = parseCount(row.boxes) ?? 0;
    const loose = parseCount(row.loose) ?? 0;
    const typed = row.perBox.trim() === "" ? null : parseCount(row.perBox);
    const perBox = typed ?? product.unitsPerBox;
    return { units: boxes * (perBox ?? 0) + loose, perBox };
  }

  const pending = products
    .map((p) => ({ product: p, ...incoming(p) }))
    .filter((row) => row.units > 0);
  const totalIncoming = pending.reduce((sum, row) => sum + row.units, 0);
  const missingPerBox = pending.find(
    (row) => (parseCount(rowFor(row.product.id).boxes) ?? 0) > 0 && !row.perBox,
  );

  async function saveConfig(id: number) {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    const row = rowFor(id);
    setError(null);
    const patch: {
      stock?: number | null;
      stockMin?: number | null;
      unitsPerBox?: number | null;
      boxCostCents?: number | null;
    } = {};
    if (row.stock.trim() !== "") {
      const stock = parseCount(row.stock);
      if (stock === null) {
        setError(`Stock de "${product.name}": debe ser un número entero (0 o mayor).`);
        return;
      }
      patch.stock = stock;
    }
    if (row.stockMin.trim() !== "") {
      const min = parseCount(row.stockMin);
      if (min === null) {
        setError(`Mínimo de "${product.name}": debe ser un número entero (0 o mayor).`);
        return;
      }
      patch.stockMin = min;
    }
    if (row.unitsPerBox.trim() !== "") {
      const perBox = parseCount(row.unitsPerBox);
      if (perBox === null || perBox <= 0) {
        setError(`Botellas por caja de "${product.name}": debe ser mayor a 0.`);
        return;
      }
      patch.unitsPerBox = perBox;
    }
    if (row.boxCost.trim() !== "") {
      const boxCost = parseSolesToCentsOrZero(row.boxCost);
      if (boxCost === null || boxCost <= 0) {
        setError(`Costo de caja de "${product.name}": debe ser mayor a S/ 0.00.`);
        return;
      }
      patch.boxCostCents = boxCost;
    }
    if (Object.keys(patch).length === 0) {
      setError("No cambiaste nada de esa fila.");
      return;
    }
    setSavingId(id);
    try {
      await onSaveStock(id, patch);
      clearRow(id);
    } finally {
      setSavingId(null);
    }
  }

  async function submitReceipt(ids: number[]) {
    if (receiving || ids.length === 0) return;
    setError(null);
    if (missingPerBox) {
      setError(
        `Falta indicar cuántas botellas trae la caja de "${missingPerBox.product.name}".`,
      );
      return;
    }
    setReceiving(true);
    try {
      const total = await onReceive(
        ids.map((id) => {
          const row = rowFor(id);
          const boxes = parseCount(row.boxes) ?? 0;
          const loose = parseCount(row.loose) ?? 0;
          const typed = row.perBox.trim() === "" ? null : parseCount(row.perBox);
          return {
            productId: id,
            boxes: boxes > 0 ? boxes : 0,
            unitsPerBox: typed,
            looseUnits: loose > 0 ? loose : 0,
          };
        }),
        note.trim(),
      );
      ids.forEach(clearRow);
      setNote("");
      void total;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar.");
    } finally {
      setReceiving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm font-bold text-stone-900 outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20";
  const labelClass = "flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-stone-400";

  return (
    <section aria-label="Inventario" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
            Botellas
          </p>
          <p className="mt-1 text-2xl font-extrabold text-stone-900">
            {canEdit ? unitsInStock : "—"}
          </p>
          <p className="text-[11px] text-stone-500">{tracked.length} con control</p>
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
            Cajas
          </p>
          <p className="mt-1 text-2xl font-extrabold text-stone-900">
            {boxesInStock}
          </p>
          {openBoxes.length > 0 && (
            <p className="text-[11px] text-stone-500">
              {openBoxes.length} con caja abierta
            </p>
          )}
        </div>
        {canEdit && (
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
              Valor a costo
            </p>
            <p className="mt-1 text-2xl font-extrabold text-stone-900">
              {formatPEN(inventoryValue)}
            </p>
            <p className="text-[11px] text-stone-500">
              Venta potencial {formatPEN(saleValue)}
            </p>
          </div>
        )}
      </div>

      {low.length > 0 && canEdit && (
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
          <label className="flex-1 text-xs font-bold text-stone-500">
            Nota del pedido
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={100}
              placeholder="Ej. Pedido 4821 del proveedor"
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-normal text-stone-900 outline-none placeholder:text-stone-400 focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
            />
          </label>
          <button
            type="button"
            onClick={onExport}
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-red-900 bg-white px-4 py-2.5 text-sm font-bold text-red-900 transition hover:bg-red-50"
          >
            <Download className="h-4 w-4" />
            Descargar CSV
          </button>
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

      <ul className="flex flex-col gap-2">
        {controlled.map((p) => {
          const row = rowFor(p.id);
          const trackedRow = p.stock !== null;
          const isLow =
            trackedRow && p.stockMin !== null && (p.stock as number) <= p.stockMin;
          const isOut = trackedRow && p.stock === 0;
          const { units, perBox } = incoming(p);
          const boxes = parseCount(row.boxes) ?? 0;
          const touchedReceipt = units > 0;
          const saving = savingId === p.id;
          return (
            <li
              key={p.id}
              className={`rounded-xl border bg-white p-3 shadow-sm ${
                touchedReceipt
                  ? "border-red-900/40 bg-red-50/40"
                  : isOut
                    ? "border-red-200"
                    : "border-stone-200"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-stone-900">
                    {displayName(p)}
                  </p>
                  <p className="text-xs text-stone-500">
                    {p.category}
                    {trackedRow && p.unitsPerBox !== null
                      ? ` · ${Math.floor((p.stock as number) / p.unitsPerBox)} cajas de ${p.unitsPerBox}`
                      : ""}
                    {trackedRow &&
                    p.unitsPerBox !== null &&
                    (p.stock as number) % p.unitsPerBox !== 0
                      ? ` +${(p.stock as number) % p.unitsPerBox} sueltas`
                      : ""}
                  </p>
                </div>
                <span className="flex items-center gap-1.5">
                  {p.active !== 1 && (
                    <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-bold uppercase text-stone-600">
                      Oculto
                    </span>
                  )}
                  {!trackedRow ? (
                    <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-bold uppercase text-stone-600">
                      Sin control
                    </span>
                  ) : isOut ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-800">
                      Agotado
                    </span>
                  ) : isLow ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                      Stock bajo
                    </span>
                  ) : null}
                  <span className="text-lg font-extrabold text-stone-900">
                    {trackedRow ? p.stock : "—"}
                  </span>
                </span>
              </div>

              {canEdit ? (
                <>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className={labelClass}>
                      Stock
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={row.stock}
                        onChange={(e) => setField(p.id, "stock", e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveConfig(p.id);
                        }}
                        placeholder={String(p.stock)}
                        aria-label={`Stock de ${p.name}`}
                        className={inputClass}
                      />
                    </label>
                    <label className={labelClass}>
                      Mínimo
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={row.stockMin}
                        onChange={(e) => setField(p.id, "stockMin", e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveConfig(p.id);
                        }}
                        placeholder={p.stockMin === null ? "—" : String(p.stockMin)}
                        aria-label={`Stock mínimo de ${p.name}`}
                        className={inputClass}
                      />
                    </label>
                    <label className={labelClass}>
                      Botellas/caja
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={row.unitsPerBox}
                        onChange={(e) => setField(p.id, "unitsPerBox", e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveConfig(p.id);
                        }}
                        placeholder={
                          p.unitsPerBox === null ? "12" : String(p.unitsPerBox)
                        }
                        aria-label={`Botellas por caja de ${p.name}`}
                        className={inputClass}
                      />
                    </label>
                    <label className={labelClass}>
                      Costo caja S/
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={row.boxCost}
                        onChange={(e) => setField(p.id, "boxCost", e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveConfig(p.id);
                        }}
                        placeholder={
                          p.boxCostCents === null
                            ? "0.00"
                            : (p.boxCostCents / 100).toFixed(2)
                        }
                        aria-label={`Costo de la caja de ${p.name} en soles`}
                        className={inputClass}
                      />
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => saveConfig(p.id)}
                      disabled={saving}
                      className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-stone-700 disabled:opacity-50"
                    >
                      {saving ? "Guardando…" : "Guardar ajustes"}
                    </button>
                    {Object.values(row).some((v) => v !== "") && (
                      <button
                        type="button"
                        onClick={() => clearRow(p.id)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-stone-500 transition hover:bg-stone-100"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Limpiar
                      </button>
                    )}
                  </div>

                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => toggleReceive(p.id)}
                      aria-expanded={openReceive.has(p.id)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-stone-300 py-1.5 text-[11px] font-bold text-stone-500 transition hover:border-red-900 hover:text-red-900"
                    >
                      Recibir del pedido
                    </button>
                  </div>
                  {openReceive.has(p.id) && (
                  <div className="mt-2 rounded-lg border border-dashed border-stone-300 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                      {boxes > 0 || (parseCount(row.loose) ?? 0) > 0
                        ? `Va a sumar ${units} botellas`
                        : "Escribe cuántas cajas trae"}
                    </p>
                    <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                      <label className={labelClass}>
                        Cajas
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          value={row.boxes}
                          onChange={(e) => setField(p.id, "boxes", e.target.value)}
                          placeholder="0"
                          aria-label={`Cajas de ${p.name}`}
                          className={inputClass}
                        />
                      </label>
                      <label className={labelClass}>
                        Botellas/caja
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          value={row.perBox}
                          onChange={(e) => setField(p.id, "perBox", e.target.value)}
                          placeholder={
                            p.unitsPerBox === null ? "?" : String(p.unitsPerBox)
                          }
                          aria-label={`Botellas por caja recibidas de ${p.name}`}
                          className={inputClass}
                        />
                      </label>
                      <label className={labelClass}>
                        Sueltas
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          value={row.loose}
                          onChange={(e) => setField(p.id, "loose", e.target.value)}
                          placeholder="0"
                          aria-label={`Botellas sueltas de ${p.name}`}
                          className={inputClass}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => submitReceipt([p.id])}
                        disabled={!touchedReceipt || receiving}
                        className="rounded-lg bg-red-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-950 disabled:opacity-40"
                      >
                        {touchedReceipt ? `Ingresar +${units}` : "Ingresar"}
                      </button>
                    </div>
                    {touchedReceipt && (
                      <p
                        className={`mt-1.5 text-[11px] font-bold ${
                          boxes > 0 && !perBox
                            ? "text-red-700"
                            : "text-emerald-700"
                        }`}
                      >
                        {boxes > 0 && !perBox
                          ? "Falta indicar cuántas botellas trae la caja"
                          : `Quedará en ${(p.stock ?? 0) + units}${
                              perBox !== null && p.unitsPerBox !== null && perBox !== p.unitsPerBox
                                ? ` · la caja ahora será de ${perBox}`
                                : ""
                            }`}
                      </p>
                    )}
                  </div>
                  )}
                </>
              ) : null}
            </li>
          );
        })}
      </ul>

      {canEdit && pending.length > 0 && (
        <div className="sticky bottom-20 z-20 rounded-2xl border border-red-900 bg-white p-3 shadow-xl lg:bottom-4">
          <p className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-stone-900">
            <span>
              Pedido: {pending.length}{" "}
              {pending.length === 1 ? "producto" : "productos"}
            </span>
            <span className="text-base font-extrabold text-red-900">
              +{totalIncoming} botellas
            </span>
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-stone-600">
            {pending.map((row) => (
              <li key={row.product.id}>
                {row.product.name}:{" "}
                <strong>
                  {(parseCount(rowFor(row.product.id).boxes) ?? 0) > 0
                    ? `${parseCount(rowFor(row.product.id).boxes)} × ${row.perBox}`
                    : `${parseCount(rowFor(row.product.id).loose) ?? 0} sueltas`}
                  {row.units !== 0 &&
                    (parseCount(rowFor(row.product.id).loose) ?? 0) > 0 &&
                    (parseCount(rowFor(row.product.id).boxes) ?? 0) > 0
                    ? ` + ${parseCount(rowFor(row.product.id).loose)}`
                    : ""}
                </strong>{" "}
                = {row.units}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => submitReceipt(pending.map((row) => row.product.id))}
            disabled={receiving || missingPerBox !== undefined}
            className="mt-2 w-full rounded-xl bg-red-900 py-3 text-sm font-bold text-white transition hover:bg-red-950 disabled:opacity-40"
          >
            {receiving
              ? "Registrando…"
              : `Ingresar pedido completo${totalIncoming > 0 ? ` (+${totalIncoming} botellas)` : ""}`}
          </button>
        </div>
      )}

      {uncontrolled.length > 0 && (
        <details className="rounded-2xl border border-dashed border-stone-300 bg-white p-4">
          <summary className="cursor-pointer text-sm font-bold text-stone-600">
            Productos sin control de stock ({uncontrolled.length})
          </summary>
          <p className="mt-1 text-xs text-stone-500">
            Se venden sin límite. Actívalos para poder recibir cajas y saber
            cuánto te queda.
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {uncontrolled.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-stone-900">
                    {displayName(p)}
                  </p>
                  <p className="text-xs text-stone-500">{p.category}</p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onEnableControl(p.id)}
                    className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-600 transition hover:border-red-900 hover:text-red-900"
                  >
                    Activar control
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {products.length === 0 && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <PackageX className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-2 text-sm font-semibold text-stone-600">
            Todavía no hay productos en el catálogo.
          </p>
        </div>
      )}

      {movements.length > 0 && (
        <details className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-extrabold text-stone-900">
            <Boxes className="h-4 w-4 text-red-900" />
            Movimientos de stock ({movements.length})
          </summary>
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
                <span className="font-semibold text-stone-900">{m.productName}</span>
                <span className="text-stone-500">{m.reason}</span>
                <span className="ml-auto text-stone-400">
                  {m.user ?? "—"} · {formatDate(m.at)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {canEdit && products.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-stone-400">
          <Trash2 className="h-3.5 w-3.5" />
          Para cambiar precio, costo o presentación ve a <strong>Catálogo</strong>.
        </p>
      )}
    </section>
  );
}
