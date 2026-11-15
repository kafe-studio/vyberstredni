import type { APIRoute } from "astro";
import { cermatFor } from "../../data/cermat";
import { schools } from "../../data/schools";
import type { SchoolStats } from "../../lib/school-data";

export const prerender = true;

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * Compact CERMAT figures for sorting school lists (the detail page shows them in full):
 * maturita success rate, applications per place in the 1st admission round and the admitted students' average
 * percentile in the unified entrance exam.
 */
export const GET: APIRoute = () => {
  const stats: Record<string, SchoolStats> = {};
  for (const school of schools) {
    const cermat = cermatFor(school.id);
    if (!cermat) continue;
    const admissions = Object.values(cermat.admission).filter((item) => item.capacity > 0);
    const capacity = admissions.reduce((sum, item) => sum + item.capacity, 0);
    const applications = admissions.reduce((sum, item) => sum + item.applications, 0);
    const weighted = admissions.filter((item) => item.percentileAvg !== null && item.admitted > 0);
    const admitted = weighted.reduce((sum, item) => sum + item.admitted, 0);
    const percentile = admitted > 0
      ? weighted.reduce((sum, item) => sum + (item.percentileAvg ?? 0) * item.admitted, 0) / admitted
      : null;
    const entry: SchoolStats = {
      maturita: cermat.maturita?.successRate ?? null,
      applicationsPerPlace: capacity > 0 ? round(applications / capacity, 2) : null,
      percentile: percentile === null ? null : round(percentile, 1),
    };
    if (entry.maturita !== null || entry.applicationsPerPlace !== null) stats[school.id] = entry;
  }
  return Response.json(stats);
};
