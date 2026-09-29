"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import Modal from "@/app/components/Modal";
import { formatPEN, type Sale } from "@/app/lib/ui";

type Props = {
  sale: Sale | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
};

const QUICK_REASONS = [
  "Cliente devolvió la botella",
  "Error de precio",
  "Venta duplicada",
  "Cliente se arrepintió",
];

export default function VoidDialog({ sale, busy, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState("");

  function submit() {
    if (reason.trim().length < 5) return;
    onConfirm(reason.trim());
  }

  return (
    <Modal
      open={sale !== null}
      onClose={onClose}
      title={`Anular venta #${sale?.id ?? ""}`}
      description={
        sale
          ? `Se devolverá el stock y la venta quedará marcada como anulada. No se borra el histórico. Total ${formatPEN(sale.totalCents)}.`
          : undefined
      }
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
            disabled={busy || reason.trim().length < 5}
            className="flex items-center justify-center gap-2 rounded-xl bg-red-900 py-3 text-sm font-bold text-white transition hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Ban className="h-4 w-4" />
            {busy ? "Anulando…" : "Anular venta"}
          </button>
        </div>
      }
    >
      {sale && (
        <ul className="mb-4 flex flex-col gap-1 rounded-xl bg-stone-50 p-3 text-xs text-stone-600">
          {sale.items.map((item, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span>
                {item.quantity} × {item.name}
                {item.presentation ? ` (${item.presentation})` : ""}
              </span>
              <span className="font-bold">{formatPEN(item.totalCents)}</span>
            </li>
          ))}
        </ul>
      )}
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-stone-500">
        Motivo de la anulación
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          rows={2}
          autoFocus
          placeholder="Mínimo 5 caracteres"
          className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-normal text-stone-900 outline-none placeholder:text-stone-400 focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK_REASONS.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => setReason(text)}
            className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-bold text-stone-600 transition hover:border-red-900 hover:text-red-900"
          >
            {text}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-stone-400">
        {reason.trim().length}/200 caracteres · queda registrado en la auditoría.
      </p>
    </Modal>
  );
}
