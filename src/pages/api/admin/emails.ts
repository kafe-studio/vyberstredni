import type { APIRoute } from "astro";
import { isAuthorizedAdminRequest } from "../../../lib/admin";
import { listBounces } from "../../../lib/bounces";
import { listUnsubscribes } from "../../../lib/unsubscribe";

const headers = { "cache-control": "no-store" };

/** Opt-outs and bounces of outreach e-mails for the admin overview. */
export const GET: APIRoute = async ({ request }) => {
  if (!(await isAuthorizedAdminRequest(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  try {
    const [rows, bounces] = await Promise.all([listUnsubscribes(), listBounces()]);
    return Response.json({ rows, bounces }, { headers });
  } catch (error) {
    console.error("Failed to load unsubscribes and bounces", error);
    return Response.json({ error: "Loading failed" }, { status: 500, headers });
  }
};
