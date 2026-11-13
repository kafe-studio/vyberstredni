import { env } from "cloudflare:workers";
import { timingSafeEqual } from "node:crypto";
import { withBase } from "./urls";

export const ADMIN_SESSION_COOKIE = "vyberstredni-admin-session";
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8;
export const ADMIN_COOKIE_PATH = withBase("/");

const encoder = new TextEncoder();

export const isAdminAuthConfigured = () =>
  Boolean(env.ADMIN_PASSWORD?.trim() && env.ADMIN_SESSION_SECRET?.trim());

const sha256 = async (value: string) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));

const constantTimeEqual = (left: Uint8Array, right: Uint8Array) =>
  left.byteLength === right.byteLength && timingSafeEqual(left, right);

export const isAdminPasswordValid = async (password: string) => {
  // Trimmed like the submitted password, so a secret stored with a trailing newline still matches.
  const expected = env.ADMIN_PASSWORD?.trim();
  if (!isAdminAuthConfigured() || !expected) return false;
  // Hash both sides so the constant-time comparison always gets equal-length inputs.
  const [actualHash, expectedHash] = await Promise.all([sha256(password), sha256(expected)]);
  return constantTimeEqual(actualHash, expectedHash);
};

/**
 * Returns false when the caller exceeded the login attempt limit.
 * Without the LOGIN_RATE_LIMITER binding (e.g. misconfigured env) login stays allowed.
 */
export const isLoginAllowed = async (request: Request) => {
  const limiter = env.LOGIN_RATE_LIMITER;
  if (!limiter) return true;
  const clientIp = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success } = await limiter.limit({ key: `admin-login:${clientIp}` });
  return success;
};

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
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const getSignatureKey = async (secret: string) =>
  crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export const createAdminSessionToken = async (expiresAt: number) => {
  const secret = env.ADMIN_SESSION_SECRET;
  if (!secret) {
    return null;
  }

  const payload = JSON.stringify({ sub: "admin", exp: expiresAt, iat: Date.now() });
  const payloadSegment = base64UrlEncode(encoder.encode(payload));
  const key = await getSignatureKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadSegment));
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
    const expectedSignature = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(payloadSegment)),
    );
    if (!constantTimeEqual(base64UrlDecode(signatureSegment), expectedSignature)) {
      return false;
    }

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadSegment))) as {
      sub?: string;
      exp?: number;
    };

    return payload.sub === "admin" && typeof payload.exp === "number" && Date.now() <= payload.exp;
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
