import { NextResponse } from "next/server";
import { ValidationError, moveSaleDate, voidSale } from "@/app/db";
import { canVoidSales } from "@/app/lib/auth";
import { getSessionUser } from "@/app/lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (!canVoidSales(session.role)) {
    return NextResponse.json(
      { error: "Solo un administrador puede anular ventas." },
      { status: 403 },
    );
  }
  let reason = "";
  try {
    const body = (await request.json()) as { reason?: unknown };
    reason = typeof body.reason === "string" ? body.reason : "";
  } catch {
    return NextResponse.json(
      { error: "Indica el motivo de la anulación." },
      { status: 400 },
    );
  }
  try {
    const { id } = await params;
    const sales = await voidSale({
      id: Number(id),
      reason,
      user: session.username,
    });
    return NextResponse.json(sales);
  } catch (error) {
    if (error instanceof ValidationError) {
      const status = error.message === "Venta no encontrada." ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
}

/** Mueve la venta a otro día (solo admin, exige motivo). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (!canVoidSales(session.role)) {
    return NextResponse.json(
      { error: "Solo un administrador puede cambiar la fecha de una venta." },
      { status: 403 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Indica la nueva fecha y el motivo." },
      { status: 400 },
    );
  }
  const { date, reason } = body as { date?: unknown; reason?: unknown };
  try {
    const { id } = await params;
    const sales = await moveSaleDate({
      id: Number(id),
      date: typeof date === "string" ? date : "",
      reason: typeof reason === "string" ? reason : "",
      user: session.username,
    });
    return NextResponse.json(sales);
  } catch (error) {
    if (error instanceof ValidationError) {
      const status = error.message === "Venta no encontrada." ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
}
