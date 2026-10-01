"use client";

import { useState } from "react";
import { CalendarClock, TriangleAlert } from "lucide-react";
import Modal from "@/app/components/Modal";
import { formatDate, formatPEN, toLocalDateInput, type Sale } from "@/app/lib/ui";

type Props = {
  sale: Sale | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (date: string, reason: string) => void;
};

export default function MoveDateDialog({ sale, busy, onClose, onConfirm }: Props) {
  const today = toLocalDateInput(new Date());
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");

  const current = sale ? toLocalDateInput(new Date(sale.effectiveDate)) : "";
  const target = date || current;
  const sameDay = target === current;
  const future = target > today;

  function submit() {
    if (!sale || sameDay || future || reason.trim().length < 5 || busy) return;
    onConfirm(target, reason.trim());
  }

  return (
    <Modal
      open={sale !== null}
      onClose={onClose}
      title={`Mover la venta #${sale?.id ?? ""} de día`}
      description="Cambia el día con el que cuenta la venta: se ajusta el total del día y el reporte."
      busy={busy}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-stone-300 py-3 text-sm font-bold text-stone-700 transition hover:bg-stone-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || sameDay || future || reason.trim().length < 5}
            className="flex items-center justify-center gap-2 rounded-xl bg-red-900 py-3 text-sm font-bold text-white transition hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CalendarClock className="h-4 w-4" />
            {busy ? "Moviendo…" : "Mover de día"}
          </button>
        </div>
      }
    >
      {sale && (
        <>
          <div className="rounded-xl bg-stone-50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-stone-500">Monto</span>
              <span className="font-bold text-stone-900">
                {formatPEN(sale.totalCents)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-stone-500">Ahora cuenta para</span>
              <span className="font-bold text-stone-900">{current}</span>
            </div>
            <p className="mt-1 text-[11px] text-stone-400">
              Registrada el {formatDate(sale.createdAt)}
            </p>
          </div>

          <label className="mt-3 flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-stone-500">
            Mover a este día
            <input
              type="date"
              value={target}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-bold text-stone-900 outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
            />
          </label>

          <label className="mt-2 flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-stone-500">
            Por qué
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder="Mínimo 5 caracteres. Ej. La cerrajera anotó tarde, es del día anterior"
              className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-normal text-stone-900 outline-none placeholder:text-stone-400 focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
            />
          </label>

          {future && (
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-800">
              No se puede mover una venta a un día futuro.
            </p>
          )}

          {sale.cashSessionId !== null && (
            <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-900">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Esta venta sigue dentro del turno de caja nº{" "}
                {sale.cashSessionId}, porque el dinero estaba en esa gaveta. El
                arqueo de ese turno no cambia; solo el día con el que cuenta la
                venta.
              </span>
            </p>
          )}

          <p className="mt-2 text-[11px] text-stone-400">
            Queda registrado quién lo hizo y el motivo. No se borra nada.
          </p>
        </>
      )}
    </Modal>
  );
}
