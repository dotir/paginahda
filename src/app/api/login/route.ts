import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  authConfigured,
  createSession,
  expectedUser,
} from "@/app/lib/auth";
import { verifyPassword, safeEqual } from "@/app/lib/password";
import { getUserCredentials } from "@/app/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!authConfigured() && !process.env.TURSO_DATABASE_URL) {
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
  if (typeof user !== "string" || typeof password !== "string") {
    return NextResponse.json(
      { error: "Usuario o clave incorrectos." },
      { status: 401 },
    );
  }

  try {
    const record = await getUserCredentials(user);
    if (record) {
      if (record.active !== 1) {
        return NextResponse.json(
          { error: "Ese usuario está desactivado." },
          { status: 403 },
        );
      }
      if (!verifyPassword(password, record.salt, record.hash)) {
        return NextResponse.json(
          { error: "Usuario o clave incorrectos." },
          { status: 401 },
        );
      }
      const token = await createSession({
        username: record.username,
        role: record.role,
      });
      if (!token) {
        return NextResponse.json({ error: "Error interno." }, { status: 500 });
      }
      return withSession(token, record.username, record.role);
    }
  } catch {
    // Si la BD no responde, cae al flujo de variables de entorno.
  }

  const ok =
    safeEqual(user, expectedUser()) &&
    safeEqual(password, process.env.POS_PASSWORD as string);
  if (!ok) {
    return NextResponse.json(
      { error: "Usuario o clave incorrectos." },
      { status: 401 },
    );
  }
  const token = await createSession({ username: expectedUser(), role: "admin" });
  if (!token) {
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
  return withSession(token, expectedUser(), "admin");
}

function withSession(token: string, username: string, role: string) {
  const res = NextResponse.json({ ok: true, user: username, role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
