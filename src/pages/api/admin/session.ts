import type { APIRoute } from "astro";
import { isAuthorizedAdminRequest } from "../../../lib/admin";

export const GET: APIRoute = async ({ request }) => {
  const authenticated = await isAuthorizedAdminRequest(request);
  return Response.json(
    { authenticated },
    { status: authenticated ? 200 : 401, headers: { "cache-control": "no-store" } },
  );
};
