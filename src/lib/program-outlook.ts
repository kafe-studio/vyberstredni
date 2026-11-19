/** Unemployment of fresh graduates registered at labour offices (Infoabsolvent.cz, NPI ČR). */
export type UnemploymentRow = { label: string; graduates: number | null; rate: number; previousRate: number | null };

export type ProgramUnemployment = {
  /** "duben 2026" */
  period: string;
  previousPeriod: string;
  /** The program's own row; missing when Infoabsolvent only reports its group. */
  program: UnemploymentRow | null;
  group: UnemploymentRow | null;
  /** Average of the whole education category (all maturita programs, all vocational programs, …). */
  category: UnemploymentRow | null;
};

/** One program in src/data/program-outlook.json (built by scripts/build-program-outlook.py). */
export type ProgramOutlookRecord = {
  employment: string;
  occupations: string[];
  cardUrl: string | null;
  statsUrl: string | null;
  unemployment: ProgramUnemployment | null;
};

export type DemandLevel = "high" | "average" | "low";

export type Demand = {
  level: DemandLevel;
  label: string;
  /** Plain-language explanation with the numbers it is based on. */
  summary: string;
  period: string;
};

/** What the Obory page shows for a selected program. */
export type ProgramOutlook = {
  employment: string;
  occupations: string[];
  moreOccupations: number;
  cardUrl: string | null;
  statsUrl: string | null;
  demand: Demand | null;
  /** Why there is no demand rating, when there is none. */
  demandNote: string;
};

/** Payload of PROGRAM_OUTLOOK_DATA_PATH. */
export type ProgramOutlookData = {
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  programs: Record<string, ProgramOutlook>;
};

export const PROGRAM_OUTLOOK_DATA_PATH = "/data/program-outlook.json";

/** Fewer graduates than this make a rate too unstable to rate on; the group is used instead. */
export const MIN_GRADUATES = 30;
/** The rate relative to the category average at or below which demand is "high", at or above which it is "low". */
export const HIGH_DEMAND_RATIO = 0.75;
export const LOW_DEMAND_RATIO = 1.25;
export const MAX_OCCUPATIONS = 12;

const DEMAND_LABELS: Record<DemandLevel, string> = {
  high: "Vysoká poptávka",
  average: "Průměrná poptávka",
  low: "Nižší poptávka",
};

const DEMAND_VERDICTS: Record<DemandLevel, string> = {
  high: "Čerství absolventi jsou bez práce výrazně méně často než průměr.",
  average: "Čerství absolventi jsou bez práce zhruba stejně často jako průměr.",
  low: "Čerství absolventi jsou bez práce výrazně častěji než průměr.",
};

const percent = (value: number) => `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`;

const isReliable = (row: UnemploymentRow | null): row is UnemploymentRow =>
  row !== null && row.graduates !== null && row.graduates >= MIN_GRADUATES;

/** "Úplné střední odborné vzdělání s maturitou (bez vyučení) - M" -> "úplné střední odborné vzdělání s maturitou (bez vyučení)"; also "… - L5". */
const categoryName = (label: string) => {
  const name = label.replace(/\s+-\s+[A-Z]\d?$/, "").trim();
  return `${name.charAt(0).toLocaleLowerCase("cs")}${name.slice(1)}`;
};

/** "63 Ekonomika a administrativa" -> "skupině oborů Ekonomika a administrativa" */
const groupName = (label: string) => `skupině oborů ${label.replace(/^\d+\s+/, "")}`;

export const levelForRatio = (ratio: number): DemandLevel =>
  ratio <= HIGH_DEMAND_RATIO ? "high" : ratio >= LOW_DEMAND_RATIO ? "low" : "average";

/**
 * Demand on the labour market, judged by how often fresh graduates are unemployed compared with the average of the
 * same education category. The program's own rate is used when it has enough graduates, otherwise its group's.
 */
export const demandFor = (unemployment: ProgramUnemployment | null): Demand | null => {
  const category = unemployment?.category ?? null;
  if (!unemployment || !category || category.rate <= 0) return null;
  const ownRow = isReliable(unemployment.program) ? unemployment.program : null;
  const basis = ownRow ?? (isReliable(unemployment.group) ? unemployment.group : null);
  if (!basis) return null;

  const level = levelForRatio(basis.rate / category.rate);
  const scope = ownRow ? "absolventů tohoto oboru" : `absolventů ve ${groupName(basis.label)}`;
  return {
    level,
    label: DEMAND_LABELS[level],
    summary: `${DEMAND_VERDICTS[level]} Nezaměstnanost ${scope} byla ${percent(basis.rate)}, průměr za ${categoryName(category.label)} ${percent(category.rate)} (${unemployment.period}).`,
    period: unemployment.period,
  };
};

const demandNoteFor = (code: string, record: ProgramOutlookRecord | undefined) => {
  if (/-K\//.test(code)) {
    return "U gymnázií se nezaměstnanost absolventů nesleduje, většina z nich pokračuje na vysoké škole.";
  }
  if (record?.unemployment) return "Obor má zatím příliš málo absolventů na spolehlivé hodnocení.";
  return "Pro tento obor nejsou údaje o nezaměstnanosti absolventů k dispozici.";
};

export const programOutlook = (code: string, record: ProgramOutlookRecord | undefined): ProgramOutlook => {
  const occupations = record?.occupations ?? [];
  const demand = demandFor(record?.unemployment ?? null);
  return {
    employment: record?.employment ?? "",
    occupations: occupations.slice(0, MAX_OCCUPATIONS),
    moreOccupations: Math.max(0, occupations.length - MAX_OCCUPATIONS),
    cardUrl: record?.cardUrl ?? null,
    statsUrl: record?.statsUrl ?? null,
    demand,
    demandNote: demand ? "" : demandNoteFor(code, record),
  };
};
