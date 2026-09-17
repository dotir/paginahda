"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  Download,
  Eye,
  EyeOff,
  History,
  Minus,
  Plus,
  Printer,
  Receipt,
  Search,
  ShoppingCart,
  Smartphone,
  Store,
  Tag,
  Trash2,
  Wifi,
  WifiOff,
  Wine,
  X,
} from "lucide-react";

type Product = {
  id: number;
  name: string;
  category: string;
  presentation: string | null;
  priceCents: number | null;
  costCents: number | null;
  active: number;
};

type SaleItem = {
  productId: number;
  name: string;
  presentation: string | null;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number | null;
  totalCents: number;
};

type Sale = {
  id: number;
  createdAt: string;
  totalCents: number;
  paymentMethod: string;
  receivedCents: number | null;
  changeCents: number | null;
  items: SaleItem[];
};

type View = "ventas" | "catalogo" | "historial";
type PaymentMethod = "efectivo" | "yape";

const PAYMENT_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "efectivo", label: "Efectivo" },
  { value: "yape", label: "Yape" },
];

const CHANGE_METHODS: ReadonlySet<PaymentMethod> = new Set([
  "efectivo",
]);

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

function categoryStyle(category: string) {
  return CATEGORY_STYLES[category] ?? FALLBACK_CATEGORY;
}

const pen = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

function formatPEN(cents: number) {
  return pen.format(cents / 100);
}

function parseSolesToCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(parseFloat(normalized) * 100);
  return cents > 0 ? cents : null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function lineProfit(item: SaleItem): number | null {
  if (item.unitCostCents === null) return null;
  return (item.unitPriceCents - item.unitCostCents) * item.quantity;
}

function displayName(item: { name: string; presentation: string | null }) {
  return item.presentation ? `${item.name} (${item.presentation})` : item.name;
}

function saleProfit(sale: Sale): number | null {  let total = 0;
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

function newRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    if (data && typeof data.error === "string") return data.error;
  } catch {
    // ignorar
  }
  return `Error inesperado (HTTP ${response.status}).`;
}

