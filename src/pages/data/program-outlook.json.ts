import type { APIRoute } from "astro";
import outlook from "../../data/program-outlook.json";
import { currentProgramGroups } from "../../data/schools";
import { programOutlook, type ProgramOutlookData, type ProgramOutlookRecord } from "../../lib/program-outlook";

export const prerender = true;

const records: Record<string, ProgramOutlookRecord> = outlook.programs;

/** Employment and labour-market demand per program code, for the programs some school currently offers. */
export const GET: APIRoute = () => {
  const codes = new Set([...currentProgramGroups().values()].map((program) => program.code));
  const payload: ProgramOutlookData = {
    source: outlook.source,
    sourceUrl: outlook.sourceUrl,
    fetchedAt: outlook.fetchedAt,
    programs: Object.fromEntries([...codes].map((code) => [code, programOutlook(code, records[code])])),
  };
  return Response.json(payload);
};
