import { NextResponse } from "next/server";
import { ValidationError, closeCashSession, getCashSessions } from "@/app/db";
import { getSessionUser } from "@/app/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
  const { countedCents, note } = body as {
    countedCents?: unknown;
    note?: unknown;
  };
  try {
    const { id } = await params;
    const sessions = await closeCashSession({
      id: Number(id),
      countedCents: typeof countedCents === "number" ? countedCents : NaN,
      note: typeof note === "string" ? note : null,
      user: session.username,
    });
    return NextResponse.json(sessions);
  } catch (error) {
    if (error instanceof ValidationError) {
      const status = error.message === "Caja no encontrada." ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(await getCashSessions());
}
