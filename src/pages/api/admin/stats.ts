import type { APIRoute } from "astro";
import { isAuthorizedAdminRequest } from "../../../lib/admin";
import { loadStats, pragueTime } from "../../../lib/analytics-server";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 400;

const headers = { "cache-control": "no-store" };

export const GET: APIRoute = async ({ request, url }) => {
  if (!(await isAuthorizedAdminRequest(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  const today = pragueTime(new Date()).day;
  const to = url.searchParams.get("to") ?? today;
  const from = url.searchParams.get("from") ?? to;
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (!DAY.test(from) || !DAY.test(to) || !Number.isFinite(span) || span < 0 || span > MAX_RANGE_DAYS) {
    return Response.json({ error: "Invalid range" }, { status: 400, headers });
  }

  try {
    const stats = await loadStats(from, to);
    if (!stats) return Response.json({ error: "Database not configured" }, { status: 503, headers });
    return Response.json(stats, { headers });
  } catch (error) {
    console.error("Failed to load statistics", error);
    return Response.json({ error: "Statistics failed" }, { status: 500, headers });
  }
};
