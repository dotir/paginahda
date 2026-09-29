export const SESSION_COOKIE = "el_arbolito_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export type Role = "admin" | "cajero";

export type SessionUser = {
  username: string;
  role: Role;
};

export function authConfigured(): boolean {
  return !!process.env.POS_PASSWORD;
}

export function expectedUser(): string {
  return process.env.POS_USER || "admin";
}

function secret(): string | null {
  return process.env.POS_SECRET ?? process.env.POS_PASSWORD ?? null;
}

function bytesToB64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmacB64url(data: string): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(data),
  );
  return bytesToB64url(new Uint8Array(sig));
}

function payload(username: string, role: Role, exp: number): string {
  return `v2.${exp}.${bytesToB64url(new TextEncoder().encode(username))}.${role}`;
}

export async function createSession(user: SessionUser): Promise<string | null> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const body = payload(user.username, user.role, exp);
  const sig = await hmacB64url(body);
  if (!sig) return null;
  return `${body}.${sig}`;
}

function slowEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "v2") return null;
  const exp = Number(parts[1]);
  if (!Number.isInteger(exp) || exp * 1000 < Date.now()) return null;
  if (parts[3] !== "admin" && parts[3] !== "cajero") return null;
  const sig = await hmacB64url(parts.slice(0, 4).join("."));
  if (!sig) return null;
  if (!slowEqual(sig, parts[4])) return null;
  const bytes = b64urlToBytes(parts[2]);
  if (!bytes) return null;
  const username = new TextDecoder().decode(bytes);
  if (username.length === 0 || username.length > 40) return null;
  return { username, role: parts[3] as Role };
}

export function canSeeCosts(role: Role): boolean {
  return role === "admin";
}

export function canVoidSales(role: Role): boolean {
  return role === "admin";
}

export function canManageUsers(role: Role): boolean {
  return role === "admin";
}

export function canEditCatalog(role: Role): boolean {
  return role === "admin";
}
