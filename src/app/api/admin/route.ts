import { NextResponse } from "next/server";
import {
  ForbiddenError,
  ValidationError,
  createUser,
  getAuditLog,
  getStockMovements,
  getUsers,
  updateUser,
} from "@/app/db";
import { canManageUsers, type Role } from "@/app/lib/auth";
import { getSessionUser } from "@/app/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (!canManageUsers(session.role)) {
    return NextResponse.json(
      { error: "Solo un administrador puede ver esta información." },
      { status: 403 },
    );
  }
  const [users, stock, audit] = await Promise.all([
    getUsers(),
    getStockMovements(50),
    getAuditLog(50),
  ]);
  return NextResponse.json({ users, stock, audit });
}

export async function POST(request: Request) {
  const session = await getSessionUser(request);
  if (!session || !canManageUsers(session.role)) {
    return NextResponse.json(
      { error: "Solo un administrador puede crear usuarios." },
      { status: 403 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }
  const { username, password, role } = body as Record<string, unknown>;
  try {
    const users = await createUser({
      username: typeof username === "string" ? username : "",
      password: typeof password === "string" ? password : "",
      role: role as Role,
    });
    return NextResponse.json(users, { status: 201 });
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

export async function PATCH(request: Request) {
  const session = await getSessionUser(request);
  if (!session || !canManageUsers(session.role)) {
    return NextResponse.json(
      { error: "Solo un administrador puede editar usuarios." },
      { status: 403 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }
  const { id, role, active, password } = body as Record<string, unknown>;
  try {
    const users = await updateUser(typeof id === "number" ? id : NaN, {
      role: typeof role === "string" ? (role as Role) : undefined,
      active: typeof active === "boolean" ? active : undefined,
      password: typeof password === "string" && password !== "" ? password : undefined,
    });
    return NextResponse.json(users);
  } catch (error) {
    if (error instanceof ValidationError) {
      const status = error.message === "Usuario no encontrado." ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
}
