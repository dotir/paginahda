import { NextResponse } from "next/server";
import { getProducts, getSalesForReport } from "@/app/db";
import { getSessionUser } from "@/app/lib/session";

export const dynamic = "force-dynamic";

/**
 * Reporte de ventas por rango de fechas (CSV), para abrir en Excel.
 * Respeta el rol: un cajero no recibe costos ni ganancias.
 */
export async function GET(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const user = url.searchParams.get("user");

  const sales = await getSalesForReport({
    from: from ?? undefined,
    to: to ?? undefined,
    user: user ?? undefined,
  });
  const showCosts = session.role === "admin";

  const dec = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  const rows: string[] = [];
  if (showCosts) {
    rows.push(
      "Venta;Fecha;Hora;Cajero;Método de pago;Referencia;Producto;Presentación;Cantidad;Precio unit. (S/);Descuento (S/);Subtotal (S/);Costo unit. (S/);Ganancia (S/)",
    );
  } else {
    rows.push(
      "Venta;Fecha;Hora;Cajero;Método de pago;Referencia;Producto;Presentación;Cantidad;Precio unit. (S/);Descuento (S/);Subtotal (S/)",
    );
  }

  let total = 0;
  let profit = 0;
  let profitKnown = false;
  let discounts = 0;
  for (const sale of sales) {
    const date = new Date(sale.createdAt);
    const fecha = date.toLocaleDateString("es-PE");
    const hora = date.toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
    });
    total += sale.totalCents;
    for (const item of sale.items) {
      discounts += item.discountCents;
      const lineProfit =
        item.unitCostCents === null
          ? null
          : (item.unitPriceCents - item.unitCostCents) * item.quantity -
            item.discountCents;
      if (lineProfit !== null) {
        profit += lineProfit;
        profitKnown = true;
      }
      const base = [
        sale.id,
        fecha,
        hora,
        sale.user ?? "—",
        sale.paymentMethod,
        sale.payments.map((p) => p.reference ?? "—").join(" / "),
        `"${item.name.replace(/"/g, '""')}"`,
        item.presentation ? `"${item.presentation.replace(/"/g, '""')}"` : "—",
        item.quantity,
        dec(item.unitPriceCents),
        item.discountCents > 0 ? dec(item.discountCents) : "—",
        dec(item.totalCents),
      ];
      if (showCosts) {
        base.push(
          item.unitCostCents === null ? "—" : dec(item.unitCostCents),
          lineProfit === null ? "—" : dec(lineProfit),
        );
      }
      rows.push(base.join(";"));
    }
  }
  rows.push("");
  rows.push(`Rango;${from ?? "inicio"} → ${to ?? "hoy"}`);
  rows.push(`Ventas;${sales.length}`);
  rows.push(`Total vendido (S/);${dec(total)}`);
  rows.push(`Descuentos (S/);${dec(discounts)}`);
  if (showCosts) {
    rows.push(
      `Ganancia (S/);${profitKnown ? dec(profit) : "— (registra los costos en Catálogo)"}`,
    );
  }

  const csv = "﻿" + rows.join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="reporte-ventas-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Inventario actual en CSV (solo admin: incluye costo). */
export async function POST(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "Solo un administrador puede exportar el inventario." },
      { status: 403 },
    );
  }
  const products = await getProducts();
  const dec = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  const rows = [
    "Producto;Categoría;Presentación;Activo;Precio (S/);Costo (S/);Stock;Stock mínimo;Ganancia potencial (S/)",
  ];
  for (const p of products) {
    const potential =
      p.stock !== null && p.priceCents !== null && p.costCents !== null
        ? (p.priceCents - p.costCents) * p.stock
        : null;
    rows.push(
      [
        `"${p.name.replace(/"/g, '""')}"`,
        p.category,
        p.presentation ?? "—",
        p.active === 1 ? "Sí" : "No",
        p.priceCents === null ? "—" : dec(p.priceCents),
        p.costCents === null ? "—" : dec(p.costCents),
        p.stock === null ? "sin control" : String(p.stock),
        p.stockMin === null ? "—" : String(p.stockMin),
        potential === null ? "—" : dec(potential),
      ].join(";"),
    );
  }
  return new NextResponse("﻿" + rows.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="inventario-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
