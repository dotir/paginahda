"use client";

import { useState } from "react";
import { DoorClosed, DoorOpen, Wallet } from "lucide-react";
import { formatDate, formatPEN, parseSolesToCentsOrZero, type CashSession } from "@/app/lib/ui";

type Props = {
  sessions: CashSession[];
  currentUser: string;
  onOpen: (openingCents: number) => Promise<void>;
  onClose: (id: number, countedCents: number, note: string) => Promise<void>;
};

export default function CashView({ sessions, currentUser, onOpen, onClose }: Props) {
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = sessions.find((s) => s.closedAt === null) ?? null;
  const closed = sessions.filter((s) => s.closedAt !== null);

  async function submitOpen() {
    const cents = opening.trim() === "" ? 0 : parseSolesToCentsOrZero(opening);
    if (cents === null) {
      setError("El fondo de caja debe ser un monto válido (ej. 50.00).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onOpen(cents);
      setOpening("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir la caja.");
    } finally {
      setBusy(false);
    }
  }

  async function submitClose(id: number) {
    const cents = parseSolesToCentsOrZero(counted);
    if (cents === null) {
      setError("Cuenta el efectivo y escribe el total (ej. 120.50).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onClose(id, cents, note);
      setCounted("");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar la caja.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Caja" className="flex flex-col gap-3">
      {open ? (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-sm font-extrabold text-emerald-900">
            <DoorOpen className="h-4 w-4" />
            Caja abierta · #{open.id}
          </p>
          <p className="mt-1 text-xs text-emerald-800">
            Abierta por {open.openedBy ?? "—"} el {formatDate(open.openedAt)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-white p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">
                Fondo
              </p>
              <p className="mt-0.5 text-lg font-extrabold text-stone-900">
                {formatPEN(open.openingCents)}
              </p>
            </div>
            <div className="rounded-xl bg-white p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">
                Ventas
              </p>
              <p className="mt-0.5 text-lg font-extrabold text-stone-900">
                {open.salesCount}
              </p>
            </div>
            <div className="rounded-xl bg-white p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">
                Total vendido
              </p>
              <p className="mt-0.5 text-lg font-extrabold text-stone-900">
                {formatPEN(open.salesTotalCents)}
              </p>
            </div>
            <div className="rounded-xl bg-white p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">
                Efectivo en caja
              </p>
              <p className="mt-0.5 text-lg font-extrabold text-emerald-700">
                {formatPEN(open.cashTotalCents)}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-stone-900">
            <DoorClosed className="h-5 w-5 text-red-900" />
            Abrir caja
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Indica cuánto efectivo hay en la gaveta al empezar el turno. Las
            ventas se cuentan en este turno.
          </p>
          <label className="mt-3 flex max-w-xs flex-col gap-1 text-xs font-bold text-stone-500">
            Fondo de caja (S/)
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={opening}
              onChange={(e) => {
                setOpening(e.target.value);
                setError(null);
              }}
              placeholder="0.00"
              className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-bold text-stone-900 outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
            />
          </label>
          <button
            type="button"
            onClick={submitOpen}
            disabled={busy}
            className="mt-3 w-full max-w-xs rounded-xl bg-red-900 py-3 text-sm font-bold text-white transition hover:bg-red-950 disabled:opacity-50"
          >
            {busy ? "Abriendo…" : "Abrir caja"}
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

      {open && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-extrabold text-stone-900">
            Cerrar turno (esperado {formatPEN(open.cashTotalCents)})
          </h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-bold text-stone-500">
              Conté en caja (S/)
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={counted}
                onChange={(e) => {
                  setCounted(e.target.value);
                  setError(null);
                }}
                placeholder={formatPEN(open.cashTotalCents)}
                className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-bold text-stone-900 outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-stone-500">
              Nota (opcional)
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder="Ej. entregué vuelto a la dueña"
                className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => submitClose(open.id)}
            disabled={busy}
            className="mt-3 rounded-xl bg-stone-900 py-3 text-sm font-bold text-white transition hover:bg-stone-700 disabled:opacity-50"
          >
            {busy ? "Cerrando…" : "Cerrar caja"}
          </button>
        </div>
      )}

      {closed.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <h3 className="flex items-center gap-2 border-b border-stone-100 px-3 py-2.5 text-sm font-extrabold text-stone-900">
            <Wallet className="h-4 w-4 text-red-900" />
            Turnos anteriores
          </h3>
          <ul className="divide-y divide-stone-100">
            {closed.map((s) => {
              const diff =
                s.countedCents === null ? null : s.countedCents - (s.expectedCents ?? 0);
              return (
                <li key={s.id} className="px-3 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-stone-900 px-2 py-0.5 text-xs font-extrabold text-white">
                      #{s.id}
                    </span>
                    <span className="text-xs text-stone-500">
                      {formatDate(s.openedAt)}
                      {s.closedAt ? ` → ${formatDate(s.closedAt)}` : ""}
                    </span>
                    <span className="ml-auto text-sm font-extrabold text-stone-900">
                      {s.salesCount} ventas · {formatPEN(s.salesTotalCents)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-stone-600">
                    Fondo {formatPEN(s.openingCents)} · esperado{" "}
                    {formatPEN(s.expectedCents ?? 0)} · contado{" "}
                    {s.countedCents === null ? "—" : formatPEN(s.countedCents)}
                    {diff !== null && diff !== 0 && (
                      <span
                        className={`ml-1 font-bold ${
                          diff > 0 ? "text-emerald-700" : "text-red-700"
                        }`}
                      >
                        ({diff > 0 ? "+" : ""}
                        {formatPEN(diff)})
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-stone-400">
                    {s.openedBy ?? "—"} → {s.closedBy ?? "—"}
                    {s.note ? ` · ${s.note}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="text-xs text-stone-400">
        Sesión actual: {currentUser}
      </p>
    </section>
  );
}
