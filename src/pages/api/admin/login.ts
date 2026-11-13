import type { APIRoute } from "astro";
import {
  ADMIN_COOKIE_PATH,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSessionToken,
  isAdminAuthConfigured,
  isAdminPasswordValid,
  isLoginAllowed,
} from "../../../lib/admin";

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAdminAuthConfigured()) {
    return Response.json({ error: "Admin authentication is not configured." }, { status: 503 });
  }

  if (!(await isLoginAllowed(request))) {
    return Response.json({ error: "Too many login attempts." }, { status: 429 });
  }

  const body: unknown = await request.json().catch(() => null);
  const password =
    body !== null && typeof body === "object" && "password" in body && typeof body.password === "string"
      ? body.password.trim()
      : "";

  if (!(await isAdminPasswordValid(password))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expiresAt = Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000;
  const token = await createAdminSessionToken(expiresAt);
  if (!token) {
    return Response.json({ error: "Admin authentication is not configured." }, { status: 503 });
  }

  cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    path: ADMIN_COOKIE_PATH,
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });

  return Response.json({ success: true });
};
