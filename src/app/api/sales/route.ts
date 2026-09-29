import { NextResponse } from "next/server";
import {
  ForbiddenError,
  SalePaymentInput,
  ValidationError,
  createSale,
  getSales,
} from "@/app/db";
import { getSessionUser } from "@/app/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const user = url.searchParams.get("user");
  const includeVoided = url.searchParams.get("includeVoided") === "1";
  return NextResponse.json(
    await getSales({
      from: from ?? undefined,
      to: to ?? undefined,
      user: user ?? undefined,
      includeVoided: includeVoided || session.role === "admin",
    }),
  );
}

export async function POST(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }
  const { requestId, items, paymentMethod, receivedCents, payments } =
    body as Record<string, unknown>;
  try {
    const { sale, created } = await createSale({
      requestId: typeof requestId === "string" ? requestId : "",
      items: Array.isArray(items)
        ? (items as Array<{
            productId: number;
            quantity: number;
            discountCents?: number;
          }>)
        : [],
      paymentMethod: typeof paymentMethod === "string" ? paymentMethod : "",
      receivedCents:
        receivedCents === null || receivedCents === undefined
          ? null
          : typeof receivedCents === "number"
            ? receivedCents
            : NaN,
      payments: Array.isArray(payments)
        ? (payments as SalePaymentInput[])
        : undefined,
      user: session.username,
    });
    return NextResponse.json(sale, { status: created ? 201 : 200 });
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
