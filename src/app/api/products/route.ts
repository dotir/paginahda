import { NextResponse } from "next/server";
import {
  ForbiddenError,
  ReceiptLine,
  ValidationError,
  createProduct,
  deleteProduct,
  getProducts,
  receiveStock,
  updateProduct,
} from "@/app/db";
import { canEditCatalog } from "@/app/lib/auth";
import { getSessionUser } from "@/app/lib/session";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof ValidationError) {
    const status = error.message === "Producto no encontrado." ? 404 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return NextResponse.json({ error: "Error interno." }, { status: 500 });
}

export async function GET(request: Request) {
  const session = await getSessionUser(request);
  const products = await getProducts();
  if (!session || session.role === "admin") {
    return NextResponse.json(products);
  }
  // Un cajero no necesita el costo: se lo quitamos antes de que salga del servidor.
  return NextResponse.json(
    products.map((p) => ({ ...p, costCents: null })),
  );
}

export async function POST(request: Request) {
  const session = await getSessionUser(request);
  if (!session || !canEditCatalog(session.role)) {
    return NextResponse.json(
      { error: "Solo un administrador puede crear productos." },
      { status: 403 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }
  const {
    name,
    category,
    presentation,
    imageUrl,
    priceCents,
    costCents,
    stock,
    stockMin,
    unitsPerBox,
    boxCostCents,
  } = body as Record<string, unknown>;
  try {
    if (typeof name !== "string" || typeof category !== "string") {
      throw new ValidationError("Nombre y categoría son obligatorios.");
    }
    const products = await createProduct({
      name,
      category,
      presentation:
        typeof presentation === "string" ? presentation : undefined,
      imageUrl: optionalText(imageUrl),
      priceCents: optionalCents(priceCents),
      costCents: optionalCents(costCents),
      stock: optionalCount(stock),
      stockMin: optionalCount(stockMin),
      unitsPerBox: optionalCount(unitsPerBox),
      boxCostCents: optionalCents(boxCostCents),
    });
    return NextResponse.json(products, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const session = await getSessionUser(request);
  if (!session || !canEditCatalog(session.role)) {
    return NextResponse.json(
      { error: "Solo un administrador puede editar el catálogo." },
      { status: 403 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }
  const {
    id,
    priceCents,
    costCents,
    active,
    presentation,
    imageUrl,
    stock,
    stockMin,
    unitsPerBox,
    boxCostCents,
  } = body as Record<string, unknown>;
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
      imageUrl: optionalText(imageUrl),
      stock: optionalCount(stock),
      stockMin: optionalCount(stockMin),
      unitsPerBox: optionalCount(unitsPerBox),
      boxCostCents: optionalCents(boxCostCents),
    });
    return NextResponse.json(products);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const session = await getSessionUser(request);
  if (!session || !canEditCatalog(session.role)) {
    return NextResponse.json(
      { error: "Solo un administrador puede eliminar productos." },
      { status: 403 },
    );
  }
  let id = 0;
  try {
    const body = (await request.json()) as { id?: unknown };
    id = typeof body.id === "number" ? body.id : NaN;
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }
  try {
    const products = await deleteProduct(id, session.username);
    return NextResponse.json(products);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Recepción de mercadería: suma stock por cajas o por unidades sueltas. */
export async function PUT(request: Request) {
  const session = await getSessionUser(request);
  if (!session || !canEditCatalog(session.role)) {
    return NextResponse.json(
      { error: "Solo un administrador puede registrar la recepción de mercadería." },
      { status: 403 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }
  const { lines, note } = body as { lines?: unknown; note?: unknown };
  try {
    const result = await receiveStock({
      lines: Array.isArray(lines) ? (lines as ReceiptLine[]) : [],
      user: session.username,
      note: typeof note === "string" ? note : null,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
}

function optionalCents(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "number" ? value : NaN;
}

function optionalCount(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "number" ? value : NaN;
}

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string") return value;
  throw new ValidationError("Texto inválido.");
}
