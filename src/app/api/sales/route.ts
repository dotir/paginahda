import { NextResponse } from "next/server";
import { ValidationError, createSale, getSales } from "@/app/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getSales());
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }
  const { requestId, items, paymentMethod, receivedCents } = body as {
    requestId?: unknown;
    items?: unknown;
    paymentMethod?: unknown;
    receivedCents?: unknown;
  };
  try {
    const { sale, created } = await createSale({
      requestId: typeof requestId === "string" ? requestId : "",
      items: Array.isArray(items) ? items : [],
      paymentMethod: typeof paymentMethod === "string" ? paymentMethod : "",
      receivedCents:
        receivedCents === null || receivedCents === undefined
          ? null
          : typeof receivedCents === "number"
            ? receivedCents
            : NaN,
    });
    return NextResponse.json(sale, { status: created ? 201 : 200 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
}
