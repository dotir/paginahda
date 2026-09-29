"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Plus,
  Store,
  Trash2,
} from "lucide-react";
import Modal from "@/app/components/Modal";
import {
  displayName,
  formatPEN,
  parseSolesToCents,
  type Product,
} from "@/app/lib/ui";

const CATEGORY_STYLES: Record<string, { badge: string; bottle: string }> = {
  "Vino emblema": { badge: "bg-amber-100 text-amber-900", bottle: "#b45309" },
  "Línea patrimonial": {
    badge: "bg-purple-100 text-purple-900",
    bottle: "#6d28d9",
  },
  Semisecos: { badge: "bg-rose-100 text-rose-900", bottle: "#e11d48" },
  "Piscos clásicos": {
    badge: "bg-emerald-100 text-emerald-900",
    bottle: "#047857",
  },
  "Piscos Machu Picchu": {
    badge: "bg-sky-100 text-sky-900",
    bottle: "#0284c7",
  },
};

const FALLBACK_CATEGORY = {
  badge: "bg-stone-200 text-stone-800",
  bottle: "#57534e",
};

export function categoryStyle(category: string) {
  return CATEGORY_STYLES[category] ?? FALLBACK_CATEGORY;
}

export type Drafts = Record<number, string>;

export type NewProductDraft = {
  name: string;
  category: string;
  presentation: string;
  image: string;
  price: string;
  cost: string;
  stock: string;
  stockMin: string;
};

type Props = {
  products: Product[];
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  showAddForm: boolean;
  onToggleAddForm: (open: boolean) => void;
  onSubmitNew: () => void;
  newProduct: NewProductDraft;
  onNewProductChange: (field: keyof NewProductDraft, value: string) => void;
  newProductError: string | null;
  savingNew: boolean;
  priceDrafts: Drafts;
  costDrafts: Drafts;
  presentationDrafts: Drafts;
  imageDrafts: Drafts;
  stockDrafts: Drafts;
  stockMinDrafts: Drafts;
  onDraft: (field: DraftField, id: number, value: string) => void;
  onSave: (id: number) => void;
  onToggleActive: (id: number, next: boolean) => void;
  onDelete: (product: Product) => Promise<void>;
  savingId: number | null;
  deletingId: number | null;
  rowErrors: Record<number, string>;
  onRetry: () => void;
  categories: string[];
};

export type DraftField =
  | "price"
  | "cost"
  | "presentation"
  | "image"
  | "stock"
  | "stockMin";

const FIELD_LABELS: Record<DraftField, { label: string; placeholder: string; type: string }> =
  {
    presentation: {
      label: "Presentación",
      placeholder: "Presentación (ej. Descartable 1 L)",
      type: "text",
    },
    image: { label: "Foto (URL https://…)", placeholder: "Foto (URL)", type: "url" },
    stock: { label: "Stock", placeholder: "libre", type: "number" },
    stockMin: { label: "Mínimo", placeholder: "—", type: "number" },
    cost: { label: "Me cuesta S/", placeholder: "0.00", type: "number" },
    price: { label: "Lo vendo S/", placeholder: "0.00", type: "number" },
  };

const NUMBER_FIELDS: DraftField[] = ["stock", "stockMin", "cost", "price"];

function DraftInput({
  field,
  value,
  onChange,
  onSave,
  label,
  ariaLabel,
}: {
  field: DraftField;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  label: string;
  ariaLabel: string;
}) {
  const isNumber = NUMBER_FIELDS.includes(field);
  return (
    <label className="relative">
      <span className="pointer-events-none absolute -top-2 left-3 rounded bg-white px-1 text-[10px] font-bold uppercase tracking-wide text-stone-400">
        {label}
      </span>
      <input
        type={isNumber ? "number" : "text"}
        min={isNumber ? "0" : undefined}
        step={isNumber ? (field === "stock" || field === "stockMin" ? "1" : "0.01") : undefined}
        inputMode={field === "stock" || field === "stockMin" ? "numeric" : isNumber ? "decimal" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave();
        }}
        placeholder={FIELD_LABELS[field].placeholder}
        maxLength={field === "image" ? 500 : field === "presentation" ? 40 : undefined}
        aria-label={ariaLabel}
        className="w-full rounded-xl border border-stone-300 py-2.5 pl-3 pr-3 text-sm font-bold outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
      />
    </label>
  );
}

