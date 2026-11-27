import type { APIRoute } from "astro";
import { isUnsubscribeListRequestAuthorized, listUnsubscribes } from "../../lib/unsubscribe";

/** Opt-out list for the sending script, which skips these addresses. Bearer UNSUBSCRIBE_SECRET. */
export const GET: APIRoute = async ({ request }) => {
  if (!isUnsubscribeListRequestAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const rows = await listUnsubscribes();
  return Response.json({ emails: rows.map((row) => row.email), rows }, { headers: { "cache-control": "no-store" } });
};
