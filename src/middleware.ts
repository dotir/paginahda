import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  authConfigured,
  verifySession,
} from "@/app/lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/api/login", "/api/logout", "/api/me"]);

export async function middleware(request: Request) {
  const url = new URL(request.url);
  const { pathname } = url;
  if (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.match(/\.(svg|png|jpg|jpeg|webp|ico)$/)
  ) {
    return NextResponse.next();
  }
  // Sin POS_PASSWORD el acceso es libre (modo local).
  if (!authConfigured()) {
    return NextResponse.next();
  }
  const cookies = request.headers.get("cookie") ?? "";
  const token =
    cookies
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
      ?.slice(SESSION_COOKIE.length + 1) ?? "";
  const valid = token
    ? await verifySession(decodeURIComponent(token))
    : false;
  if (!valid && !PUBLIC_PATHS.has(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", url));
  }
  if (valid && pathname === "/login") {
    return NextResponse.redirect(new URL("/", url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