export default function CatalogView(props: Props) {
  const {
    products,
    loading,
    error,
    canEdit,
    showAddForm,
    onToggleAddForm,
    onSubmitNew,
    newProduct,
    onNewProductChange,
    newProductError,
    savingNew,
    priceDrafts,
    costDrafts,
    presentationDrafts,
    imageDrafts,
    stockDrafts,
    stockMinDrafts,
    onDraft,
    onSave,
    onToggleActive,
    onDelete,
    savingId,
    deletingId,
    rowErrors,
    onRetry,
    categories,
  } = props;

  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await onDelete(pendingDelete);
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  const lowStock = useMemo(
    () =>
      products.filter(
        (p) => p.stock !== null && p.stockMin !== null && p.stock <= p.stockMin,
      ),
    [products],
  );

  const draftsFor = (field: DraftField, id: number): string => {
    const map = {
      price: priceDrafts,
      cost: costDrafts,
      presentation: presentationDrafts,
      image: imageDrafts,
      stock: stockDrafts,
      stockMin: stockMinDrafts,
    }[field];
    return map[id] ?? "";
  };

  return (
    <section aria-label="Gestión de catálogo" className="flex flex-col gap-3">
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-stone-900">
          <Store className="h-5 w-5 text-red-900" />
          Catálogo, costos y precios
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Anota a cuánto te cuesta cada producto y a cuánto lo vendes. Solo los
          productos activos y con precio aparecen habilitados para la venta.
        </p>
        {lowStock.length > 0 && canEdit && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Stock bajo o agotado: {lowStock.map((p) => p.name).join(", ")}
            </span>
          </p>
        )}
      </div>

      {!canEdit ? (
        <p className="rounded-2xl border border-stone-200 bg-white p-4 text-sm text-stone-500 shadow-sm">
          Estás entrando como <strong>cajero</strong>: puedes registrar ventas
          pero no modificar costos, precios ni el catálogo.
        </p>
      ) : !showAddForm ? (
        <button
          type="button"
          onClick={() => onToggleAddForm(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-900 py-3 text-sm font-bold text-white transition hover:bg-red-950"
        >
          <Plus className="h-4 w-4" />
          Agregar producto
        </button>
      ) : (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-extrabold text-stone-900">Nuevo producto</h3>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-bold text-stone-500">
              Nombre
              <input
                type="text"
                value={newProduct.name}
                onChange={(e) => onNewProductChange("name", e.target.value)}
                placeholder="Ej. Vino Tinto Reserva"
                maxLength={120}
                className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-normal text-stone-900 outline-none placeholder:text-stone-400 focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-stone-500">
              Categoría
              <input
                type="text"
                value={newProduct.category}
                onChange={(e) => onNewProductChange("category", e.target.value)}
                placeholder="Ej. Semisecos"
                maxLength={60}
                list="existing-categories"
                className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-normal text-stone-900 outline-none placeholder:text-stone-400 focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
              />
              <datalist id="existing-categories">
                {categories
                  .filter((c) => c !== "Todas")
                  .map((c) => (
                    <option key={c} value={c} />
                  ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-stone-500">
              Presentación (opcional)
              <input
                type="text"
                value={newProduct.presentation}
                onChange={(e) => onNewProductChange("presentation", e.target.value)}
                placeholder="Ej. Descartable 1 L, Botella 750 ml"
                maxLength={40}
                className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-normal text-stone-900 outline-none placeholder:text-stone-400 focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-stone-500">
              Foto (URL, opcional)
              <input
                type="url"
                value={newProduct.image}
                onChange={(e) => onNewProductChange("image", e.target.value)}
                placeholder="https://…"
                maxLength={500}
                className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-normal text-stone-900 outline-none placeholder:text-stone-400 focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-stone-500">
              Me cuesta S/ (opcional)
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={newProduct.cost}
                onChange={(e) => onNewProductChange("cost", e.target.value)}
                placeholder="0.00"
                className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-bold text-stone-900 outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-stone-500">
              Lo vendo S/ (opcional)
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={newProduct.price}
                onChange={(e) => onNewProductChange("price", e.target.value)}
                placeholder="0.00"
                className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-bold text-stone-900 outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-stone-500">
              Stock (vacío = sin control)
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={newProduct.stock}
                onChange={(e) => onNewProductChange("stock", e.target.value)}
                placeholder="sin control"
                className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-bold text-stone-900 outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-stone-500">
              Avisar cuando quede (mínimo)
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={newProduct.stockMin}
                onChange={(e) => onNewProductChange("stockMin", e.target.value)}
                placeholder="3"
                className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-bold text-stone-900 outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
              />
            </label>
          </div>
          {newProductError && (
            <p
              className="mt-2 rounded-lg bg-red-50 p-2 text-center text-sm font-bold text-red-800"
              role="alert"
            >
              {newProductError}
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onToggleAddForm(false)}
              disabled={savingNew}
              className="rounded-xl border border-stone-300 py-2.5 text-sm font-bold text-stone-700 transition hover:bg-stone-100 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSubmitNew}
              disabled={savingNew}
              className="rounded-xl bg-red-900 py-2.5 text-sm font-bold text-white transition hover:bg-red-950 disabled:opacity-50"
            >
              {savingNew ? "Guardando…" : "Guardar producto"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl border border-stone-200 bg-white"
              aria-hidden
            />
          ))}
        </div>
      ) : error ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          role="alert"
        >
          {error}{" "}
          <button type="button" onClick={onRetry} className="font-bold underline">
            Reintentar
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {products.map((p) => {
            const style = categoryStyle(p.category);
            const priceText = (priceDrafts[p.id] ?? "").trim();
            const costText = (costDrafts[p.id] ?? "").trim();
            const draftPrice =
              priceText === "" ? null : parseSolesToCents(priceText);
            const draftCost = costText === "" ? null : parseSolesToCents(costText);
            const margin =
              draftPrice !== null && draftCost !== null
                ? draftPrice - draftCost
                : null;
            const isLow =
              p.stock !== null && p.stockMin !== null && p.stock <= p.stockMin;
            const busyRow = savingId === p.id || deletingId === p.id;
            return (
              <li
                key={p.id}
                className={`flex flex-col gap-3 rounded-xl border bg-white p-3 shadow-sm ${
                  p.active === 1
                    ? "border-stone-200"
                    : "border-dashed border-stone-300 opacity-70"
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-stone-900">
                      {displayName(p)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${style.badge}`}
                      >
                        {p.category}
                      </span>
                      {p.active !== 1 && (
                        <span className="inline-block rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-600">
                          Desactivado
                        </span>
                      )}
                      {p.stock !== null && (
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            p.stock === 0
                              ? "bg-red-100 text-red-800"
                              : isLow
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          Stock {p.stock}
                          {p.stockMin !== null ? ` / ${p.stockMin}` : ""}
                        </span>
                      )}
                    </div>
                    {canEdit && (
                      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                        <DraftInput
                          field="presentation"
                          value={draftsFor("presentation", p.id)}
                          onChange={(v) => onDraft("presentation", p.id, v)}
                          onSave={() => onSave(p.id)}
                          label="Presentación"
                          ariaLabel={`Presentación de ${p.name}`}
                        />
                        <DraftInput
                          field="image"
                          value={draftsFor("image", p.id)}
                          onChange={(v) => onDraft("image", p.id, v)}
                          onSave={() => onSave(p.id)}
                          label="Foto (URL)"
                          ariaLabel={`Foto de ${p.name}`}
                        />
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="grid grid-cols-2 gap-2 lg:w-56">
                      <DraftInput
                        field="stock"
                        value={draftsFor("stock", p.id)}
                        onChange={(v) => onDraft("stock", p.id, v)}
                        onSave={() => onSave(p.id)}
                        label="Stock"
                        ariaLabel={`Stock de ${p.name}`}
                      />
                      <DraftInput
                        field="stockMin"
                        value={draftsFor("stockMin", p.id)}
                        onChange={(v) => onDraft("stockMin", p.id, v)}
                        onSave={() => onSave(p.id)}
                        label="Mínimo"
                        ariaLabel={`Stock mínimo de ${p.name}`}
                      />
                    </div>
                  )}
                  {canEdit && (
                    <>
                      <div className="grid grid-cols-2 gap-2 lg:w-56">
                        <DraftInput
                          field="cost"
                          value={draftsFor("cost", p.id)}
                          onChange={(v) => onDraft("cost", p.id, v)}
                          onSave={() => onSave(p.id)}
                          label="Me cuesta S/"
                          ariaLabel={`Costo de ${p.name} en soles`}
                        />
                        <DraftInput
                          field="price"
                          value={draftsFor("price", p.id)}
                          onChange={(v) => onDraft("price", p.id, v)}
                          onSave={() => onSave(p.id)}
                          label="Lo vendo S/"
                          ariaLabel={`Precio de ${p.name} en soles`}
                        />
                      </div>
                      <div className="flex gap-2 lg:w-28 lg:flex-col">
                        <button
                          type="button"
                          onClick={() => onSave(p.id)}
                          disabled={busyRow}
                          className="flex-1 rounded-xl bg-red-900 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-red-950 disabled:opacity-50"
                        >
                          {savingId === p.id ? "…" : "Guardar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleActive(p.id, p.active !== 1)}
                          disabled={busyRow}
                          title={
                            p.active === 1
                              ? "Desactivar producto"
                              : "Reactivar producto"
                          }
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition disabled:opacity-50 ${
                            p.active === 1
                              ? "border-stone-300 text-stone-500 hover:border-red-900 hover:text-red-900"
                              : "border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                          }`}
                        >
                          {p.active === 1 ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                          {p.active === 1 ? "Ocultar" : "Mostrar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(p)}
                          disabled={busyRow}
                          aria-label={`Eliminar ${p.name}`}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-stone-300 px-3 py-2.5 text-xs font-bold text-stone-500 transition hover:border-red-800 hover:text-red-800 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          Eliminar
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {canEdit && margin !== null && (
                  <p
                    className={`text-xs font-bold ${margin >= 0 ? "text-emerald-700" : "text-red-700"}`}
                  >
                    {margin >= 0
                      ? `Ganas ${formatPEN(margin)} por unidad`
                      : `Pierdes ${formatPEN(-margin)} por unidad`}
                  </p>
                )}
                {rowErrors[p.id] && (
                  <p
                    className="rounded-lg bg-red-50 p-2 text-xs font-bold text-red-800"
                    role="alert"
                  >
                    {rowErrors[p.id]}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title={`Eliminar ${pendingDelete?.name ?? ""}`}
        description="Solo se puede eliminar si el producto nunca se vendió. Si ya aparece en ventas, ocúltalo en su lugar."
        busy={deleting}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
              className="rounded-xl border border-stone-300 py-3 text-sm font-bold text-stone-700 transition hover:bg-stone-100 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleting}
              className="rounded-xl bg-red-900 py-3 text-sm font-bold text-white transition hover:bg-red-950 disabled:opacity-50"
            >
              {deleting ? "Eliminando…" : "Eliminar"}
            </button>
          </div>
        }
      >
        <p className="text-sm text-stone-600">
          ¿Eliminar <strong>{pendingDelete?.name}</strong> del catálogo? Esta
          acción no se puede deshacer.
        </p>
      </Modal>
    </section>
  );
}
