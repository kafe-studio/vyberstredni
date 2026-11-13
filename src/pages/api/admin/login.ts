import type { APIRoute } from "astro";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSessionToken,
  isAdminAuthConfigured,
  isAdminPasswordValid,
} from "../../../lib/admin";

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  const password = typeof body.password === "string" ? body.password.trim() : "";

  if (!isAdminAuthConfigured()) {
    return Response.json({ error: "Admin authentication is not configured." }, { status: 503 });
  }

  if (!isAdminPasswordValid(password)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const expiresAt = Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000;
  const token = await createAdminSessionToken(expiresAt);

  cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });

  return Response.json({ success: true });
};
