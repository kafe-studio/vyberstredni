import { env } from "cloudflare:workers";
import { timingSafeEqual } from "node:crypto";

/**
 * Opt-outs from e-mails sent from jaknaskolu.cz (school outreach).
 * Links carry the address and an HMAC of it, so nobody can opt out someone else's address by guessing.
 * The sending script (Google Apps Script) signs links with the same UNSUBSCRIBE_SECRET and downloads the
 * opt-out list before each batch.
 */

const encoder = new TextEncoder();
const MAX_EMAIL = 254;

export const isUnsubscribeConfigured = () => Boolean(env.UNSUBSCRIBE_SECRET?.trim());

export const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > MAX_EMAIL || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  return email;
};

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/** Hex HMAC-SHA256 of the normalized address (the Apps Script computes the same value). */
export const signEmail = async (email: string): Promise<string | null> => {
  const secret = env.UNSUBSCRIBE_SECRET?.trim();
  if (!secret) return null;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(email))));
};

const constantTimeEqual = (left: string, right: string) => {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
};

/** The normalized address when the link's token matches it, otherwise null. */
export const verifyUnsubscribeLink = async (emailParam: unknown, tokenParam: unknown): Promise<string | null> => {
  const email = normalizeEmail(emailParam);
  if (!email || typeof tokenParam !== "string") return null;
  const expected = await signEmail(email);
  return expected && constantTimeEqual(expected, tokenParam.trim().toLowerCase()) ? email : null;
};

let schemaReady: Promise<void> | null = null;

const ensureSchema = (db: D1Database) => {
  schemaReady ??= db
    .prepare(
      `CREATE TABLE IF NOT EXISTS unsubscribes (
        email TEXT PRIMARY KEY,
        ts INTEGER NOT NULL,
        source TEXT NOT NULL
      )`,
    )
    .run()
    .then(() => undefined)
    .catch((error: unknown) => {
      schemaReady = null;
      return Promise.reject(error);
    });
  return schemaReady;
};

export type UnsubscribeSource = "page" | "one-click";

export const recordUnsubscribe = async (email: string, source: UnsubscribeSource) => {
  await ensureSchema(env.DB);
  await env.DB.prepare("INSERT OR IGNORE INTO unsubscribes (email, ts, source) VALUES (?1, ?2, ?3)")
    .bind(email, Date.now(), source)
    .run();
};

export const listUnsubscribes = async () => {
  await ensureSchema(env.DB);
  const { results } = await env.DB.prepare("SELECT email, ts, source FROM unsubscribes ORDER BY ts").all<{
    email: string;
    ts: number;
    source: string;
  }>();
  return results;
};

export const ONE_CLICK_UNSUBSCRIBE_PATH = "/vyberstredni/api/unsubscribe/";

const plainText = (body: string, status: number) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/**
 * RFC 8058 one-click unsubscribe: mail clients (Gmail's "Unsubscribe" button) POST to the List-Unsubscribe URL
 * from their servers, without an Origin header. Astro's checkOrigin rejects such form posts, so src/worker.ts
 * routes them here before Astro runs. People clicking the link in the mail land on /odhlasit/ instead.
 */
export const handleOneClickUnsubscribe = async (request: Request) => {
  if (request.method !== "POST") return plainText("Method Not Allowed", 405);
  if (!isUnsubscribeConfigured()) return plainText("Odhlášení není nastavené.", 503);
  const url = new URL(request.url);
  const email = await verifyUnsubscribeLink(url.searchParams.get("e"), url.searchParams.get("t"));
  if (!email) return plainText("Neplatný odkaz pro odhlášení.", 400);
  await recordUnsubscribe(email, "one-click");
  return plainText("Odhlášeno.", 200);
};

/** The sending script authenticates with the same secret as a bearer token. */
export const isUnsubscribeListRequestAuthorized = (request: Request) => {
  const secret = env.UNSUBSCRIBE_SECRET?.trim();
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return Boolean(secret && token && constantTimeEqual(secret, token));
};
