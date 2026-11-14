import officialSchools from "./official-schools.json";
import type { CatalogProgram, SchoolSummary } from "../lib/school-data";
import { REGIONS, regionFromRegister, type Region } from "../lib/regions";
import { classifySupport, type SupportType } from "../lib/special-needs";

export const SCHOOL_REGIONS = REGIONS;
export const SCHOOL_TYPES = ["gymnázium", "střední škola", "odborné lyceum", "učiliště", "konzervatoř"] as const;
export const FOCUS_AREAS = ["technologie", "design", "ekonomie", "zdravotnictví", "společnost"] as const;

export type SchoolRegion = Region;
export type SchoolType = (typeof SCHOOL_TYPES)[number];
export type FocusArea = (typeof FOCUS_AREAS)[number];

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

/** Latest Czech School Inspectorate (ČŠI) report for the school. */
export type SchoolInspection = { date: string; reportUrl: string; portalUrl: string; count: number };

export type School = {
  id: string;
  name: string;
  region: SchoolRegion;
  /** Municipality (Prague by district), used for search and for home locations in the quiz. */
  town: string;
  /** Set for schools meant for pupils with disabilities or special educational needs. */
  support: SupportType | null;
  inspection: SchoolInspection | null;
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
  const region = regionFromRegister(record.region);
  const founder = record.founder || "neuvedený";
  const currentCodes = record.programs.filter((program) => !program.isPhasingOut).map((program) => program.code);

  return {
    id: record.id,
    name: record.name,
    region,
    town: record.town ?? "",
    support: classifySupport(record.name, currentCodes),
    inspection: record.inspection ?? null,
    type,
    focus,
    description: `Oficiální záznam MŠMT. Typ zařízení: ${officialTypeLabel(record.officialTypeCode)}. Evidované obory jsou převzaty z exportu Rejstříku škol MŠMT.`,
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
export const inspectionSource = officialSchools.inspectionSource;
export const schoolProgramsSnapshotDate = officialSchools.programsExportedAt;

/**
 * Unique programs of a school; a phasing-out record is dropped when the same code and name
 * is also currently registered.
 */
export const catalogPrograms = (programs: readonly SchoolProgram[]): CatalogProgram[] => {
  const uniquePrograms = uniqueSchoolPrograms(programs);
  const currentKeys = new Set(
    uniquePrograms
      .filter((program) => !program.isPhasingOut)
      .map((program) => JSON.stringify([program.code, program.name])),
  );
  return uniquePrograms
    .filter((program) => !program.isPhasingOut || !currentKeys.has(JSON.stringify([program.code, program.name])))
    .map(({ code, name, isPhasingOut }) => ({ code, name, isPhasingOut }));
};

export const toSchoolSummary = (school: School): SchoolSummary => ({
  id: school.id,
  name: school.name,
  region: school.region,
  town: school.town,
  support: school.support,
  type: school.type,
  focus: school.focus,
  founder: school.founder,
  founderCode: school.founderCode,
  address: school.address,
  izo: school.izo,
  redIzo: school.redIzo,
  ico: school.ico,
  officialTypeCode: school.officialTypeCode,
  capacity: school.capacity,
  phone: school.phone,
  email: school.email,
  website: school.website,
  latitude: school.latitude,
  longitude: school.longitude,
});

export const schoolsByName = [...schools].sort((left, right) => left.name.localeCompare(right.name, "cs"));

/** Programs currently offered by at least one school, keyed by code + name. */
export const currentProgramGroups = () => {
  const groups = new Map<string, { code: string; name: string; schoolIds: Set<string> }>();
  for (const school of schools) {
    for (const program of uniqueSchoolPrograms(school.programs.filter((item) => !item.isPhasingOut))) {
      const key = JSON.stringify([program.code, program.name]);
      const group = groups.get(key) ?? { code: program.code, name: program.name, schoolIds: new Set<string>() };
      group.schoolIds.add(school.id);
      groups.set(key, group);
    }
  }
  return groups;
};
