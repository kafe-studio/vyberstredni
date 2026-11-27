import { env } from "cloudflare:workers";
import { parseBounce, type ParsedBounce } from "./bounce-parse";
import { routeIncomingEmail } from "./incoming-email";

/**
 * Undelivered outreach e-mails. Bounces reach us two ways and both end up here:
 *  - "mx": remote servers send them to info@jaknaskolu.cz; Email Routing passes info@ to this Worker's email()
 *    handler, which stores the bounce and still forwards every message to the inbox (MAIL_FORWARD_TO);
 *  - "gmail": Gmail drops its own failure notices into the sending Workspace mailbox, and the Apps Script
 *    uploads them to /api/bounces/.
 */

export type BounceSource = "mx" | "gmail";
export type BounceRow = ParsedBounce & { id: number; ts: number; source: BounceSource; subject: string };

const MAX_SUBJECT = 200;
const MAX_RAW_BYTES = 512 * 1024;

let schemaReady: Promise<void> | null = null;

const ensureSchema = (db: D1Database) => {
  schemaReady ??= db
    .batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS bounces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        ts INTEGER NOT NULL,
        status TEXT NOT NULL,
        kind TEXT NOT NULL,
        reason TEXT NOT NULL,
        diagnostic TEXT NOT NULL,
        subject TEXT NOT NULL,
        source TEXT NOT NULL
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS bounces_email ON bounces (email)"),
    ])
    .then(() => undefined)
    .catch((error: unknown) => {
      schemaReady = null;
      return Promise.reject(error);
    });
  return schemaReady;
};

const subjectOf = (raw: string) =>
  (/^Subject:\s*(.+)$/im.exec(raw.slice(0, 20000))?.[1] ?? "").trim().slice(0, MAX_SUBJECT);

/** Parses one raw message and stores its failed recipients. Returns what was stored (empty if not a bounce). */
export const recordBounces = async (raw: string, source: BounceSource): Promise<ParsedBounce[]> => {
  const parsed = parseBounce(raw.slice(0, MAX_RAW_BYTES));
  if (!parsed.length) return [];
  await ensureSchema(env.DB);
  const ts = Date.now();
  const subject = subjectOf(raw);
  await env.DB.batch(
    parsed.map((bounce) =>
      env.DB.prepare(
        "INSERT INTO bounces (email, ts, status, kind, reason, diagnostic, subject, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
      ).bind(bounce.email, ts, bounce.status, bounce.kind, bounce.reason, bounce.diagnostic, subject, source),
    ),
  );
  return parsed;
};

export const listBounces = async (): Promise<BounceRow[]> => {
  await ensureSchema(env.DB);
  const { results } = await env.DB.prepare(
    "SELECT id, email, ts, status, kind, reason, diagnostic, subject, source FROM bounces ORDER BY ts",
  ).all<BounceRow>();
  return results;
};

/** Email Routing entry point for info@jaknaskolu.cz: forward everything to the inbox, record bounces. */
export const handleIncomingEmail = (message: ForwardableEmailMessage) =>
  routeIncomingEmail(message, env.MAIL_FORWARD_TO?.trim(), (raw) => recordBounces(raw, "mx"));
