"use client";

import { Printer } from "lucide-react";
import Modal from "@/app/components/Modal";
import { PaymentIcon } from "@/app/components/PaymentIcon";
import { formatPEN, type Sale, type SaleItem } from "@/app/lib/ui";

type Props = {
  sale: Sale | null;
  showProfit: boolean;
  onClose: () => void;
  onPrint: () => void;
};

function lineProfit(item: SaleItem): number | null {
  if (item.unitCostCents === null) return null;
  return (item.unitPriceCents - item.unitCostCents) * item.quantity - item.discountCents;
}

export default function TicketDialog({ sale, showProfit, onClose, onPrint }: Props) {
  return (
    <Modal
      open={sale !== null}
      onClose={onClose}
      title={`Ticket de venta #${sale?.id ?? ""}`}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-stone-300 py-3 text-sm font-bold text-stone-700 transition hover:bg-stone-100"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={onPrint}
            className="flex items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-sm font-bold text-white transition hover:bg-stone-700"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
        </div>
      }
    >
      {sale && (
        <div className="ticket-print">
          <div className="text-center">
            <h3 className="text-xl font-extrabold text-stone-900">El Arbolito</h3>
            <p className="text-xs text-stone-500">Distribuidor independiente</p>
            <p className="mt-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-900">
              Comprobante interno · No válido como comprobante fiscal
            </p>
            <p className="mt-2 text-sm text-stone-500">
              Venta #{sale.id} ·{" "}
              {new Date(sale.createdAt).toLocaleString("es-PE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            {sale.user && (
              <p className="text-[11px] text-stone-400">Atendió: {sale.user}</p>
            )}
          </div>
          <ul className="mt-4 flex flex-col gap-2 border-t border-dashed border-stone-300 pt-4">
            {sale.items.map((item, i) => (
              <li key={i} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-stone-900">
                    {item.quantity} × {item.name}
                    {item.presentation ? ` (${item.presentation})` : ""}
                  </span>
                  <span className="font-bold">{formatPEN(item.totalCents)}</span>
                </div>
                <p className="text-xs text-stone-500">
                  {formatPEN(item.unitPriceCents)} c/u
                  {item.discountCents > 0 &&
                    ` · descuento ${formatPEN(item.discountCents)}`}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-dashed border-stone-300 pt-3 text-sm">
            <div className="flex items-center justify-between text-lg font-extrabold text-stone-900">
              <span>Total</span>
              <span>{formatPEN(sale.totalCents)}</span>
            </div>
            <ul className="mt-1 flex flex-col gap-0.5">
              {sale.payments.map((p, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between text-stone-600"
                >
                  <span className="flex items-center gap-1.5">
                    <PaymentIcon method={p.method} />
                    {p.method} {formatPEN(p.amountCents)}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </span>
                  {p.changeCents !== null && p.changeCents > 0 && (
                    <span>vuelto {formatPEN(p.changeCents)}</span>
                  )}
                </li>
              ))}
            </ul>
            {sale.receivedCents !== null && (
              <>
                <div className="mt-1 flex items-center justify-between text-stone-600">
                  <span>Recibido</span>
                  <span>{formatPEN(sale.receivedCents)}</span>
                </div>
                <div className="flex items-center justify-between font-bold text-stone-900">
                  <span>Vuelto</span>
                  <span>{formatPEN(sale.changeCents ?? 0)}</span>
                </div>
              </>
            )}
            {showProfit && (
              <div className="mt-2 flex items-center justify-between border-t border-dashed border-stone-200 pt-2 text-sm font-bold text-emerald-700">
                <span>Ganancia</span>
                <span>
                  {(() => {
                    let total = 0;
                    let known = false;
                    for (const item of sale.items) {
                      const profit = lineProfit(item);
                      if (profit !== null) {
                        total += profit;
                        known = true;
                      }
                    }
                    return known ? formatPEN(total) : "—";
                  })()}
                </span>
              </div>
            )}
          </div>
          {sale.voided && (
            <p className="mt-3 rounded-lg bg-red-50 p-2 text-center text-xs font-extrabold uppercase text-red-800">
              Anulada{sale.voidedBy ? ` por ${sale.voidedBy}` : ""}
              {sale.voidReason ? ` · ${sale.voidReason}` : ""}
            </p>
          )}
          <p className="mt-4 text-center text-xs text-stone-400">
            Gracias por su compra · Vinos y piscos Hacienda del Abuelo
          </p>
        </div>
      )}
    </Modal>
  );
}
