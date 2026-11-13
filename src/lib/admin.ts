import { env } from "cloudflare:workers";

export const ADMIN_SESSION_COOKIE = "vyberstredni-admin-session";
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8;

export const isAdminAuthConfigured = () =>
  Boolean(env.ADMIN_PASSWORD?.trim() && env.ADMIN_SESSION_SECRET?.trim());

export const isAdminPasswordValid = (password: string) =>
  isAdminAuthConfigured() && password === env.ADMIN_PASSWORD;

const base64UrlEncode = (value: Uint8Array) => {
  let binary = "";
  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlDecode = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return bytes;
};

const getSignatureKey = async (secret: string) => {
  const keyBytes = new TextEncoder().encode(secret);
  return crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
};

export const createAdminSessionToken = async (expiresAt: number) => {
  const secret = env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("Admin session secret is not configured.");
  }

  const payload = JSON.stringify({ sub: "admin", exp: expiresAt, iat: Date.now() });
  const payloadSegment = base64UrlEncode(new TextEncoder().encode(payload));
  const key = await getSignatureKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadSegment));
  return `${payloadSegment}.${base64UrlEncode(new Uint8Array(signature))}`;
};

export const verifyAdminSessionToken = async (token: string | null) => {
  const secret = env.ADMIN_SESSION_SECRET;
  if (!secret || !token || !token.includes(".")) {
    return false;
  }

  const [payloadSegment, signatureSegment] = token.split(".");
  if (!payloadSegment || !signatureSegment) {
    return false;
  }

  try {
    const key = await getSignatureKey(secret);
    const expectedSignature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadSegment));
    const actualSignature = base64UrlDecode(signatureSegment);
    const expectedBytes = new Uint8Array(expectedSignature);

    if (actualSignature.length !== expectedBytes.length) {
      return false;
    }

    let isValid = true;
    for (let index = 0; index < actualSignature.length; index += 1) {
      if (actualSignature[index] !== expectedBytes[index]) {
        isValid = false;
        break;
      }
    }

    const buffer = base64UrlDecode(payloadSegment);
    const payload = JSON.parse(new TextDecoder().decode(buffer)) as { sub?: string; exp?: number };

    if (!isValid || payload.sub !== "admin" || typeof payload.exp !== "number") {
      return false;
    }

    if (Date.now() > payload.exp) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

export const getAdminSessionFromRequest = (request: Request) => {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = cookieHeader.split(";").map((entry) => entry.trim());
  const match = cookies.find((entry) => entry.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  const value = match ? match.slice(`${ADMIN_SESSION_COOKIE}=`.length) : null;
  return value ? decodeURIComponent(value) : null;
};

export const isAuthorizedAdminRequest = async (request: Request) => {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    if (token) {
      return verifyAdminSessionToken(token);
    }
  }

  return verifyAdminSessionToken(getAdminSessionFromRequest(request));
};
