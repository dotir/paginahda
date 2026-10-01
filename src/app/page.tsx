"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Boxes,
  History,
  LogOut,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tag,
  Wallet,
  Wifi,
  WifiOff,
  Wine,
} from "lucide-react";
import AdminView from "@/app/components/AdminView";
import CartPanel, { buildCartEntries } from "@/app/components/CartPanel";
import CashView from "@/app/components/CashView";
import CatalogView, {
  type DraftField,
  type NewProductDraft,
} from "@/app/components/CatalogView";
import CheckoutDialog, {
  type CheckoutPayload,
} from "@/app/components/CheckoutDialog";
import HistoryView from "@/app/components/HistoryView";
import MoveDateDialog from "@/app/components/MoveDateDialog";
import InventoryView from "@/app/components/InventoryView";
import SalesView from "@/app/components/SalesView";
import TicketDialog from "@/app/components/TicketDialog";
import VoidDialog from "@/app/components/VoidDialog";
import { useToast } from "@/app/components/Toast";
import {
  getCartServerSnapshot,
  getCartSnapshot,
  parseCart,
  subscribeCart,
  writeCart,
} from "@/app/lib/cartStore";
import {
  endOfDayIso,
  formatPEN,
  parseSolesToCents,
  roleLabel,
  saleProfit,
  startOfDayIso,
  toLocalDateInput,
  type AuditEntry,
  type CashSession,
  type PosUser,
  type Product,
  type ReceiptResult,
  type Role,
  type Sale,
  type StockMovement,
  type View,
} from "@/app/lib/ui";

/** Cada cuánto se refresca solo el POS, en milisegundos. */
const POLL_MS = 45_000;

const EMPTY_NEW_PRODUCT: NewProductDraft = {
  name: "",
  category: "",
  presentation: "",
  image: "",
  price: "",
  cost: "",
};

