export const SESSION_COOKIE = "el_arbolito_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

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

export async function createSession(): Promise<string | null> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `v1.${exp}`;
  const sig = await hmacB64url(payload);
  if (!sig) return null;
  return `${payload}.${sig}`;
}

function slowEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifySession(token: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isInteger(exp) || exp * 1000 < Date.now()) return false;
  const sig = await hmacB64url(`${parts[0]}.${parts[1]}`);
  if (!sig) return false;
  return slowEqual(sig, parts[2]);
}
