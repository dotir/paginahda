import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  authConfigured,
  createSession,
  expectedUser,
} from "@/app/lib/auth";

export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export async function POST(request: Request) {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: "Login no configurado en el servidor." },
      { status: 400 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }
  const { user, password } = body as { user?: unknown; password?: unknown };
  const ok =
    typeof user === "string" &&
    typeof password === "string" &&
    safeEqual(user, expectedUser()) &&
    safeEqual(password, process.env.POS_PASSWORD as string);
  if (!ok) {
    return NextResponse.json(
      { error: "Usuario o clave incorrectos." },
      { status: 401 },
    );
  }
  const token = await createSession();
  if (!token) {
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
