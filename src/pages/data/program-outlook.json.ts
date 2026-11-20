import type { APIRoute } from "astro";
import outlook from "../../data/program-outlook.json";
import wages from "../../data/program-wages.json";
import { currentProgramGroups } from "../../data/schools";
import { programOutlook, type ProgramOutlookData, type ProgramOutlookRecord } from "../../lib/program-outlook";
import { programWages, wagesSourceFrom } from "../../lib/program-wages";

export const prerender = true;

const records: Record<string, ProgramOutlookRecord> = outlook.programs;
const wageSource = wagesSourceFrom(wages);

/** Employment, labour-market demand and wages per program code, for the programs some school currently offers. */
export const GET: APIRoute = () => {
  const codes = new Set([...currentProgramGroups().values()].map((program) => program.code));
  const payload: ProgramOutlookData = {
    source: outlook.source,
    sourceUrl: outlook.sourceUrl,
    fetchedAt: outlook.fetchedAt,
    programs: Object.fromEntries([...codes].map((code) => [
      code,
      { ...programOutlook(code, records[code]), wages: programWages(code, wageSource) },
    ])),
  };
  return Response.json(payload);
};
