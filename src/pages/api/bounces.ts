import type { APIRoute } from "astro";
import { listBounces, recordBounces } from "../../lib/bounces";
import { isUnsubscribeListRequestAuthorized } from "../../lib/unsubscribe";

const headers = { "cache-control": "no-store" };
const MAX_BODY_BYTES = 1024 * 1024;
const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401, headers });

/** Bounces for the sending script (bearer UNSUBSCRIBE_SECRET), which marks those schools as undelivered. */
export const GET: APIRoute = async ({ request }) => {
  if (!isUnsubscribeListRequestAuthorized(request)) return unauthorized();
  return Response.json({ bounces: await listBounces() }, { headers });
};

/** The sending script uploads Gmail's failure notices from the Workspace mailbox: JSON { raw }. */
export const POST: APIRoute = async ({ request }) => {
  if (!isUnsubscribeListRequestAuthorized(request)) return unauthorized();
  const text = await request.text().catch(() => "");
  if (!text || text.length > MAX_BODY_BYTES) return Response.json({ error: "Invalid body" }, { status: 400, headers });
  let raw: unknown;
  try {
    raw = (JSON.parse(text) as { raw?: unknown }).raw;
  } catch {
    raw = null;
  }
  if (typeof raw !== "string") return Response.json({ error: "Invalid body" }, { status: 400, headers });
  return Response.json({ recorded: await recordBounces(raw, "gmail") }, { headers });
};
