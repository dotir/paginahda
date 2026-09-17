import { NextResponse } from "next/server";
import { ValidationError, getProducts, updateProduct } from "@/app/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getProducts());
}

function optionalCents(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "number" ? value : NaN;
}

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }
  const { id, priceCents, costCents } = body as {
    id?: unknown;
    priceCents?: unknown;
    costCents?: unknown;
  };
  try {
    const products = await updateProduct(typeof id === "number" ? id : NaN, {
      priceCents: optionalCents(priceCents),
      costCents: optionalCents(costCents),
    });
    return NextResponse.json(products);
  } catch (error) {
    if (error instanceof ValidationError) {
      const status = error.message === "Producto no encontrado." ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
}
