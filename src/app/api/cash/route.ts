import { NextResponse } from "next/server";
import { ValidationError, getCashSessions, openCashSession } from "@/app/db";
import { getSessionUser } from "@/app/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  return NextResponse.json(await getCashSessions());
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
  const { openingCents } = body as { openingCents?: unknown };
  try {
    const opened = await openCashSession({
      openingCents: typeof openingCents === "number" ? openingCents : NaN,
      user: session.username,
    });
    return NextResponse.json(opened, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
}
