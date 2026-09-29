import { NextResponse } from "next/server";
import { authConfigured } from "@/app/lib/auth";
import { getSessionUser } from "@/app/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!authConfigured()) {
    return NextResponse.json({ auth: false, user: "local", role: "admin" });
  }
  const session = await getSessionUser(request);
  return NextResponse.json({
    auth: true,
    user: session?.username ?? null,
    role: session?.role ?? null,
  });
}
