import type { APIRoute } from "astro";
import { ADMIN_SESSION_COOKIE } from "../../../lib/admin";

export const POST: APIRoute = ({ cookies }) => {
  cookies.delete(ADMIN_SESSION_COOKIE, { path: "/" });
  return Response.json({ success: true });
};
