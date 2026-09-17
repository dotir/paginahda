"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (user.trim() === "" || password === "") {
      setError("Ingresa usuario y clave.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: user.trim(), password }),
      });
      if (!res.ok) {
        let message = "No se pudo ingresar.";
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) message = data.error;
        } catch {
          // ignorar
        }
        throw new Error(message);
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo ingresar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-stone-500">
        Usuario
        <input
          type="text"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          autoComplete="username"
          autoFocus
          placeholder="Tu usuario"
          className="rounded-xl border border-stone-300 px-4 py-3 text-sm font-normal normal-case tracking-normal text-stone-900 outline-none placeholder:text-stone-400 focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-stone-500">
        Clave
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="Tu clave"
          className="rounded-xl border border-stone-300 px-4 py-3 text-sm font-normal normal-case tracking-normal text-stone-900 outline-none placeholder:text-stone-400 focus:border-red-900 focus:ring-2 focus:ring-red-900/20"
        />
      </label>
      {error && (
        <p className="rounded-lg bg-red-50 p-2.5 text-center text-sm font-bold text-red-800" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="mt-1 rounded-xl bg-red-900 py-3 text-sm font-bold text-white hover:bg-red-950 disabled:opacity-50"
      >
        {loading ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
