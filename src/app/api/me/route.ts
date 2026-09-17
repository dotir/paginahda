import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  authConfigured,
  expectedUser,
  verifySession,
} from "@/app/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!authConfigured()) {
    return NextResponse.json({ auth: false, user: null });
  }
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  const token = cookie ? decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1)) : "";
  const valid = token ? await verifySession(token) : false;
  return NextResponse.json({ auth: true, user: valid ? expectedUser() : null });
}
