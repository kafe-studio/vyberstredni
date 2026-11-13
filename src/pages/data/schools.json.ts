import type { APIRoute } from "astro";
import { schoolsByName, toSchoolSummary } from "../../data/schools";

export const prerender = true;

/** Sorted by Czech collation, so clients can use the order as-is. */

export const GET: APIRoute = () => Response.json(schoolsByName.map(toSchoolSummary));