export default function POSPage() {
  const [view, setView] = useState<View>("ventas");
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todas");
  const [cart, setCart] = useState<Record<number, number>>({});
  const [cartOpen, setCartOpen] = useState(false);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [received, setReceived] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Sale | null>(null);

  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({});
  const [costDrafts, setCostDrafts] = useState<Record<number, string>>({});
  const [presentationDrafts, setPresentationDrafts] = useState<Record<number, string>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newPresentation, setNewPresentation] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newCost, setNewCost] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [savingPriceId, setSavingPriceId] = useState<number | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestIdRef = useRef(newRequestId());
  const lastSigRef = useRef("");

  async function loadProducts() {
    setProductsLoading(true);
    setProductsError(null);
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as Product[];
      setProducts(data);
      setConnected(true);
      setPriceDrafts((prev) => {
        const next = { ...prev };
        for (const p of data) {
          if (!(p.id in next)) {
            next[p.id] = p.priceCents === null ? "" : (p.priceCents / 100).toFixed(2);
          }
        }
        return next;
      });
      setCostDrafts((prev) => {
        const next = { ...prev };
        for (const p of data) {
          if (!(p.id in next)) {
            next[p.id] = p.costCents === null ? "" : (p.costCents / 100).toFixed(2);
          }
        }
        return next;
      });
      setPresentationDrafts((prev) => {
        const next = { ...prev };
        for (const p of data) {
          if (!(p.id in next)) {
            next[p.id] = p.presentation ?? "";
          }
        }
        return next;
      });
    } catch (error) {
      setProductsError(
        error instanceof Error ? error.message : "No se pudo cargar el catálogo.",
      );
      setConnected(false);
    } finally {
      setProductsLoading(false);
    }
  }

  async function loadSales() {
    setSalesLoading(true);
    setSalesError(null);
    try {
      const res = await fetch("/api/sales", { cache: "no-store" });
      if (!res.ok) throw new Error(await readError(res));
      setSales((await res.json()) as Sale[]);
    } catch (error) {
      setSalesError(
        error instanceof Error ? error.message : "No se pudo cargar el historial.",
      );
    } finally {
      setSalesLoading(false);
    }
  }

  useEffect(() => {
    // Carga inicial de datos al montar: patrón estándar de fetch en efectos.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProducts();
    loadSales();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (checkoutOpen && !dialog.open) {
      dialog.showModal();
    } else if (!checkoutOpen && dialog.open) {
      dialog.close();
    }
  }, [checkoutOpen]);

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category));
    return ["Todas", ...Array.from(set)];
  }, [products]);

  const activeCategories = useMemo(() => {
    const set = new Set(
      products.filter((p) => p.active === 1).map((p) => p.category),
    );
    return ["Todas", ...Array.from(set)];
  }, [products]);

  const activeCount = useMemo(
    () => products.filter((p) => p.active === 1).length,
    [products],
  );

  const pricedCount = useMemo(
    () => products.filter((p) => p.active === 1 && p.priceCents !== null).length,
    [products],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((p) => {
      if (p.active !== 1) return false;
      if (category !== "Todas" && p.category !== category) return false;
      if (
        term &&
        !`${p.name} ${p.category} ${p.presentation ?? ""}`.toLowerCase().includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [products, search, category]);

  const productById = useMemo(() => {
    const map = new Map<number, Product>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  const cartLines = useMemo(() => {
    const lines: Array<{ product: Product; qty: number; lineTotal: number }> = [];
    for (const [key, qty] of Object.entries(cart)) {
      const product = productById.get(Number(key));
      if (!product || product.active !== 1) continue;
      if (product.priceCents === null || qty <= 0) continue;
      lines.push({ product, qty, lineTotal: product.priceCents * qty });
    }
    return lines.sort((a, b) => a.product.name.localeCompare(b.product.name));
  }, [cart, productById]);

  const cartTotal = useMemo(
    () => cartLines.reduce((sum, line) => sum + line.lineTotal, 0),
    [cartLines],
  );
  const cartCount = useMemo(
    () => cartLines.reduce((sum, line) => sum + line.qty, 0),
    [cartLines],
  );
  const cartSig = useMemo(
    () =>
      JSON.stringify(
        Object.entries(cart)
          .map(([k, v]) => [Number(k), v] as const)
          .sort((a, b) => a[0] - b[0]),
      ),
    [cart],
  );

  const receivedCents = parseSolesToCents(received);
  const needsReceived = CHANGE_METHODS.has(method);
  const shortfall =
    needsReceived && receivedCents !== null && receivedCents < cartTotal;

  const todayKey = new Date().toLocaleDateString("es-PE");
  const todaySales = useMemo(
    () =>
      sales.filter(
        (s) => new Date(s.createdAt).toLocaleDateString("es-PE") === todayKey,
      ),
    [sales, todayKey],
  );
  const todayTotal = useMemo(
    () => todaySales.reduce((sum, s) => sum + s.totalCents, 0),
    [todaySales],
  );

  function addToCart(id: number) {
    setCart((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  }

  function changeQty(id: number, delta: number) {
    setCart((prev) => {
      const next = { ...prev };
      const qty = (next[id] ?? 0) + delta;
      if (qty <= 0) delete next[id];
      else next[id] = Math.min(qty, 999);
      return next;
    });
  }

  function removeLine(id: number) {
    setCart((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function openCheckout() {
    if (cartLines.length === 0) return;
    setTicket(null);
    setCheckoutError(null);
    setMethod("efectivo");
    setReceived("");
    setCheckoutOpen(true);
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function handleDialogClose() {
    setCheckoutOpen(false);
    setTicket(null);
    setCheckoutError(null);
    setSubmitting(false);
  }

  async function submitSale() {
    if (submitting || cartLines.length === 0) return;
    if (cartSig !== lastSigRef.current) {
      requestIdRef.current = newRequestId();
      lastSigRef.current = cartSig;
    }
    const payloadReceived = needsReceived ? (receivedCents ?? NaN) : null;
    if (needsReceived && (receivedCents === null || shortfall)) return;

    setSubmitting(true);
    setCheckoutError(null);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: requestIdRef.current,
          items: cartLines.map((line) => ({
            productId: line.product.id,
            quantity: line.qty,
          })),
          paymentMethod: method,
          receivedCents: payloadReceived,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const sale = (await res.json()) as Sale;
      setTicket(sale);
      setCart({});
      setCartOpen(false);
      lastSigRef.current = "";
      requestIdRef.current = newRequestId();
      loadSales();
    } catch (error) {
      setCheckoutError(
        error instanceof Error ? error.message : "No se pudo registrar la venta.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function openTicket(sale: Sale) {
    setCheckoutError(null);
    setTicket(sale);
    setCheckoutOpen(true);
  }

  async function saveProduct(id: number) {
    const priceRaw = (priceDrafts[id] ?? "").trim();
    const costRaw = (costDrafts[id] ?? "").trim();
    const presRaw = (presentationDrafts[id] ?? "").trim();
    if (priceRaw === "" && costRaw === "" && presRaw === "") {
      setPriceError("Ingresa al menos presentación, costo o precio.");
      return;
    }
    const price = priceRaw === "" ? undefined : parseSolesToCents(priceRaw);
    const cost = costRaw === "" ? undefined : parseSolesToCents(costRaw);
    if (price === null || cost === null) {
      setPriceError("Revisa los montos: deben ser mayores a S/ 0.00 (ej. 15.00).");
      return;
    }
    if (presRaw.length > 40) {
      setPriceError("La presentación debe tener máximo 40 caracteres.");
      return;
    }
    setSavingPriceId(id);
    setPriceError(null);
    try {
      const body: { id: number; priceCents?: number; costCents?: number; presentation?: string } = { id };
      if (price !== undefined) body.priceCents = price;
      if (cost !== undefined) body.costCents = cost;
      if (presRaw !== "") body.presentation = presRaw;
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as Product[];
      setProducts(data);
      setConnected(true);
    } catch (error) {
      setPriceError(
        error instanceof Error ? error.message : "No se pudo guardar.",
      );
    } finally {
      setSavingPriceId(null);
    }
  }

  async function toggleActive(id: number, next: boolean) {
    setSavingPriceId(id);
    setPriceError(null);
    try {
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active: next }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setProducts((await res.json()) as Product[]);
      setConnected(true);
    } catch (error) {
      setPriceError(
        error instanceof Error ? error.message : "No se pudo actualizar.",
      );
    } finally {
      setSavingPriceId(null);
    }
  }

  async function submitNewProduct() {
    const name = newName.trim();
    const cat = newCategory.trim();
    const pres = newPresentation.trim();
    if (name === "" || cat === "") {
      setAddError("Ponle nombre y categoría al producto.");
      return;
    }
    if (pres.length > 40) {
      setAddError("La presentación debe tener máximo 40 caracteres.");
      return;
    }
    const price = newPrice.trim() === "" ? undefined : parseSolesToCents(newPrice.trim());
    const cost = newCost.trim() === "" ? undefined : parseSolesToCents(newCost.trim());
    if (price === null || cost === null) {
      setAddError("Revisa los montos: deben ser mayores a S/ 0.00.");
      return;
    }
    setSavingNew(true);
    setAddError(null);
    try {
      const body: { name: string; category: string; presentation?: string; priceCents?: number; costCents?: number } = {
        name,
        category: cat,
      };
      if (pres !== "") body.presentation = pres;
      if (price !== undefined) body.priceCents = price;
      if (cost !== undefined) body.costCents = cost;
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as Product[];
      setProducts(data);
      const created = data.find((p) => p.name === name);
      if (created) {
        setPriceDrafts((prev) => ({
          ...prev,
          [created.id]:
            created.priceCents === null ? "" : (created.priceCents / 100).toFixed(2),
        }));
        setCostDrafts((prev) => ({
          ...prev,
          [created.id]:
            created.costCents === null ? "" : (created.costCents / 100).toFixed(2),
        }));
        setPresentationDrafts((prev) => ({
          ...prev,
          [created.id]: created.presentation ?? "",
        }));
      }
      setNewName("");
      setNewCategory("");
      setNewPresentation("");
      setNewPrice("");
      setNewCost("");
      setShowAddForm(false);
      setConnected(true);
    } catch (error) {
      setAddError(
        error instanceof Error ? error.message : "No se pudo agregar.",
      );
    } finally {
      setSavingNew(false);
    }
  }

  function paymentIcon(value: string) {
    if (value === "yape") return <Smartphone className="h-4 w-4" />;
    return <Banknote className="h-4 w-4" />;
  }

  function paymentLabel(value: string) {
    return PAYMENT_OPTIONS.find((o) => o.value === value)?.label ?? value;
  }

  const todayProfit = useMemo(() => {
    let total = 0;
    let known = false;
    for (const sale of todaySales) {
      const profit = saleProfit(sale);
      if (profit !== null) {
        total += profit;
        known = true;
      }
    }
    return known ? total : null;
  }, [todaySales]);

  function downloadDailyReport() {
    if (todaySales.length === 0) return;
    const dec = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
    const rows: string[] = [
      "Venta;Fecha;Hora;Método de pago;Producto;Presentación;Cantidad;Precio unit. (S/);Subtotal (S/);Costo unit. (S/);Ganancia (S/)",
    ];
    const ordered = [...todaySales].sort((a, b) => a.id - b.id);
    let dayTotal = 0;
    let dayProfit = 0;
    let profitKnown = false;
    for (const sale of ordered) {
      const date = new Date(sale.createdAt);
      const fecha = date.toLocaleDateString("es-PE");
      const hora = date.toLocaleTimeString("es-PE", {
        hour: "2-digit",
        minute: "2-digit",
      });
      dayTotal += sale.totalCents;
      for (const item of sale.items) {
        const profit = lineProfit(item);
        if (profit !== null) {
          dayProfit += profit;
          profitKnown = true;
        }
        rows.push(
          [
            sale.id,
            fecha,
            hora,
            paymentLabel(sale.paymentMethod),
            `"${item.name.replace(/"/g, '""')}"`,
            item.presentation
              ? `"${item.presentation.replace(/"/g, '""')}"`
              : "—",
            item.quantity,
            dec(item.unitPriceCents),
            dec(item.totalCents),
            item.unitCostCents === null ? "—" : dec(item.unitCostCents),
            profit === null ? "—" : dec(profit),
          ].join(";"),
        );
      }
    }
    rows.push("");
    rows.push(`RESUMEN DEL DÍA ${todayKey};Ventas: ${ordered.length}`);
    rows.push(`Total vendido (S/);${dec(dayTotal)}`);
    rows.push(
      `Ganancia (S/);${profitKnown ? dec(dayProfit) : "— (registra los costos en Catálogo)"}`,
    );
    const blob = new Blob(["\uFEFF" + rows.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const now = new Date();
    const stamp = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
      .map((n) => String(n).padStart(2, "0"))
      .join("-");
    link.download = `reporte-ventas-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const navItems: Array<{ value: View; label: string; icon: React.ReactNode }> = [
    { value: "ventas", label: "Ventas", icon: <ShoppingCart className="h-5 w-5" /> },
    { value: "catalogo", label: "Catálogo", icon: <Tag className="h-5 w-5" /> },
    { value: "historial", label: "Historial", icon: <History className="h-5 w-5" /> },
  ];

  const cartPanel = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900">
          <ShoppingCart className="h-5 w-5 text-red-900" />
          Venta actual
          {cartCount > 0 && (
            <span className="rounded-full bg-red-900 px-2 py-0.5 text-xs font-bold text-white">
              {cartCount}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-1">
          {cartLines.length > 0 && (
            <button
              type="button"
              onClick={() => setCart({})}
              className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-red-800"
              title="Vaciar carrito"
              aria-label="Vaciar carrito"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setCartOpen(false)}
            className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 lg:hidden"
            aria-label="Cerrar carrito"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {cartLines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Wine className="h-10 w-10 text-stone-300" />
            <p className="text-sm text-stone-500">
              Toca un producto para agregarlo a la venta.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {cartLines.map((line) => (
              <li
                key={line.product.id}
                className="rounded-xl border border-stone-200 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-stone-900">
                    {displayName(line.product)}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeLine(line.product.id)}
                    className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-800"
                    aria-label={`Quitar ${displayName(line.product)}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-0.5 text-xs text-stone-500">
                  {formatPEN(line.product.priceCents ?? 0)} c/u
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => changeQty(line.product.id, -1)}
                      className="rounded-lg border border-stone-300 p-1.5 text-stone-700 hover:bg-stone-100"
                      aria-label="Disminuir cantidad"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold">
                      {line.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => changeQty(line.product.id, 1)}
                      className="rounded-lg border border-stone-300 p-1.5 text-stone-700 hover:bg-stone-100"
                      aria-label="Aumentar cantidad"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-sm font-bold text-red-900">
                    {formatPEN(line.lineTotal)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-stone-200 px-4 py-4">
        <div className="flex items-center justify-between text-lg font-bold text-stone-900">
          <span>Total</span>
          <span>{formatPEN(cartTotal)}</span>
        </div>
        <button
          type="button"
          onClick={openCheckout}
          disabled={cartLines.length === 0}
          className="mt-3 w-full rounded-xl bg-red-900 py-3 text-base font-bold text-white shadow hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Cobrar {cartTotal > 0 && formatPEN(cartTotal)}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-full flex-col">
      <header className="no-print border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-900 text-amber-100 shadow">
              <Wine className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-stone-900">
                El Arbolito
              </h1>
              <p className="text-xs text-stone-500">
                Punto de venta · Distribuidor independiente
              </p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold ${
                connected === false
                  ? "bg-red-100 text-red-900"
                  : "bg-emerald-100 text-emerald-900"
              }`}
              role="status"
            >
              {connected === false ? (
                <WifiOff className="h-3.5 w-3.5" />
              ) : (
                <Wifi className="h-3.5 w-3.5" />
              )}
              {connected === false ? "Sin conexión" : "En línea"}
            </span>
            <span className="rounded-full bg-stone-100 px-3 py-1.5 font-semibold text-stone-700">
              {activeCount} productos · {pricedCount} con precio
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 pb-28 pt-4 lg:pb-8">
        <aside className="no-print hidden w-56 shrink-0 lg:block">
          <nav
            className="sticky top-4 flex flex-col gap-1 rounded-2xl border border-stone-200 bg-white p-2 shadow-sm"
            aria-label="Navegación principal"
          >
            {navItems.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setView(item.value)}
                aria-current={view === item.value ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  view === item.value
                    ? "bg-red-900 text-white shadow"
                    : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            Negocio independiente. No es tienda oficial de la bodega Hacienda
            del Abuelo.
          </p>
        </aside>

        <main className="min-w-0 flex-1">
          {view === "ventas" && (
            <div className="flex gap-6">
              <section className="min-w-0 flex-1" aria-label="Catálogo de venta">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <label className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar vino o pisco…"
                      className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm outline-none placeholder:text-stone-400 focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
                    />
                  </label>
                  <div
                    className="flex gap-2 overflow-x-auto pb-1"
                    role="group"
                    aria-label="Filtrar por categoría"
                  >
                    {activeCategories.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCategory(c)}
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

                {productsError && (
                  <div
                    className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
                    role="alert"
                  >
                    <p className="font-semibold">No se pudo cargar el catálogo.</p>
                    <p className="mt-1">{productsError}</p>
                    <button
                      type="button"
                      onClick={loadProducts}
                      className="mt-2 rounded-lg bg-red-900 px-4 py-2 text-xs font-bold text-white hover:bg-red-950"
                    >
                      Reintentar
                    </button>
                  </div>
                )}

                {!productsLoading && !productsError && pricedCount === 0 && (
                  <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                    <p className="font-semibold">Aún no hay precios de venta.</p>
                    <p className="mt-1">
                      Ve a la pestaña{" "}
                      <button
                        type="button"
                        onClick={() => setView("catalogo")}
                        className="font-bold underline"
                      >
                        Catálogo
                      </button>{" "}
                      y registra tus precios para empezar a vender.
                    </p>
                  </div>
                )}

                {productsLoading ? (
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
                    {filtered.length === 0 && !productsError && (
                      <div className="mt-4 rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
                        Sin resultados para esa búsqueda.
                      </div>
                    )}
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                      {filtered.map((p) => {
                        const style = categoryStyle(p.category);
                        const qty = cart[p.id] ?? 0;
                        const enabled = p.priceCents !== null;
                        return (
                          <article
                            key={p.id}
                            className={`flex flex-col rounded-2xl border bg-white p-3 shadow-sm transition ${
                              enabled
                                ? "border-stone-200 hover:border-red-900/40 hover:shadow-md"
                                : "border-dashed border-stone-300 opacity-75"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <span
                                className="bottle mt-1"
                                style={{ "--bottle": style.bottle } as React.CSSProperties}
                                aria-hidden
                              >
                                <span className="bottle-body" />
                              </span>
                              <div className="min-w-0">
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
                              </div>
                            </div>
                            <div className="mt-auto pt-3">
                              {enabled ? (
                                <p className="text-lg font-extrabold text-red-900">
                                  {formatPEN(p.priceCents as number)}
                                </p>
                              ) : (
                                <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
                                  Precio pendiente
                                </p>
                              )}
                              {qty === 0 ? (
                                <button
                                  type="button"
                                  onClick={() => addToCart(p.id)}
                                  disabled={!enabled}
                                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-red-900 py-2.5 text-sm font-bold text-white hover:bg-red-950 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400"
                                >
                                  <Plus className="h-4 w-4" />
                                  Agregar
                                </button>
                              ) : (
                                <div className="mt-2 flex items-center justify-between rounded-xl bg-red-50 p-1">
                                  <button
                                    type="button"
                                    onClick={() => changeQty(p.id, -1)}
                                    className="rounded-lg bg-white p-2 text-red-900 shadow-sm hover:bg-red-100"
                                    aria-label={`Quitar uno de ${p.name}`}
                                  >
                                    <Minus className="h-4 w-4" />
                                  </button>
                                  <span className="text-sm font-extrabold text-red-900">
                                    {qty} en venta
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => changeQty(p.id, 1)}
                                    className="rounded-lg bg-white p-2 text-red-900 shadow-sm hover:bg-red-100"
                                    aria-label={`Agregar uno de ${p.name}`}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </>
                )}
              </section>

              <aside
                className="hidden w-80 shrink-0 lg:block"
                aria-label="Venta actual"
              >
                <div className="sticky top-4 h-[calc(100vh-10rem)] overflow-hidden rounded-2xl border border-stone-200 bg-[#fffdf8] shadow-sm">
                  {cartPanel}
                </div>
              </aside>
            </div>
          )}

          {view === "catalogo" && (
            <section aria-label="Gestión de catálogo">
              <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
                <h2 className="flex items-center gap-2 text-lg font-extrabold text-stone-900">
                  <Store className="h-5 w-5 text-red-900" />
                  Catálogo, costos y precios
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  Anota a cuánto te cuesta cada producto y a cuánto lo vendes.
                  Solo los productos activos y con precio aparecen habilitados
                  para la venta.
                </p>
              </div>

              {!showAddForm ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(true);
                    setAddError(null);
                  }}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-red-900 py-3 text-sm font-bold text-white hover:bg-red-950"
                >
                  <Plus className="h-4 w-4" />
                  Agregar producto
                </button>
              ) : (
                <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-extrabold text-stone-900">
                    Nuevo producto
                  </h3>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-xs font-bold text-stone-500">
                      Nombre
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Ej. Vino Tinto Reserva"
                        maxLength={120}
                        className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-normal text-stone-900 outline-none placeholder:text-stone-400 focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-bold text-stone-500">
                      Categoría
                      <input
                        type="text"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
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
                        value={newPresentation}
                        onChange={(e) => setNewPresentation(e.target.value)}
                        placeholder="Ej. Descartable 1 L, Botella 750 ml"
                        maxLength={40}
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
                        value={newCost}
                        onChange={(e) => setNewCost(e.target.value)}
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
                        value={newPrice}
                        onChange={(e) => setNewPrice(e.target.value)}
                        placeholder="0.00"
                        className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-bold text-stone-900 outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
                      />
                    </label>
                  </div>
                  {addError && (
                    <p className="mt-2 rounded-lg bg-red-50 p-2 text-center text-sm font-bold text-red-800" role="alert">
                      {addError}
                    </p>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      disabled={savingNew}
                      className="rounded-xl border border-stone-300 py-2.5 text-sm font-bold text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={submitNewProduct}
                      disabled={savingNew}
                      className="rounded-xl bg-red-900 py-2.5 text-sm font-bold text-white hover:bg-red-950 disabled:opacity-50"
                    >
                      {savingNew ? "Guardando…" : "Guardar producto"}
                    </button>
                  </div>
                </div>
              )}

              {priceError && (
                <div
                  className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900"
                  role="alert"
                >
                  {priceError}
                </div>
              )}

              {productsLoading ? (
                <div className="mt-3 flex flex-col gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-16 animate-pulse rounded-xl border border-stone-200 bg-white"
                      aria-hidden
                    />
                  ))}
                </div>
              ) : productsError ? (
                <div
                  className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
                  role="alert"
                >
                  {productsError}{" "}
                  <button
                    type="button"
                    onClick={loadProducts}
                    className="font-bold underline"
                  >
                    Reintentar
                  </button>
                </div>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {products.map((p) => {
                    const style = categoryStyle(p.category);
                    const priceText = (priceDrafts[p.id] ?? "").trim();
                    const costText = (costDrafts[p.id] ?? "").trim();
                    const draftPrice =
                      priceText === "" ? null : parseSolesToCents(priceText);
                    const draftCost =
                      costText === "" ? null : parseSolesToCents(costText);
                    const margin =
                      draftPrice !== null && draftCost !== null
                        ? draftPrice - draftCost
                        : null;
                    return (
                      <li
                        key={p.id}
                        className={`flex flex-col gap-3 rounded-xl border bg-white p-3 shadow-sm ${
                          p.active === 1
                            ? "border-stone-200"
                            : "border-dashed border-stone-300 opacity-70"
                        }`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-stone-900">
                              {p.name}
                            </p>
                            <span
                              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${style.badge}`}
                            >
                              {p.category}
                            </span>
                            {p.active !== 1 && (
                              <span className="ml-1 mt-1 inline-block rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-600">
                                Desactivado
                              </span>
                            )}
                            <input
                              type="text"
                              value={presentationDrafts[p.id] ?? ""}
                              onChange={(e) =>
                                setPresentationDrafts((prev) => ({
                                  ...prev,
                                  [p.id]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveProduct(p.id);
                              }}
                              placeholder="Presentación (ej. Descartable 1 L)"
                              maxLength={40}
                              aria-label={`Presentación de ${p.name}`}
                              className="mt-2 w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs text-stone-600 outline-none placeholder:text-stone-400 focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
                            />
                          </div>
                          <div className="grid grid-cols-2 items-center gap-2">
                            <label className="relative">
                              <span className="pointer-events-none absolute -top-2 left-3 rounded bg-white px-1 text-[10px] font-bold uppercase tracking-wide text-stone-400">
                                Me cuesta S/
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={costDrafts[p.id] ?? ""}
                                onChange={(e) =>
                                  setCostDrafts((prev) => ({
                                    ...prev,
                                    [p.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveProduct(p.id);
                                }}
                                placeholder="0.00"
                                aria-label={`Costo de ${p.name} en soles`}
                                className="w-full rounded-xl border border-stone-300 py-2.5 pl-3 pr-3 text-sm font-bold outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
                              />
                            </label>
                            <label className="relative">
                              <span className="pointer-events-none absolute -top-2 left-3 rounded bg-white px-1 text-[10px] font-bold uppercase tracking-wide text-stone-400">
                                Lo vendo S/
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={priceDrafts[p.id] ?? ""}
                                onChange={(e) =>
                                  setPriceDrafts((prev) => ({
                                    ...prev,
                                    [p.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveProduct(p.id);
                                }}
                                placeholder="0.00"
                                aria-label={`Precio de ${p.name} en soles`}
                                className="w-full rounded-xl border border-stone-300 py-2.5 pl-3 pr-3 text-sm font-bold outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
                              />
                            </label>
                          </div>
                          <div className="flex gap-2 sm:w-auto sm:flex-col">
                            <button
                              type="button"
                              onClick={() => saveProduct(p.id)}
                              disabled={savingPriceId === p.id}
                              className="flex-1 rounded-xl bg-red-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-950 disabled:opacity-50 sm:w-28"
                            >
                              {savingPriceId === p.id ? "…" : "Guardar"}
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleActive(p.id, p.active !== 1)}
                              disabled={savingPriceId === p.id}
                              title={p.active === 1 ? "Desactivar producto" : "Reactivar producto"}
                              aria-label={`${p.active === 1 ? "Desactivar" : "Reactivar"} ${p.name}`}
                              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold disabled:opacity-50 sm:w-28 ${
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
                          </div>
                        </div>
                        {margin !== null && (
                          <p
                            className={`text-xs font-bold ${margin >= 0 ? "text-emerald-700" : "text-red-700"}`}
                          >
                            {margin >= 0
                              ? `Ganas ${formatPEN(margin)} por unidad`
                              : `Pierdes ${formatPEN(-margin)} por unidad`}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {view === "historial" && (
            <section aria-label="Historial de ventas">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
                    Ventas de hoy
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-stone-900">
                    {todaySales.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-red-900 p-4 text-white shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-red-200">
                    Total de hoy
                  </p>
                  <p className="mt-1 text-2xl font-extrabold">
                    {formatPEN(todayTotal)}
                  </p>
                </div>
                <div className="col-span-2 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:col-span-1">
                  <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
                    Ganancia de hoy
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-emerald-700">
                    {todayProfit === null ? "—" : formatPEN(todayProfit)}
                  </p>
                  {todayProfit === null && todaySales.length > 0 && (
                    <p className="mt-1 text-[11px] text-stone-500">
                      Registra los costos en Catálogo para verla.
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={downloadDailyReport}
                disabled={todaySales.length === 0}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-red-900 bg-white py-3 text-sm font-bold text-red-900 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-400 disabled:hover:bg-white"
              >
                <Download className="h-4 w-4" />
                Descargar reporte del día (CSV)
              </button>

              {salesError && (
                <div
                  className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
                  role="alert"
                >
                  {salesError}{" "}
                  <button
                    type="button"
                    onClick={loadSales}
                    className="font-bold underline"
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {salesLoading ? (
                <div className="mt-3 flex flex-col gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-20 animate-pulse rounded-xl border border-stone-200 bg-white"
                      aria-hidden
                    />
                  ))}
                </div>
              ) : sales.length === 0 && !salesError ? (
                <div className="mt-3 rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
                  <Receipt className="mx-auto h-10 w-10 text-stone-300" />
                  <p className="mt-2 text-sm font-semibold text-stone-600">
                    Aún no hay ventas registradas.
                  </p>
                </div>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {sales.map((sale) => (
                    <li
                      key={sale.id}
                      className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-stone-900 px-2.5 py-1 text-xs font-extrabold text-white">
                          #{sale.id}
                        </span>
                        <span className="text-xs text-stone-500">
                          {formatDate(sale.createdAt)}
                        </span>
                        <span className="flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-700">
                          {paymentIcon(sale.paymentMethod)}
                          {paymentLabel(sale.paymentMethod)}
                        </span>
                        {saleProfit(sale) !== null && (
                          <span
                            className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-900"
                            title="Ganancia de esta venta"
                          >
                            +{formatPEN(saleProfit(sale) ?? 0)}
                          </span>
                        )}
                        <span className="ml-auto text-base font-extrabold text-red-900">
                          {formatPEN(sale.totalCents)}
                        </span>
                      </div>
                      <details className="mt-2 text-sm">
                        <summary className="cursor-pointer text-xs font-bold text-stone-500 hover:text-red-900">
                          Ver {sale.items.length}{" "}
                          {sale.items.length === 1 ? "producto" : "productos"}
                        </summary>
                        <ul className="mt-2 flex flex-col gap-1 border-t border-stone-100 pt-2">
                          {sale.items.map((item, i) => (
                            <li
                              key={`${sale.id}-${i}`}
                              className="flex items-center justify-between gap-2 text-xs text-stone-600"
                            >
                              <span>
                                {item.quantity} × {displayName(item)}
                              </span>
                              <span className="font-bold">
                                {formatPEN(item.totalCents)}
                              </span>
                            </li>
                          ))}
                          {sale.receivedCents !== null && (
                            <>
                              <li className="flex items-center justify-between gap-2 text-xs text-stone-600">
                                <span>Recibido</span>
                                <span>{formatPEN(sale.receivedCents)}</span>
                              </li>
                              <li className="flex items-center justify-between gap-2 text-xs font-bold text-stone-800">
                                <span>Vuelto</span>
                                <span>{formatPEN(sale.changeCents ?? 0)}</span>
                              </li>
                            </>
                          )}
                        </ul>
                      </details>
                      <button
                        type="button"
                        onClick={() => openTicket(sale)}
                        className="mt-2 flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-700 hover:border-red-900 hover:text-red-900"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Ver ticket
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </main>
      </div>

      <button
        type="button"
        onClick={() => setCartOpen(true)}
        className="no-print fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full bg-red-900 px-5 py-3.5 text-sm font-bold text-white shadow-xl hover:bg-red-950 lg:hidden"
        aria-label={`Abrir venta actual, ${cartCount} productos`}
      >
        <ShoppingCart className="h-5 w-5" />
        {formatPEN(cartTotal)}
        {cartCount > 0 && (
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-extrabold text-red-900">
            {cartCount}
          </span>
        )}
      </button>

      {cartOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Venta actual">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setCartOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-[#fffdf8] shadow-2xl">
            {cartPanel}
          </div>
        </div>
      )}

      <nav
        className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 backdrop-blur lg:hidden"
        aria-label="Navegación principal"
      >
        <div className="grid grid-cols-3">
          {navItems.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setView(item.value)}
              aria-current={view === item.value ? "page" : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-bold ${
                view === item.value ? "text-red-900" : "text-stone-400"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <dialog
        ref={dialogRef}
        onClose={handleDialogClose}
        aria-label={ticket ? "Ticket de venta" : "Cobrar venta"}
        className="w-[calc(100%-2rem)] max-w-md rounded-2xl p-0 shadow-2xl backdrop:bg-transparent"
      >
        {ticket ? (
          <div className="ticket-print max-h-[85vh] overflow-y-auto bg-white p-6">
            <div className="text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-900 text-amber-100">
                <Wine className="h-7 w-7" />
              </span>
              <h2 className="mt-2 text-xl font-extrabold text-stone-900">
                El Arbolito
              </h2>
              <p className="text-xs text-stone-500">Distribuidor independiente</p>
              <p className="mt-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-900">
                Comprobante interno · No válido como comprobante fiscal
              </p>
              <p className="mt-2 text-sm text-stone-500">
                Venta #{ticket.id} · {formatDate(ticket.createdAt)}
              </p>
            </div>
            <ul className="mt-4 flex flex-col gap-2 border-t border-dashed border-stone-300 pt-4">
              {ticket.items.map((item, i) => (
                <li key={i} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-stone-900">
                      {item.quantity} × {displayName(item)}
                    </span>
                    <span className="font-bold">{formatPEN(item.totalCents)}</span>
                  </div>
                  <p className="text-xs text-stone-500">
                    {formatPEN(item.unitPriceCents)} c/u
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-dashed border-stone-300 pt-3 text-sm">
              <div className="flex items-center justify-between text-lg font-extrabold text-stone-900">
                <span>Total</span>
                <span>{formatPEN(ticket.totalCents)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-stone-600">
                <span>Pago con {paymentLabel(ticket.paymentMethod)}</span>
              </div>
              {ticket.receivedCents !== null && (
                <>
                  <div className="flex items-center justify-between text-stone-600">
                    <span>Recibido</span>
                    <span>{formatPEN(ticket.receivedCents)}</span>
                  </div>
                  <div className="flex items-center justify-between font-bold text-stone-900">
                    <span>Vuelto</span>
                    <span>{formatPEN(ticket.changeCents ?? 0)}</span>
                  </div>
                </>
              )}
            </div>
            <p className="mt-4 text-center text-xs text-stone-400">
              Gracias por su compra · Vinos y piscos Hacienda del Abuelo
            </p>
            <div className="no-print mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                autoFocus
                className="flex items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-sm font-bold text-white hover:bg-stone-700"
              >
                <Printer className="h-4 w-4" />
                Imprimir
              </button>
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-xl border border-stone-300 py-3 text-sm font-bold text-stone-700 hover:bg-stone-100"
              >
                Nueva venta
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-stone-900">
                Cobrar venta
              </h2>
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"
                aria-label="Cerrar cobro"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-2 rounded-xl bg-red-50 p-3 text-center">
              <p className="text-xs font-bold uppercase tracking-wide text-red-800">
                Total a cobrar
              </p>
              <p className="text-3xl font-extrabold text-red-900">
                {formatPEN(cartTotal)}
              </p>
              <p className="text-xs text-red-800">
                {cartCount} {cartCount === 1 ? "producto" : "productos"}
              </p>
            </div>

            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-stone-500">
              Método de pago
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Método de pago">
              {PAYMENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={method === option.value}
                  onClick={() => {
                    setMethod(option.value);
                    setCheckoutError(null);
                  }}
                  className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 text-xs font-bold transition ${
                    method === option.value
                      ? "border-red-900 bg-red-50 text-red-900"
                      : "border-stone-200 text-stone-500 hover:border-stone-300"
                  }`}
                >
                  {paymentIcon(option.value)}
                  {option.label}
                </button>
              ))}
            </div>

            {needsReceived && (
              <div className="mt-4">
                <label
                  htmlFor="received"
                  className="text-xs font-bold uppercase tracking-wide text-stone-500"
                >
                  Monto recibido (S/)
                </label>
                <input
                  id="received"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={received}
                  onChange={(e) => {
                    setReceived(e.target.value);
                    setCheckoutError(null);
                  }}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-xl border border-stone-300 px-4 py-3 text-lg font-bold outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
                />
                {receivedCents !== null && !shortfall && (
                  <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-center text-sm font-bold text-emerald-800">
                    Vuelto: {formatPEN(receivedCents - cartTotal)}
                  </p>
                )}
                {shortfall && (
                  <p className="mt-2 rounded-lg bg-red-50 p-2 text-center text-sm font-bold text-red-800" role="alert">
                    Faltan {formatPEN(cartTotal - (receivedCents ?? 0))}
                  </p>
                )}
              </div>
            )}

            {checkoutError && (
              <p
                className="mt-3 rounded-lg bg-red-50 p-3 text-center text-sm font-bold text-red-800"
                role="alert"
              >
                {checkoutError}
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeDialog}
                disabled={submitting}
                className="rounded-xl border border-stone-300 py-3 text-sm font-bold text-stone-700 hover:bg-stone-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitSale}
                disabled={
                  submitting ||
                  (needsReceived && (receivedCents === null || shortfall))
                }
                className="rounded-xl bg-red-900 py-3 text-sm font-bold text-white hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? "Registrando…" : "Confirmar venta"}
              </button>
            </div>
            <p className="mt-3 text-center text-[11px] text-stone-400">
              El total se calcula en el servidor con tus precios registrados.
            </p>
          </div>
        )}
      </dialog>
    </div>
  );
}
