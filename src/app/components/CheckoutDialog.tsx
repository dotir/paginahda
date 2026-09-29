"use client";

import { useState } from "react";
import { Banknote, CreditCard, Plus, Smartphone, Trash2, Wallet } from "lucide-react";
import Modal from "@/app/components/Modal";
import {
  CHANGE_METHODS,
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  formatPEN,
  parseSolesToCents,
  referenceMethodLabel,
  type PaymentMethod,
} from "@/app/lib/ui";

export type PaymentDraft = {
  method: PaymentMethod;
  amount: string;
  received: string;
  reference: string;
};

export type CheckoutPayload = {
  payments: Array<{
    method: PaymentMethod;
    amountCents: number;
    receivedCents: number | null;
    reference: string | null;
  }>;
};

type Props = {
  open: boolean;
  totalCents: number;
  itemCount: number;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: CheckoutPayload) => void;
};

function iconFor(method: PaymentMethod) {
  if (method === "efectivo") return <Banknote className="h-4 w-4" />;
  if (method === "tarjeta") return <CreditCard className="h-4 w-4" />;
  if (method === "yape" || method === "plin") {
    return <Smartphone className="h-4 w-4" />;
  }
  return <Wallet className="h-4 w-4" />;
}

export default function CheckoutDialog({
  open,
  totalCents,
  itemCount,
  submitting,
  error,
  onClose,
  onSubmit,
}: Props) {
  const [rows, setRows] = useState<PaymentDraft[]>([
    { method: "efectivo", amount: "", received: "", reference: "" },
  ]);

  // Al abrir se reinicia con el total completo en el primer medio de pago.
  const [lastTotal, setLastTotal] = useState<number | null>(null);
  if (open && lastTotal !== totalCents) {
    setLastTotal(totalCents);
    setRows([
      {
        method: "efectivo",
        amount: (totalCents / 100).toFixed(2),
        received: "",
        reference: "",
      },
    ]);
  }

  function update(index: number, patch: Partial<PaymentDraft>) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function addRow() {
    setRows((prev) => {
      const covered = prev.reduce((sum, row) => {
        const cents = parseSolesToCents(row.amount) ?? 0;
        return sum + cents;
      }, 0);
      const remaining = Math.max(totalCents - covered, 0);
      return [
        ...prev,
        {
          method: "yape",
          amount: (remaining / 100).toFixed(2),
          received: "",
          reference: "",
        },
      ];
    });
  }

  function removeRow(index: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  const parsed = rows.map((row) => ({
    method: row.method,
    amountCents: parseSolesToCents(row.amount) ?? 0,
    receivedCents: CHANGE_METHODS.has(row.method)
      ? parseSolesToCents(row.received) ?? parseSolesToCents(row.amount) ?? 0
      : null,
    reference: row.reference.trim() || null,
  }));
  const covered = parsed.reduce((sum, p) => sum + p.amountCents, 0);
  const pending = totalCents - covered;
  const invalid = parsed.some(
    (p) =>
      p.amountCents <= 0 ||
      (p.receivedCents !== null && p.receivedCents < p.amountCents),
  );
  const changeTotal = parsed.reduce(
    (sum, p) => sum + (p.receivedCents !== null ? p.receivedCents - p.amountCents : 0),
    0,
  );

  function submit() {
    if (invalid || pending !== 0 || submitting) return;
    onSubmit({
      payments: parsed.map((p) => ({
        method: p.method,
        amountCents: p.amountCents,
        receivedCents: p.receivedCents,
        reference: p.reference,
      })),
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cobrar venta"
      busy={submitting}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-stone-300 py-3 text-sm font-bold text-stone-700 transition hover:bg-stone-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || invalid || pending !== 0}
            className="rounded-xl bg-red-900 py-3 text-sm font-bold text-white transition hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Registrando…" : "Confirmar venta"}
          </button>
        </div>
      }
    >
      <div className="rounded-xl bg-red-50 p-3 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-red-800">
          Total a cobrar
        </p>
        <p className="text-3xl font-extrabold text-red-900">
          {formatPEN(totalCents)}
        </p>
        <p className="text-xs text-red-800">
          {itemCount} {itemCount === 1 ? "producto" : "productos"}
        </p>
      </div>

      <p className="mt-4 text-xs font-bold uppercase tracking-wide text-stone-500">
        Medios de pago
      </p>
      <div className="mt-2 flex flex-col gap-2">
        {rows.map((row, index) => {
          const parsedRow = parsed[index];
          return (
            <div
              key={index}
              className="rounded-xl border border-stone-200 p-3"
            >
              <div className="flex items-center gap-2">
                <div className="grid flex-1 grid-cols-2 gap-1.5">
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => update(index, { method, reference: "" })}
                      aria-pressed={row.method === method}
                      className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-[11px] font-bold transition ${
                        row.method === method
                          ? "border-red-900 bg-red-50 text-red-900"
                          : "border-stone-200 text-stone-500 hover:border-stone-300"
                      }`}
                    >
                      {iconFor(method)}
                      {PAYMENT_LABELS[method]}
                    </button>
                  ))}
                </div>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    className="rounded-lg p-2 text-stone-400 transition hover:bg-red-50 hover:text-red-800"
                    aria-label="Quitar medio de pago"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-stone-400">
                  {row.method === "efectivo" ? "Efectivo" : "Monto S/"}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(e) => update(index, { amount: e.target.value })}
                    placeholder="0.00"
                    className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-bold text-stone-900 outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
                  />
                </label>
                {CHANGE_METHODS.has(row.method) ? (
                  <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-stone-400">
                    Recibido S/
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={row.received}
                      onChange={(e) => update(index, { received: e.target.value })}
                      placeholder={row.amount || "0.00"}
                      className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-bold text-stone-900 outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
                    />
                  </label>
                ) : (
                  <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-stone-400">
                    {referenceMethodLabel(row.method)}
                    <input
                      type="text"
                      value={row.reference}
                      onChange={(e) => update(index, { reference: e.target.value })}
                      placeholder="Opcional"
                      maxLength={40}
                      className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-bold text-stone-900 outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
                    />
                  </label>
                )}
              </div>
              {CHANGE_METHODS.has(row.method) &&
                parsedRow.receivedCents !== null &&
                parsedRow.receivedCents > parsedRow.amountCents && (
                  <p className="mt-1 text-xs font-bold text-emerald-700">
                    Vuelto de este pago:{" "}
                    {formatPEN(parsedRow.receivedCents - parsedRow.amountCents)}
                  </p>
                )}
            </div>
          );
        })}
      </div>

      {rows.length < 5 && (
        <button
          type="button"
          onClick={addRow}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-stone-300 py-2.5 text-xs font-bold text-stone-600 transition hover:border-red-900 hover:text-red-900"
        >
          <Plus className="h-4 w-4" />
          Dividir en otro medio de pago
        </button>
      )}

      <div className="mt-3 rounded-xl bg-stone-50 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-stone-600">Cubre</span>
          <span className="font-bold text-stone-900">{formatPEN(covered)}</span>
        </div>
        {pending > 0 && (
          <p className="mt-1 text-xs font-bold text-red-700">
            Falta {formatPEN(pending)}
          </p>
        )}
        {pending < 0 && (
          <p className="mt-1 text-xs font-bold text-red-700">
            Sobra {formatPEN(-pending)}: ajusta los montos.
          </p>
        )}
        {pending === 0 && changeTotal > 0 && (
          <p className="mt-1 text-sm font-bold text-emerald-700">
            Vuelto total: {formatPEN(changeTotal)}
          </p>
        )}
        {pending === 0 && changeTotal === 0 && (
          <p className="mt-1 text-xs font-bold text-emerald-700">
            El pago cuadra exactamente.
          </p>
        )}
      </div>

      {error && (
        <p
          className="mt-3 rounded-lg bg-red-50 p-3 text-center text-sm font-bold text-red-800"
          role="alert"
        >
          {error}
        </p>
      )}
      <p className="mt-3 text-center text-[11px] text-stone-400">
        El total se calcula en el servidor con tus precios registrados.
      </p>
    </Modal>
  );
}
