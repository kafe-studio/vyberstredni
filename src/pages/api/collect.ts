import type { APIRoute } from "astro";
import { isAuthorizedAdminRequest } from "../../lib/admin";
import { recordEvent } from "../../lib/analytics-server";

const MAX_BODY_BYTES = 4096;
const noContent = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

/** Receives anonymous page views and events from the site's own pages (navigator.sendBeacon). */
export const POST: APIRoute = async ({ request }) => {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return noContent();
  // The admin's own browsing would skew the numbers.
  if (await isAuthorizedAdminRequest(request)) return noContent();

  const raw = await request.text().catch(() => "");
  if (!raw || raw.length > MAX_BODY_BYTES) return noContent();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return noContent();
  }
  if (typeof body !== "object" || body === null) return noContent();
  const input: Record<string, unknown> = { ...body };

  try {
    await recordEvent(request, request.cf, {
      type: input.type,
      path: input.path,
      referrer: input.referrer,
      utmSource: input.utmSource,
      utmCampaign: input.utmCampaign,
      screen: input.screen,
      lang: input.lang,
      data: input.data,
    });
  } catch (error) {
    console.error("Failed to record a visit", error);
  }
  return noContent();
};
