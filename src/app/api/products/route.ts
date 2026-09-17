import { NextResponse } from "next/server";
import { ValidationError, getProducts, updateProductPrice } from "@/app/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getProducts());
}

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }
  const { id, priceCents } = body as { id?: unknown; priceCents?: unknown };
  try {
    const products = updateProductPrice(
      typeof id === "number" ? id : NaN,
      typeof priceCents === "number" ? priceCents : NaN,
    );
    return NextResponse.json(products);
  } catch (error) {
    if (error instanceof ValidationError) {
      const status = error.message === "Producto no encontrado." ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
}
