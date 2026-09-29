import { authConfigured, SESSION_COOKIE, type SessionUser } from "@/app/lib/auth";

/** Lee el usuario de la cookie de sesión. null si no hay sesión válida. */
export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  if (!authConfigured()) {
    return { username: "local", role: "admin" };
  }
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) return null;
  const token = decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1));
  if (!token) return null;
  const { verifySession } = await import("@/app/lib/auth");
  return verifySession(token);
}
