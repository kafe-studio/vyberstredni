import officialSchools from "./official-schools.json";

export type SchoolRegion = "Praha" | "Středočeský kraj";
export type SchoolType = "gymnázium" | "střední škola" | "odborné lyceum" | "učiliště" | "konzervatoř";
export type FocusArea = "technologie" | "design" | "ekonomie" | "zdravotnictví" | "společnost";

export type SchoolProgram = {
  code: string;
  name: string;
  studyModeCode: string;
  durationCode: string;
  languageCode: string;
  capacity: number | null;
  capacityUnitCode: string | null;
  isPhasingOut: boolean;
};

export const uniqueSchoolPrograms = <T extends Pick<SchoolProgram, "code" | "name" | "isPhasingOut">>(
  programs: readonly T[],
): T[] => {
  const unique = new Map<string, T>();
  for (const program of programs) {
    unique.set(JSON.stringify([program.code, program.name, program.isPhasingOut]), program);
  }
  return [...unique.values()];
};

export type School = {
  id: string;
  name: string;
  region: SchoolRegion;
  type: SchoolType;
  focus: FocusArea;
  description: string;
  acceptance: string;
  capacity: string;
  commute: string;
  fee: string;
  tags: string[];
  audience: string[];
  idealStudent: string;
  strengths: string[];
  challenges: string[];
  verifiedNote: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  redIzo: string;
  ico: string;
  izo: string;
  founderCode: string;
  founder: string;
  officialTypeCode: string;
  programs: SchoolProgram[];
  phone: string;
  email: string;
  website: string;
  ruian: string | null;
};

const classifyType = (name: string, officialTypeCode: string): SchoolType => {
  if (officialTypeCode === "D00") return "konzervatoř";

  const normalizedName = name.toLocaleLowerCase("cs");
  if (normalizedName.includes("gymnáz")) return "gymnázium";
  if (normalizedName.includes("lyceum")) return "odborné lyceum";
  if (normalizedName.includes("učiliště")) return "učiliště";
  return "střední škola";
};

const classifyFocus = (name: string): FocusArea => {
  const normalizedName = name.toLocaleLowerCase("cs");

  if (/zdravot|farmac|ošetřov|veterin/.test(normalizedName)) return "zdravotnictví";
  if (/graf|design|uměleck|výtvar|multim|konzervatoř|hudeb|taneč|divadl/.test(normalizedName)) return "design";
  if (/ekonom|obchod|podnik|hotel|cestovn|bankovn/.test(normalizedName)) return "ekonomie";
  if (/techn|průmysl|informat|počítač|elektro|stroj|doprav|staveb|leteck/.test(normalizedName)) return "technologie";
  if (/gymnáz|pedagog|sociální|policej|bezpečnost|veřejnospráv/.test(normalizedName)) return "společnost";
  return "společnost";
};

const officialTypeLabel = (officialTypeCode: string) =>
  officialTypeCode === "D00" ? "konzervatoř" : "střední škola";

export const schools: School[] = officialSchools.schools.map((record) => {
  const type = classifyType(record.name, record.officialTypeCode);
  const focus = classifyFocus(record.name);
  const region: SchoolRegion =
    record.region === "Hlavní město Praha" ? "Praha" : "Středočeský kraj";
  const founder = record.founder || "neuvedený";

  return {
    id: record.id,
    name: record.name,
    region,
    type,
    focus,
    description: `Oficiální záznam MŠMT. Typ zařízení: ${officialTypeLabel(record.officialTypeCode)}. Evidované obory jsou převzaty z regionálního exportu MŠMT.`,
    acceptance: "Aktuální podmínky přijímacího řízení ověř na webu školy.",
    capacity: record.capacity
      ? `${record.capacity} míst (celková kapacita školy v rejstříku)`
      : "V rejstříku neuvedena",
    commute: "Dojezd závisí na místě bydliště a spojení.",
    fee: "Školné ověř přímo u školy.",
    tags: [type, founder, focus],
    audience: [],
    idealStudent: "Oficiální rejstřík tento údaj neuvádí.",
    strengths: [],
    challenges: [],
    verifiedNote: "Název, adresa, identifikátory a kontakty pocházejí z veřejného Rejstříku škol MŠMT.",
    address: record.address,
    latitude: record.latitude ?? null,
    longitude: record.longitude ?? null,
    redIzo: record.redIzo,
    ico: record.ico,
    izo: record.izo,
    founderCode: record.founderCode,
    founder,
    officialTypeCode: record.officialTypeCode,
    programs: record.programs,
    phone: record.phone ?? "",
    email: record.email ?? "",
    website: record.website ?? "",
    ruian: record.ruian ?? null,
  };
});

export const schoolSnapshotDate = officialSchools.exportedAt;
export const schoolSource = officialSchools.source;
export const schoolProgramSources = officialSchools.programSource;
export const schoolProgramsSnapshotDate = officialSchools.programsExportedAt;
