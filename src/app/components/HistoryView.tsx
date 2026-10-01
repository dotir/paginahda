"use client";

import { useMemo } from "react";
import {
  Ban,
  CalendarClock,
  CalendarRange,
  Download,
  Eye,
  Filter,
  Printer,
  Receipt,
} from "lucide-react";
import { PaymentIcon } from "@/app/components/PaymentIcon";
import {
  displayName,
  formatDay,
  formatPEN,
  paymentLabel,
  saleProfit,
  type Sale,
} from "@/app/lib/ui";

type Props = {
  sales: Sale[];
  loading: boolean;
  error: string | null;
  showProfit: boolean;
  canVoid: boolean;
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onApplyFilter: () => void;
  onClearFilter: () => void;
  onRetry: () => void;
  onVoid: (sale: Sale) => void;
  onMoveDate: (sale: Sale) => void;
  onOpenTicket: (sale: Sale) => void;
  voidingId: number | null;
  onDownloadReport: () => void;
  hasVoided: boolean;
};

export default function HistoryView({
  sales,
  loading,
  error,
  showProfit,
  canVoid,
  from,
  to,
  onFrom,
  onTo,
  onApplyFilter,
  onClearFilter,
  onRetry,
  onVoid,
  onMoveDate,
  onOpenTicket,
  voidingId,
  onDownloadReport,
  hasVoided,
}: Props) {
  const active = useMemo(() => sales.filter((s) => !s.voided), [sales]);
  const total = active.reduce((sum, s) => sum + s.totalCents, 0);
  const profit = useMemo(() => {
    let sum = 0;
    let known = false;
    for (const sale of active) {
      const value = saleProfit(sale);
      if (value !== null) {
        sum += value;
        known = true;
      }
    }
    return known ? sum : null;
  }, [active]);
  const discounts = active.reduce(
    (sum, s) => sum + s.items.reduce((n, i) => n + i.discountCents, 0),
    0,
  );
  const filterActive = from !== "" || to !== "";

  return (
    <section aria-label="Historial de ventas" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
            Ventas
          </p>
          <p className="mt-1 text-2xl font-extrabold text-stone-900">
            {active.length}
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-red-900 p-4 text-white shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-red-200">
            Total
          </p>
          <p className="mt-1 text-2xl font-extrabold">{formatPEN(total)}</p>
        </div>
        {showProfit && (
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
              Ganancia
            </p>
            <p className="mt-1 text-2xl font-extrabold text-emerald-700">
              {profit === null ? "—" : formatPEN(profit)}
            </p>
          </div>
        )}
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
            Descuentos
          </p>
          <p className="mt-1 text-2xl font-extrabold text-stone-900">
            {formatPEN(discounts)}
          </p>
        </div>
      </div>

      {showProfit && profit === null && active.length > 0 && (
        <p className="rounded-xl border border-stone-200 bg-white p-3 text-xs text-stone-500">
          Registra los costos en Catálogo para ver la ganancia.
        </p>
      )}

      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-stone-500">
          <Filter className="h-4 w-4" />
          Filtrar por fecha
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-stone-400">
            Desde
            <input
              type="date"
              value={from}
              onChange={(e) => onFrom(e.target.value)}
              className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-bold text-stone-900 outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-stone-400">
            Hasta
            <input
              type="date"
              value={to}
              onChange={(e) => onTo(e.target.value)}
              className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-bold text-stone-900 outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={onApplyFilter}
              className="flex-1 rounded-xl bg-stone-900 py-2.5 text-sm font-bold text-white transition hover:bg-stone-700"
            >
              <CalendarRange className="mr-1.5 inline h-4 w-4" />
              Aplicar
            </button>
            {filterActive && (
              <button
                type="button"
                onClick={onClearFilter}
                className="rounded-xl border border-stone-300 px-3 py-2.5 text-xs font-bold text-stone-600 transition hover:bg-stone-100"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onDownloadReport}
          disabled={active.length === 0}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-red-900 bg-white py-3 text-sm font-bold text-red-900 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-400 disabled:hover:bg-white"
        >
          <Download className="h-4 w-4" />
          {filterActive ? "Descargar reporte del rango (CSV)" : "Descargar reporte (CSV)"}
        </button>
      </div>

      {error && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          role="alert"
        >
          {error}{" "}
          <button type="button" onClick={onRetry} className="font-bold underline">
            Reintentar
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-stone-200 bg-white"
              aria-hidden
            />
          ))}
        </div>
      ) : sales.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <Receipt className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-2 text-sm font-semibold text-stone-600">
            {filterActive
              ? "No hay ventas en ese rango de fechas."
              : "Aún no hay ventas registradas."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {sales.map((sale) => {
            const profitValue = showProfit ? saleProfit(sale) : null;
            return (
              <li
                key={sale.id}
                className={`rounded-xl border bg-white p-3 shadow-sm ${
                  sale.voided
                    ? "border-dashed border-stone-300 opacity-70"
                    : "border-stone-200"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-stone-900 px-2.5 py-1 text-xs font-extrabold text-white">
                    #{sale.id}
                  </span>
                  <span className="text-xs text-stone-500">
                    {formatDay(sale.effectiveDate)}
                    <span className="ml-1">
                      {new Date(sale.effectiveDate).toLocaleTimeString("es-PE", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {sale.dateMovedAt && (
                      <span
                        className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800"
                        title={`Movida por ${sale.dateMovedBy ?? "—"}: ${sale.dateMoveReason ?? ""}`}
                      >
                        movida de día
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-700">
                    {sale.payments.length > 0 && (
                      <PaymentIcon method={sale.payments[0].method} />
                    )}
                    {paymentLabel(sale.paymentMethod)}
                  </span>
                  {sale.user && (
                    <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-600">
                      {sale.user}
                    </span>
                  )}
                  {sale.voided && (
                    <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-extrabold uppercase text-red-800">
                      Anulada
                    </span>
                  )}
                  {profitValue !== null && !sale.voided && (
                    <span
                      className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-900"
                      title="Ganancia de esta venta"
                    >
                      +{formatPEN(profitValue)}
                    </span>
                  )}
                  <span className="ml-auto text-base font-extrabold text-red-900">
                    {formatPEN(sale.totalCents)}
                  </span>
                </div>
                {sale.voided && sale.voidReason && (
                  <p className="mt-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-800">
                    Motivo: {sale.voidReason}
                    {sale.voidedBy ? ` · por ${sale.voidedBy}` : ""}
                  </p>
                )}
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-xs font-bold text-stone-500 transition hover:text-red-900">
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
                          {item.discountCents > 0 && (
                            <span className="ml-1 font-bold text-emerald-700">
                              (−{formatPEN(item.discountCents)})
                            </span>
                          )}
                        </span>
                        <span className="font-bold">{formatPEN(item.totalCents)}</span>
                      </li>
                    ))}
                    {sale.payments.map((p, i) => (
                      <li
                        key={`p-${i}`}
                        className="flex items-center justify-between gap-2 text-xs text-stone-600"
                      >
                        <span>
                          {paymentLabel(p.method)}
                          {p.reference ? ` · ${p.reference}` : ""}
                        </span>
                        <span className="font-bold">{formatPEN(p.amountCents)}</span>
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
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenTicket(sale)}
                    className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-700 transition hover:border-red-900 hover:text-red-900"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Ver ticket
                  </button>
                  {!sale.voided && (
                    <button
                      type="button"
                      onClick={() => onOpenTicket(sale)}
                      className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-700 transition hover:border-red-900 hover:text-red-900"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Detalle
                    </button>
                  )}
                  {!sale.voided && canVoid && (
                    <button
                      type="button"
                      onClick={() => onMoveDate(sale)}
                      className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-700 transition hover:border-red-900 hover:text-red-900"
                    >
                      <CalendarClock className="h-3.5 w-3.5" />
                      Mover de día
                    </button>
                  )}
                  {!sale.voided && canVoid && (
                    <button
                      type="button"
                      onClick={() => onVoid(sale)}
                      disabled={voidingId === sale.id}
                      className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-500 transition hover:border-red-800 hover:text-red-800 disabled:opacity-50"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      {voidingId === sale.id ? "Anulando…" : "Anular"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hasVoided && (
        <p className="text-center text-xs text-stone-400">
          Las ventas anuladas se conservan con su motivo y no cuentan en los
          totales.
        </p>
      )}
    </section>
  );
}
