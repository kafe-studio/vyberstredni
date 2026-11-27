import type { APIRoute } from "astro";
import { isAuthorizedAdminRequest } from "../../../lib/admin";
import { listUnsubscribes } from "../../../lib/unsubscribe";

const headers = { "cache-control": "no-store" };

/** Opt-outs from outreach e-mails for the admin overview. */
export const GET: APIRoute = async ({ request }) => {
  if (!(await isAuthorizedAdminRequest(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  try {
    return Response.json({ rows: await listUnsubscribes() }, { headers });
  } catch (error) {
    console.error("Failed to load unsubscribes", error);
    return Response.json({ error: "Loading failed" }, { status: 500, headers });
  }
};
