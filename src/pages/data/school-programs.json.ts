import type { APIRoute } from "astro";
import { catalogPrograms, schools } from "../../data/schools";

export const prerender = true;

export const GET: APIRoute = () =>
  Response.json(Object.fromEntries(schools.map((school) => [school.id, catalogPrograms(school.programs)])));
