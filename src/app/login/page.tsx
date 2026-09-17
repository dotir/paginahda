import { redirect } from "next/navigation";
import { Wine } from "lucide-react";
import { authConfigured } from "@/app/lib/auth";
import LoginForm from "./form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  if (!authConfigured()) {
    redirect("/");
  }
  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-8 shadow-lg">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-900 text-amber-100 shadow">
            <Wine className="h-8 w-8" />
          </span>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-stone-900">
            El Arbolito
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Ingresa para usar el punto de venta
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
