"use client";

import { useState } from "react";
import { ScrollText, ShieldCheck, UserPlus, Users } from "lucide-react";
import { formatDate, type AuditEntry, type PosUser, type Role } from "@/app/lib/ui";

type Props = {
  users: PosUser[];
  audit: AuditEntry[];
  currentUser: string;
  onCreate: (username: string, password: string, role: Role) => Promise<void>;
  onUpdate: (
    id: number,
    patch: { role?: Role; active?: boolean; password?: string },
  ) => Promise<void>;
};

export default function AdminView({
  users,
  audit,
  currentUser,
  onCreate,
  onUpdate,
}: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("cajero");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetId, setResetId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onCreate(username, password, role);
      setUsername("");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(id: number) {
    setBusy(true);
    setError(null);
    try {
      await onUpdate(id, { password: resetPassword });
      setResetId(null);
      setResetPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Administración" className="flex flex-col gap-3">
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-stone-900">
          <UserPlus className="h-5 w-5 text-red-900" />
          Agregar usuario
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          El <strong>administrador</strong> ve costos y ganancias, edita el
          catálogo, anula ventas y gestiona usuarios. El <strong>cajero</strong>{" "}
          solo registra ventas: no ve costos ni puede anular.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-bold text-stone-500">
            Usuario
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={40}
              placeholder="cajero1"
              className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-normal text-stone-900 outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-stone-500">
            Clave
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={100}
              placeholder="mínimo 4"
              className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-normal text-stone-900 outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-stone-500">
            Rol
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-bold text-stone-900 outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
            >
              <option value="cajero">Cajero</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={busy || username.trim() === "" || password === ""}
            className="self-end rounded-xl bg-red-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-950 disabled:opacity-50"
          >
            {busy ? "Creando…" : "Crear"}
          </button>
        </div>
        {error && (
          <p
            className="mt-2 rounded-lg bg-red-50 p-2 text-sm font-bold text-red-800"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <h3 className="flex items-center gap-2 border-b border-stone-100 px-3 py-2.5 text-sm font-extrabold text-stone-900">
          <Users className="h-4 w-4 text-red-900" />
          Usuarios ({users.length})
        </h3>
        <ul className="divide-y divide-stone-100">
          {users.map((u) => (
            <li key={u.id} className="px-3 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-extrabold text-stone-900">{u.username}</span>
                {u.username === currentUser && (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase text-red-800">
                    Tú
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    u.role === "admin"
                      ? "bg-purple-100 text-purple-800"
                      : "bg-stone-200 text-stone-700"
                  }`}
                >
                  {u.role === "admin" ? "Administrador" : "Cajero"}
                </span>
                {u.active !== 1 && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-800">
                    Desactivado
                  </span>
                )}
                <span className="ml-auto flex gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdate(u.id, { role: u.role === "admin" ? "cajero" : "admin" })
                    }
                    disabled={busy}
                    className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-bold text-stone-600 transition hover:border-red-900 hover:text-red-900 disabled:opacity-50"
                  >
                    {u.role === "admin" ? "Bajar a cajero" : "Subir a admin"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdate(u.id, { active: u.active !== 1 })}
                    disabled={busy}
                    className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-bold text-stone-600 transition hover:border-red-900 hover:text-red-900 disabled:opacity-50"
                  >
                    {u.active === 1 ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResetId(resetId === u.id ? null : u.id);
                      setError(null);
                    }}
                    className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-bold text-stone-600 transition hover:border-red-900 hover:text-red-900"
                  >
                    Clave
                  </button>
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-stone-400">
                Creado {formatDate(u.createdAt)}
              </p>
              {resetId === u.id && (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="Nueva clave"
                    maxLength={100}
                    className="flex-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs outline-none focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
                  />
                  <button
                    type="button"
                    onClick={() => submitReset(u.id)}
                    disabled={busy || resetPassword.length < 4}
                    className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-stone-700 disabled:opacity-50"
                  >
                    Guardar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-stone-900">
          <ScrollText className="h-4 w-4 text-red-900" />
          Auditoría reciente
        </h3>
        <ul className="mt-2 flex flex-col gap-1.5">
          {audit.length === 0 && (
            <li className="text-xs text-stone-400">Sin movimientos aún.</li>
          )}
          {audit.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center gap-2 border-b border-stone-100 pb-1.5 text-xs text-stone-600 last:border-0"
            >
              <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-600">
                {a.action}
              </span>
              <span className="min-w-0 flex-1">{a.detail}</span>
              <span className="text-stone-400">
                {a.user ?? "—"} · {formatDate(a.at)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-stone-400">
        <ShieldCheck className="h-4 w-4" />
        Cada venta, anulación, ajuste de stock y cambio de usuario queda
        registrado aquí.
      </p>
    </section>
  );
}
