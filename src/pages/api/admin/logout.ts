import type { APIRoute } from "astro";
import { ADMIN_COOKIE_PATH, ADMIN_SESSION_COOKIE } from "../../../lib/admin";

export const POST: APIRoute = ({ cookies }) => {
  cookies.delete(ADMIN_SESSION_COOKIE, { path: ADMIN_COOKIE_PATH });

  // AstroCookies keeps one entry per cookie name, so the cookie issued before the path
  // was scoped to the app base ("/") has to be expired with a separate raw header.
  const headers = new Headers();
  headers.append(
    "set-cookie",
    `${ADMIN_SESSION_COOKIE}=deleted; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`,
  );
  return Response.json({ success: true }, { headers });
};
