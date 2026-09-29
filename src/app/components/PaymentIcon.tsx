import {
  Banknote,
  CreditCard,
  Smartphone,
  Wallet,
} from "lucide-react";
import type { PaymentMethod } from "@/app/lib/types";

export function PaymentIcon({ method }: { method: PaymentMethod }) {
  if (method === "efectivo") return <Banknote className="h-4 w-4" />;
  if (method === "tarjeta") return <CreditCard className="h-4 w-4" />;
  if (method === "yape" || method === "plin") {
    return <Smartphone className="h-4 w-4" />;
  }
  return <Wallet className="h-4 w-4" />;
}
