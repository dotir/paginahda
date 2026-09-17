import { NextResponse } from "next/server";
import {
  ValidationError,
  createProduct,
  getProducts,
  updateProduct,
} from "@/app/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getProducts());
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }
  const { name, category, presentation, priceCents, costCents } = body as {
    name?: unknown;
    category?: unknown;
    presentation?: unknown;
    priceCents?: unknown;
    costCents?: unknown;
  };
  try {
    if (typeof name !== "string" || typeof category !== "string") {
      throw new ValidationError("Nombre y categoría son obligatorios.");
    }
    if (
      presentation !== undefined &&
      presentation !== null &&
      typeof presentation !== "string"
    ) {
      throw new ValidationError("Presentación inválida.");
    }
    const products = await createProduct({
      name,
      category,
      presentation:
        typeof presentation === "string" ? presentation : undefined,
      priceCents: optionalCents(priceCents),
      costCents: optionalCents(costCents),
    });
    return NextResponse.json(products, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
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
  const { id, priceCents, costCents, active, presentation } = body as {
    id?: unknown;
    priceCents?: unknown;
    costCents?: unknown;
    active?: unknown;
    presentation?: unknown;
  };
  try {
    let pres: string | null | undefined;
    if (presentation === undefined) pres = undefined;
    else if (presentation === null || typeof presentation === "string") {
      pres = presentation;
    } else {
      throw new ValidationError("Presentación inválida.");
    }
    const products = await updateProduct(typeof id === "number" ? id : NaN, {
      priceCents: optionalCents(priceCents),
      costCents: optionalCents(costCents),
      active: typeof active === "boolean" ? active : undefined,
      presentation: pres,
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
