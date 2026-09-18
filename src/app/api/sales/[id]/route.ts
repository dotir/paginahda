import { NextResponse } from "next/server";
import { ValidationError, deleteSale } from "@/app/db";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sales = await deleteSale(Number(id));
    return NextResponse.json(sales);
  } catch (error) {
    if (error instanceof ValidationError) {
      const status =
        error.message === "Venta no encontrada." ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
}