const NAV_ITEMS: Array<{ value: View; label: string; icon: React.ReactNode }> = [
  { value: "ventas", label: "Ventas", icon: <ShoppingCart className="h-5 w-5" /> },
  { value: "catalogo", label: "Catálogo", icon: <Tag className="h-5 w-5" /> },
  { value: "inventario", label: "Stock", icon: <Boxes className="h-5 w-5" /> },
  { value: "historial", label: "Historial", icon: <History className="h-5 w-5" /> },
  { value: "caja", label: "Caja", icon: <Wallet className="h-5 w-5" /> },
  { value: "admin", label: "Admin", icon: <ShieldCheck className="h-5 w-5" /> },
];

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
  const { notify } = useToast();
  const [viewState, setViewState] = useState<View>("ventas");

  const [authUser, setAuthUser] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);

  const [sales, setSales] = useState<Sale[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState<string | null>(null);

  const [cashSessions, setCashSessions] = useState<CashSession[]>([]);
  const [users, setUsers] = useState<PosUser[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todas");
  const cartSnapshot = useSyncExternalStore(
    subscribeCart,
    getCartSnapshot,
    getCartServerSnapshot,
  );
  const cart = useMemo(() => parseCart(cartSnapshot), [cartSnapshot]);
  const [cartOpen, setCartOpen] = useState(false);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Sale | null>(null);

  const [drafts, setDrafts] = useState<
    Record<DraftField, Record<number, string>>
  >({
    price: {},
    cost: {},
    presentation: {},
    image: {},
  });
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState<NewProductDraft>(EMPTY_NEW_PRODUCT);
  const [savingNew, setSavingNew] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());

  const [voidingId, setVoidingId] = useState<number | null>(null);
  const [voidTarget, setVoidTarget] = useState<Sale | null>(null);
  const [moveTarget, setMoveTarget] = useState<Sale | null>(null);
  const [movingId, setMovingId] = useState<number | null>(null);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const requestIdRef = useRef(newRequestId());
  const lastSigRef = useRef("");
  const lastRefreshRef = useRef(0);
  const busyRef = useRef(false);
  const notifiedConflicts = useRef(new Set<number>());

  const isAdmin = role === "admin";
  const canEdit = role === null || isAdmin;
  const showProfit = canEdit;

  /* ----------------------------- carga de datos ---------------------------- */

  const loadProducts = useCallback(async (silent = false) => {
    if (!silent) setProductsLoading(true);
    setProductsError(null);
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      if (res.status === 401) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as Product[];
      setProducts(data);
      setConnected(true);
      setDrafts((prev) => {
        const next = { ...prev };
        const seed: Record<DraftField, (p: Product) => string> = {
          price: (p) => (p.priceCents === null ? "" : (p.priceCents / 100).toFixed(2)),
          cost: (p) => (p.costCents === null ? "" : (p.costCents / 100).toFixed(2)),
          presentation: (p) => p.presentation ?? "",
          image: (p) => p.imageUrl ?? "",
        };
        for (const field of Object.keys(seed) as DraftField[]) {
          const copy = { ...next[field] };
          for (const p of data) {
            if (!(p.id in copy)) copy[p.id] = seed[field](p);
          }
          next[field] = copy;
        }
        return next;
      });
    } catch (error) {
      setProductsError(
        error instanceof Error ? error.message : "No se pudo cargar el catálogo.",
      );
      setConnected(false);
    } finally {
      if (!silent) setProductsLoading(false);
    }
  }, []);

  const loadSales = useCallback(
    async (filter?: { from?: string; to?: string }, silent = false) => {
      if (!silent) setSalesLoading(true);
      setSalesError(null);
      try {
        const params = new URLSearchParams();
        if (filter?.from) params.set("from", filter.from);
        if (filter?.to) params.set("to", filter.to);
        if (isAdmin) params.set("includeVoided", "1");
        const query = params.toString();
        const res = await fetch(`/api/sales${query ? `?${query}` : ""}`, {
          cache: "no-store",
        });
        if (res.status === 401) {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = "/login";
          return;
        }
        if (!res.ok) throw new Error(await readError(res));
        setSales((await res.json()) as Sale[]);
      } catch (error) {
        setSalesError(
          error instanceof Error ? error.message : "No se pudo cargar el historial.",
        );
      } finally {
        if (!silent) setSalesLoading(false);
      }
    },
    [isAdmin],
  );

  const loadCash = useCallback(async () => {
    try {
      const res = await fetch("/api/cash", { cache: "no-store" });
      if (!res.ok) return;
      setCashSessions((await res.json()) as CashSession[]);
    } catch {
      // silencioso: la caja es secundaria
    }
  }, []);

  const loadAdmin = useCallback(async () => {
    try {
      const res = await fetch("/api/admin", { cache: "no-store" });
      if (res.status === 403 || res.status === 401) return;
      if (!res.ok) return;
      const data = (await res.json()) as {
        users: PosUser[];
        stock: StockMovement[];
        audit: AuditEntry[];
      };
      setUsers(data.users);
      setStockMovements(data.stock);
      setAudit(data.audit);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { user?: string | null; role?: Role | null };
          if (!cancelled) {
            setAuthUser(data.user ?? null);
            setRole(data.role ?? null);
          }
        }
      } catch {
        // sin sesión: la UI queda en modo lectura
      }
      if (cancelled) return;
      // Carga inicial de datos al montar: patrón estándar de fetch en efectos.
      await Promise.all([loadProducts(), loadSales()]);
      void loadCash();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProducts, loadSales, loadCash]);

  // El carrito vive en localStorage (useSyncExternalStore), así que no
  // necesita efectos para restaurarse ni para persistirse.

  /* --------------------------- refresco automático ------------------------- */

  // El POS suele quedar abierto en un celular con la pantalla apagada mientras
  // otra persona cobra. Refrescamos al volver a la pestaña y cada POLL_MS, en
  // silencio para que no parpadee el "cargando".
  const refreshAll = useCallback(async () => {
    if (busyRef.current) return;
    const now = Date.now();
    // visibilitychange y focus se disparan juntos: evita el doble fetch.
    if (now - lastRefreshRef.current < 5_000) return;
    lastRefreshRef.current = now;
    await Promise.all([loadProducts(true), loadSales(undefined, true)]);
    void loadCash();
  }, [loadProducts, loadSales, loadCash]);

  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === "visible") void refreshAll();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refreshAll();
    }, POLL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      clearInterval(timer);
    };
  }, [refreshAll]);

  /* ------------------------------- derivados ------------------------------- */

  const categories = useMemo(() => {
    const set = new Set(products.filter((p) => p.active === 1).map((p) => p.category));
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

  const cartEntries = useMemo(
    () => buildCartEntries(cart, products),
    [cart, products],
  );
  const cartTotal = useMemo(
    () => cartEntries.reduce((sum, e) => sum + e.lineTotal, 0),
    [cartEntries],
  );
  const cartCount = useMemo(
    () => cartEntries.reduce((sum, e) => sum + e.qty, 0),
    [cartEntries],
  );
  // Si otra persona vendió lo que ya tienes en el carrito, te avisamos en vez
  // de que te lo descubras al cobrar.
  useEffect(() => {
    const conflicts = cartEntries.filter(
      (line) => line.product.stock !== null && line.qty > line.product.stock,
    );
    for (const line of conflicts) {
      if (notifiedConflicts.current.has(line.product.id)) continue;
      notifiedConflicts.current.add(line.product.id);
      notify(
        `Quedan ${line.product.stock} de ${line.product.name}, pero tienes ${line.qty} en la venta.`,
        "error",
      );
    }
    for (const id of Array.from(notifiedConflicts.current)) {
      if (!conflicts.some((line) => line.product.id === id)) {
        notifiedConflicts.current.delete(id);
      }
    }
  }, [cartEntries, notify]);

  const cartSig = useMemo(
    () =>
      JSON.stringify(
        cartEntries.map((e) => [e.product.id, e.qty, e.discountCents]),
      ),
    [cartEntries],
  );

  /* ------------------------------- carrito --------------------------------- */

  function addToCart(id: number) {
    const product = products.find((p) => p.id === id);
    if (!product || product.priceCents === null) return;
    const current = cart[id]?.qty ?? 0;
    const max = product.stock === null ? 999 : product.stock;
    if (current >= max) {
      notify(`No hay más stock de ${product.name}.`, "error");
      return;
    }
    writeCart({
      ...cart,
      [id]: { qty: current + 1, discountCents: cart[id]?.discountCents ?? 0 },
    });
  }

  function changeQty(id: number, delta: number) {
    const product = products.find((p) => p.id === id);
    const current = cart[id]?.qty ?? 0;
    const next = current + delta;
    if (next <= 0) {
      removeLine(id);
      return;
    }
    const max = !product || product.stock === null ? 999 : product.stock;
    const capped = Math.min(next, Math.max(max, 0));
    if (capped === current) {
      if (product && product.stock !== null) {
        notify(`Solo quedan ${product.stock} de ${product.name}.`, "error");
      }
      return;
    }
    writeCart({ ...cart, [id]: { qty: capped, discountCents: cart[id]?.discountCents ?? 0 } });
  }

  function removeLine(id: number) {
    const copy = { ...cart };
    delete copy[id];
    writeCart(copy);
  }

  function setDiscount(id: number, discountCents: number) {
    const line = cart[id];
    if (!line) return;
    writeCart({ ...cart, [id]: { ...line, discountCents } });
  }

  /* -------------------------------- cobro ---------------------------------- */

  function openCheckout() {
    if (cartEntries.length === 0) return;
    setCheckoutError(null);
    setCheckoutOpen(true);
  }

  async function submitSale(payload: CheckoutPayload) {
    if (submitting || cartEntries.length === 0) return;
    if (cartSig !== lastSigRef.current) {
      requestIdRef.current = newRequestId();
      lastSigRef.current = cartSig;
    }
    setSubmitting(true);
    busyRef.current = true;
    setCheckoutError(null);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: requestIdRef.current,
          items: cartEntries.map((entry) => ({
            productId: entry.product.id,
            quantity: entry.qty,
            discountCents: entry.discountCents,
          })),
          payments: payload.payments,
        }),
      });
      if (res.status === 401) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(await readError(res));
      const sale = (await res.json()) as Sale;
      setTicket(sale);
      writeCart({});
      setCartOpen(false);
      setCheckoutOpen(false);
      lastSigRef.current = "";
      requestIdRef.current = newRequestId();
      notify(`Venta #${sale.id} registrada por ${formatPEN(sale.totalCents)}.`, "success");
      void loadProducts();
      void loadSales();
      void loadCash();
    } catch (error) {
      setCheckoutError(
        error instanceof Error ? error.message : "No se pudo registrar la venta.",
      );
    } finally {
      setSubmitting(false);
      busyRef.current = false;
    }
  }

  /* ------------------------------- catálogo -------------------------------- */

  function onDraft(field: DraftField, id: number, value: string) {
    setDrafts((prev) => ({ ...prev, [field]: { ...prev[field], [id]: value } }));
  }

  async function saveProduct(id: number) {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    const get = (field: DraftField) => (drafts[field][id] ?? "").trim();
    const priceRaw = get("price");
    const costRaw = get("cost");
    const presRaw = get("presentation");
    const imgRaw = get("image");

    const fail = (message: string) => {
      setRowErrors((prev) => ({ ...prev, [id]: message }));
    };

    if (priceRaw === "" && costRaw === "" && presRaw === "" && imgRaw === "") {
      fail("Ingresa al menos foto, presentación, costo o precio.");
      return;
    }
    const price = priceRaw === "" ? undefined : parseSolesToCents(priceRaw);
    const cost = costRaw === "" ? undefined : parseSolesToCents(costRaw);
    if (price === null || cost === null) {
      fail("Revisa los montos: deben ser mayores a S/ 0.00 (ej. 15.00).");
      return;
    }
    if (presRaw.length > 40) {
      fail("La presentación debe tener máximo 40 caracteres.");
      return;
    }
    if (
      imgRaw !== "" &&
      (imgRaw.length > 500 || !/^https?:\/\/.+\..+/.test(imgRaw))
    ) {
      fail("La foto debe ser una URL válida (http:// o https://).");
      return;
    }
    setSavingId(id);
    setRowErrors((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    try {
      const body: Record<string, unknown> = {
        id,
        presentation: presRaw === "" ? null : presRaw,
        imageUrl: imgRaw === "" ? null : imgRaw,
      };
      if (price !== undefined) body.priceCents = price;
      if (cost !== undefined) body.costCents = cost;
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as Product[];
      setProducts(data);
      setBrokenImages((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setConnected(true);
      notify(`"${product.name}" guardado.`, "success");
    } catch (error) {
      fail(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setSavingId(null);
    }
  }

  async function quickPrice(id: number, priceCents: number) {
    try {
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, priceCents }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setProducts((await res.json()) as Product[]);
      notify("Precio guardado. Ya puedes venderlo.", "success");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "No se pudo guardar el precio.",
        "error",
      );
      throw error;
    }
  }

  async function toggleActive(id: number, next: boolean) {
    const product = products.find((p) => p.id === id);
    setSavingId(id);
    try {
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active: next }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setProducts((await res.json()) as Product[]);
      setConnected(true);
      const label = product?.name ?? "Producto";
      notify(
        next ? `"${label}" visible en ventas.` : `"${label}" oculto.`,
        "success",
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "No se pudo actualizar.",
        "error",
      );
    } finally {
      setSavingId(null);
    }
  }

  async function deleteProduct(product: Product) {
    setDeletingId(product.id);
    try {
      const res = await fetch("/api/products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product.id }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setProducts((await res.json()) as Product[]);
      const copy = { ...cart };
      delete copy[product.id];
      writeCart(copy);
      notify(`"${product.name}" eliminado del catálogo.`, "success");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "No se pudo eliminar.",
        "error",
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function submitNewProduct() {
    const name = newProduct.name.trim();
    const cat = newProduct.category.trim();
    const pres = newProduct.presentation.trim();
    if (name === "" || cat === "") {
      setAddError("Ponle nombre y categoría al producto.");
      return;
    }
    if (pres.length > 40) {
      setAddError("La presentación debe tener máximo 40 caracteres.");
      return;
    }
    const price =
      newProduct.price.trim() === ""
        ? undefined
        : parseSolesToCents(newProduct.price.trim());
    const cost =
      newProduct.cost.trim() === ""
        ? undefined
        : parseSolesToCents(newProduct.cost.trim());
    if (price === null || cost === null) {
      setAddError("Revisa los montos: deben ser mayores a S/ 0.00.");
      return;
    }
    const img = newProduct.image.trim();
    if (img !== "" && (img.length > 500 || !/^https?:\/\/.+\..+/.test(img))) {
      setAddError("La foto debe ser una URL válida (http:// o https://).");
      return;
    }
    setSavingNew(true);
    setAddError(null);
    try {
      const body: Record<string, unknown> = { name, category: cat };
      if (pres !== "") body.presentation = pres;
      if (img !== "") body.imageUrl = img;
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
      setNewProduct(EMPTY_NEW_PRODUCT);
      setShowAddForm(false);
      setConnected(true);
      notify(`"${name}" agregado al catálogo.`, "success");
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "No se pudo agregar.");
    } finally {
      setSavingNew(false);
    }
  }

  /* ------------------------------- historial ------------------------------- */

  async function voidSaleById(sale: Sale, reason: string) {
    setVoidingId(sale.id);
    try {
      const res = await fetch(`/api/sales/${sale.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setSales((await res.json()) as Sale[]);
      setVoidTarget(null);
      notify(`Venta #${sale.id} anulada. Se devolvió el stock.`, "success");
      void loadProducts();
      void loadCash();
      void loadAdmin();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "No se pudo anular la venta.",
        "error",
      );
    } finally {
      setVoidingId(null);
    }
  }

  async function moveSaleDate(sale: Sale, date: string, reason: string) {
    setMovingId(sale.id);
    try {
      const res = await fetch(`/api/sales/${sale.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, reason }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as Sale[];
      // Si había un filtro de fechas activo, la venta pudo salir de la lista.
      if (fromDate || toDate) {
        const from = fromDate ? startOfDayIso(fromDate) : undefined;
        const to = toDate ? endOfDayIso(toDate) : undefined;
        const visible = data.filter((s) => {
          if (from && s.effectiveDate < from) return false;
          if (to && s.effectiveDate > to) return false;
          return true;
        });
        setSales(visible);
      } else {
        setSales(data);
      }
      setMoveTarget(null);
      notify(`Venta #${sale.id} ahora cuenta para el ${date}.`, "success");
      void loadAdmin();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "No se pudo cambiar la fecha.",
        "error",
      );
    } finally {
      setMovingId(null);
    }
  }

  function downloadReport() {
    const params = new URLSearchParams();
    if (fromDate) params.set("from", startOfDayIso(fromDate));
    if (toDate) params.set("to", endOfDayIso(toDate));
    const query = params.toString();
    const link = document.createElement("a");
    link.href = `/api/reports${query ? `?${query}` : ""}`;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  /* --------------------------------- caja --------------------------------- */

  async function openCash(openingCents: number) {
    const res = await fetch("/api/cash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openingCents }),
    });
    if (!res.ok) throw new Error(await readError(res));
    setCashSessions((await res.json()) as CashSession[]);
    notify("Caja abierta. Las ventas se cuentan en este turno.", "success");
  }

  async function closeCash(id: number, countedCents: number, note: string) {
    const res = await fetch(`/api/cash/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countedCents, note }),
    });
    if (!res.ok) throw new Error(await readError(res));
    setCashSessions((await res.json()) as CashSession[]);
    notify("Caja cerrada. Revisa el arqueo en el historial.", "success");
    void loadAdmin();
  }

  /* ------------------------------- recepción -------------------------------- */

  async function receiveOrder(
    lines: Array<{
      productId: number;
      boxes: number | null;
      unitsPerBox: number | null;
      looseUnits: number | null;
    }>,
    note: string,
  ): Promise<number> {
    const res = await fetch("/api/products", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines, note }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const data = (await res.json()) as {
      applied: ReceiptResult[];
      products: Product[];
    };
    setProducts(data.products);
    const total = data.applied.reduce((sum, r) => sum + r.delta, 0);
    notify(
      `Recibido: ${data.applied.length} ${data.applied.length === 1 ? "producto" : "productos"}, +${total} botellas.`,
      "success",
    );
    void loadAdmin();
    return total;
  }

  /* --------------------------------- admin --------------------------------- */

  async function createUser(username: string, password: string, newRole: Role) {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, role: newRole }),
    });
    if (!res.ok) throw new Error(await readError(res));
    setUsers((await res.json()) as PosUser[]);
    notify(`Usuario "${username}" creado.`, "success");
  }

  async function updateUser(
    id: number,
    patch: { role?: Role; active?: boolean; password?: string },
  ) {
    const res = await fetch("/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) throw new Error(await readError(res));
    setUsers((await res.json()) as PosUser[]);
    notify("Usuario actualizado.", "success");
    void loadAdmin();
  }

  /* --------------------------------- sesión -------------------------------- */

  async function logout() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      // Recarga completa intencional: limpia todo el estado de la sesión.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    }
  }

  /* --------------------------------- render -------------------------------- */

  // El cajero solo vende, revisa sus ventas y hace su arqueo de caja:
  // el catálogo y el inventario quedan fuera de su alcance.
  const visibleViews: View[] = isAdmin
    ? ["ventas", "catalogo", "inventario", "historial", "caja", "admin"]
    : ["ventas", "historial", "caja"];
  const navItems = NAV_ITEMS.filter((item) => visibleViews.includes(item.value));
  // Red de seguridad: si el rol cambia con la app abierta, la vista prohibida
  // cae a Ventas en vez de dejar el panel en pantalla.
  const view = visibleViews.includes(viewState) ? viewState : "ventas";

  function goTo(next: View) {
    if (!visibleViews.includes(next)) return;
    setViewState(next);
    // Los datos pueden venir viejos de otro dispositivo: al cambiar de vista
    // siempre se recargan (en silencio).
    void refreshAll();
    if (next === "caja") void loadCash();
    if (next === "admin" && isAdmin) void loadAdmin();
  }

  const cartProps = {
    products,
    cart,
    onChangeQty: changeQty,
    onRemove: removeLine,
    onSetDiscount: setDiscount,
    onClearCart: () => {
      writeCart({});
      notify("Venta vaciada.", "info");
    },
    onCheckout: openCheckout,
  };

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
              <span className="hidden font-normal opacity-70 sm:inline">
                · se actualiza solo
              </span>
            </span>
            <span className="rounded-full bg-stone-100 px-3 py-1.5 font-semibold text-stone-700">
              {activeCount} productos · {pricedCount} con precio
            </span>
            {authUser && (
              <>
                <span className="flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 font-semibold text-red-900">
                  {authUser}
                  {role && (
                    <span className="rounded-full bg-red-900 px-1.5 py-0.5 text-[10px] uppercase text-white">
                      {role === "admin" ? "admin" : "cajero"}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={logout}
                  className="flex items-center gap-1.5 rounded-full bg-stone-900 px-3 py-1.5 font-semibold text-white transition hover:bg-stone-700"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Salir
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 pb-28 pt-4 lg:pb-8">
        <aside className="no-print hidden w-52 shrink-0 lg:block">
          <nav
            className="sticky top-4 flex flex-col gap-1 rounded-2xl border border-stone-200 bg-white p-2 shadow-sm"
            aria-label="Navegación principal"
          >
            {navItems.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => goTo(item.value)}
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
              <SalesView
                products={products}
                loading={productsLoading}
                error={productsError}
                search={search}
                onSearch={setSearch}
                categories={categories}
                category={category}
                onCategory={setCategory}
                cart={cart}
                onAdd={addToCart}
                onChangeQty={changeQty}
                brokenImages={brokenImages}
                onImageError={(id) =>
                  setBrokenImages((prev) => {
                    if (prev.has(id)) return prev;
                    const next = new Set(prev);
                    next.add(id);
                    return next;
                  })
                }
                canEdit={canEdit}
                onQuickPrice={quickPrice}
                onRetry={loadProducts}
              />
              <aside
                className="hidden w-80 shrink-0 lg:block"
                aria-label="Venta actual"
              >
                <div className="sticky top-4 h-[calc(100vh-10rem)] overflow-hidden rounded-2xl border border-stone-200 bg-[#fffdf8] shadow-sm">
                  <CartPanel {...cartProps} />
                </div>
              </aside>
            </div>
          )}

          {view === "catalogo" && (
            <CatalogView
              products={products}
              loading={productsLoading}
              error={productsError}
              canEdit={canEdit}
              showAddForm={showAddForm}
              onToggleAddForm={(open) => {
                setShowAddForm(open);
                if (open) setAddError(null);
              }}
              onSubmitNew={submitNewProduct}
              newProduct={newProduct}
              onNewProductChange={(field, value) =>
                setNewProduct((prev) => ({ ...prev, [field]: value }))
              }
              newProductError={addError}
              savingNew={savingNew}
              priceDrafts={drafts.price}
              costDrafts={drafts.cost}
              presentationDrafts={drafts.presentation}
              imageDrafts={drafts.image}
              onDraft={onDraft}
              onSave={saveProduct}
              onToggleActive={toggleActive}
              onDelete={deleteProduct}
              savingId={savingId}
              deletingId={deletingId}
              rowErrors={rowErrors}
              onRetry={loadProducts}
              categories={categories}
            />
          )}

          {view === "inventario" && (
            <InventoryView
              products={products}
              movements={stockMovements}
              canEdit={canEdit}
              onEnableControl={async (id) => {
                const res = await fetch("/api/products", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id, stock: 0 }),
                });
                if (!res.ok) {
                  notify(await readError(res), "error");
                  return;
                }
                setProducts((await res.json()) as Product[]);
                notify("Control de stock activado. Ya puedes recibir pedidos.", "success");
              }}
              onSaveStock={async (id, patch) => {
                const res = await fetch("/api/products", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id, ...patch }),
                });
                if (!res.ok) throw new Error(await readError(res));
                setProducts((await res.json()) as Product[]);
                notify("Stock actualizado.", "success");
                void loadAdmin();
              }}
              onReceive={receiveOrder}
              onExport={() => {
                void fetch("/api/reports", { method: "POST" })
                  .then(async (res) => {
                    if (!res.ok) throw new Error(await readError(res));
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `inventario-${toLocalDateInput(new Date())}.csv`;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    URL.revokeObjectURL(url);
                  })
                  .catch((error: unknown) =>
                    notify(
                      error instanceof Error
                        ? error.message
                        : "No se pudo descargar.",
                      "error",
                    ),
                  );
              }}
            />
          )}

          {view === "historial" && (
            <HistoryView
              sales={sales}
              loading={salesLoading}
              error={salesError}
              showProfit={showProfit}
              canVoid={isAdmin}
              from={fromDate}
              to={toDate}
              onFrom={setFromDate}
              onTo={setToDate}
              onApplyFilter={() =>
                void loadSales({
                  from: fromDate ? startOfDayIso(fromDate) : undefined,
                  to: toDate ? endOfDayIso(toDate) : undefined,
                })
              }
              onClearFilter={() => {
                setFromDate("");
                setToDate("");
                void loadSales();
              }}
              onRetry={() => void loadSales()}
              onVoid={(sale) => setVoidTarget(sale)}
              onMoveDate={(sale) => setMoveTarget(sale)}
              onOpenTicket={(sale) => setTicket(sale)}
              voidingId={voidingId}
              onDownloadReport={downloadReport}
              hasVoided={sales.some((s) => s.voided)}
            />
          )}

          {view === "caja" && (
            <CashView
              sessions={cashSessions}
              currentUser={authUser ?? roleLabel(role) ?? "—"}
              onOpen={openCash}
              onClose={closeCash}
            />
          )}

          {view === "admin" && isAdmin && (
            <AdminView
              users={users}
              audit={audit}
              currentUser={authUser ?? ""}
              onCreate={createUser}
              onUpdate={updateUser}
            />
          )}

          {view === "ventas" && cartEntries.length === 0 && !productsLoading && (
            <p className="mt-4 text-center text-xs text-stone-400">
              {saleProfit.length === 0 ? "" : ""}
              Tip: los descuentos por línea y el pago mixto se hacen en el
              carrito y al cobrar.
            </p>
          )}
        </main>
      </div>

      <button
        type="button"
        onClick={() => setCartOpen(true)}
        className="no-print fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full bg-red-900 px-5 py-3.5 text-sm font-bold text-white shadow-xl transition hover:bg-red-950 lg:hidden"
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
        <div
          className="no-print fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Venta actual"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setCartOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-[#fffdf8] shadow-2xl">
            <CartPanel {...cartProps} onClose={() => setCartOpen(false)} />
          </div>
        </div>
      )}

      <nav
        className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 backdrop-blur lg:hidden"
        aria-label="Navegación principal"
      >
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        >
          {navItems.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => goTo(item.value)}
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

      <CheckoutDialog
        open={checkoutOpen}
        totalCents={cartTotal}
        itemCount={cartCount}
        submitting={submitting}
        error={checkoutError}
        onClose={() => {
          if (submitting) return;
          setCheckoutOpen(false);
          setCheckoutError(null);
        }}
        onSubmit={(payload: CheckoutPayload) => void submitSale(payload)}
      />

      <TicketDialog
        sale={ticket}
        showProfit={showProfit}
        onClose={() => setTicket(null)}
        onPrint={() => window.print()}
      />

      <MoveDateDialog
        sale={moveTarget}
        busy={movingId !== null}
        onClose={() => setMoveTarget(null)}
        onConfirm={(date, reason) => {
          if (moveTarget) void moveSaleDate(moveTarget, date, reason);
        }}
      />

      <VoidDialog
        sale={voidTarget}
        busy={voidingId !== null}
        onClose={() => setVoidTarget(null)}
        onConfirm={(reason) => {
          if (voidTarget) void voidSaleById(voidTarget, reason);
        }}
      />

      {view !== "ventas" && (
        <span className="sr-only">
          <Receipt />
          <Store />
        </span>
      )}
    </div>
  );
}
