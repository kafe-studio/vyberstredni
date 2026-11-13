import { distanceKm, type CatalogProgram, type SchoolProgramsById, type SchoolSummary } from "./school-data";

export const CATEGORIES = [
  "digital",
  "engineering",
  "science",
  "nature",
  "health",
  "safety",
  "design",
  "business",
  "hospitality",
  "people",
  "practical",
  "sport",
  "general",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const categoryLabels: Record<Category, string> = {
  digital: "Počítače a IT",
  engineering: "Technika a stavby",
  science: "Přírodní vědy",
  nature: "Příroda a zvířata",
  health: "Zdravotnictví",
  safety: "Bezpečnost a IZS",
  design: "Umění a média",
  business: "Ekonomika a obchod",
  hospitality: "Gastronomie a cestovní ruch",
  people: "Práce s lidmi",
  practical: "Řemesla",
  sport: "Sport",
  general: "Všeobecné studium",
};

/** general = gymnázium, maturita = vocational school or conservatory, vyucni = apprenticeship. */
export type StudyTrack = "general" | "maturita" | "vyucni" | "any";

export const isCategory = (value: string): value is Category => (CATEGORIES as readonly string[]).includes(value);
export const isStudyTrack = (value: string): value is StudyTrack =>
  value === "general" || value === "maturita" || value === "vyucni" || value === "any";

export const emptyTotals = (): Record<Category, number> =>
  Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<Category, number>;

const categoryByCodeGroup: Partial<Record<string, Category[]>> = {
  "16": ["science", "nature"],
  "18": ["digital"],
  "21": ["engineering", "science"],
  "23": ["engineering"],
  "26": ["engineering", "science"],
  "29": ["practical"],
  "31": ["design", "practical"],
  "32": ["design", "practical"],
  "33": ["design", "practical"],
  "34": ["design", "practical"],
  "36": ["engineering"],
  "37": ["engineering", "business"],
  "41": ["nature", "practical"],
  "43": ["nature"],
  "53": ["health"],
  "63": ["business"],
  "64": ["business"],
  "65": ["hospitality"],
  "68": ["safety"],
  "69": ["practical"],
  "72": ["people"],
  "74": ["sport", "people"],
  "75": ["people"],
  "82": ["design"],
};

/** Maps an official program (code group + name) to interest categories. */
export const programCategories = (program: CatalogProgram): Category[] => {
  const codeGroup = program.code.slice(0, 2);
  const name = program.name.toLocaleLowerCase("cs");
  if (codeGroup === "79") return program.code.startsWith("79-42") ? ["general", "sport"] : ["general"];

  const categories = new Set(categoryByCodeGroup[codeGroup] ?? []);

  if (codeGroup === "28") {
    if (/keram/.test(name)) {
      categories.add("design");
      categories.add("practical");
    } else {
      categories.add("science");
    }
  }
  if (codeGroup === "29") {
    if (/analýza|technologie potravin/.test(name)) categories.add("science");
    if (/kuchař|číšník|cukrář|pekař|řezník|gastronom/.test(name)) categories.add("hospitality");
  }
  if (codeGroup === "39") {
    if (/požární ochrana|bezpečnost/.test(name)) categories.add("safety");
    else if (/malíř|lakýr/.test(name)) categories.add("practical");
    else categories.add("engineering");
  }
  if (codeGroup === "41" && /opravář|mechanizátor|strojů/.test(name)) categories.add("engineering");
  if (codeGroup === "65" && /hotelnictví|cestovní ruch/.test(name)) categories.add("business");
  if (codeGroup === "66") categories.add(/aranžér|propagace/.test(name) ? "design" : "business");
  if (codeGroup === "68" && /veřejnospráv|sociální/.test(name)) categories.add("people");
  if (codeGroup === "69") {
    if (/kadeřník|kosmetik|vlasov/.test(name)) categories.add("design");
    if (/masér/.test(name)) categories.add("health");
  }
  if (codeGroup === "78") {
    const lyceum: Partial<Record<string, Category[]>> = {
      "78-42-M/01": ["engineering", "science"],
      "78-42-M/02": ["business"],
      "78-42-M/03": ["people"],
      "78-42-M/04": ["health"],
      "78-42-M/05": ["science", "nature"],
      "78-42-M/06": ["general", "people"],
    };
    (lyceum[program.code] ?? ["general"]).forEach((category) => categories.add(category));
  }

  if (/-[EH]\//.test(program.code) && codeGroup !== "78") categories.add("practical");
  return [...categories];
};

/**
 * Level letter in the program code: K = gymnázium, M/L = vocational with maturita,
 * P = conservatory, H/E = apprenticeship.
 */
export const programLevel = (code: string) => /^\d{2}-\d{2}-([A-Z])/.exec(code)?.[1] ?? "";

/**
 * Programs a 9th grader cannot apply to: follow-up studies for apprenticeship graduates (L/5x)
 * and 8-/6-year gymnázia entered from 5th or 7th grade (K/8x, K/6x).
 */
export const isNotForNinthGraders = (code: string) => /-L\/5\d$/.test(code) || /-K\/[68]\d$/.test(code);

/** Shared by the quiz and the catalog filter so both agree on what each study track contains. */
export const matchesTrack = (code: string, track: StudyTrack) => {
  const level = programLevel(code);
  // C = praktická škola for pupils with special educational needs; not a general recommendation.
  if (level === "C") return false;
  if (track === "general") return level === "K";
  if (track === "maturita") return ["M", "L", "P"].includes(level);
  if (track === "vyucni") return ["H", "E"].includes(level);
  return true;
};

/** Bonus for gymnázium programs when the gymnázium track is chosen, so they rank even without a "general" answer. */
const GYMNASIUM_TRACK_BONUS = 3;

/** Keeps the best-scoring program per name; cards show names only, so names must not repeat. */
const uniqueByName = <T extends { name: string }>(programs: readonly T[]) => {
  const seen = new Set<string>();
  return programs.filter((program) => {
    const key = program.name.toLocaleLowerCase("cs");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export type HomeLocation = { label: string; latitude: number; longitude: number };
export type MatchedProgram = CatalogProgram & { score: number };
export type Recommendation = SchoolSummary & { score: number; distanceKm: number | null; programs: MatchedProgram[] };
export type RankingResult = { schools: Recommendation[]; withoutLocation: number };

export const rankSchools = (
  schools: readonly SchoolSummary[],
  programsById: SchoolProgramsById,
  totals: Record<Category, number>,
  track: StudyTrack,
  home: HomeLocation | null,
  maxDistanceKm: number | null,
): RankingResult => {
  const matching = schools
    .map((school): Recommendation => {
      const programs = uniqueByName((programsById[school.id] ?? [])
        .filter((program) => !program.isPhasingOut && !isNotForNinthGraders(program.code) && matchesTrack(program.code, track))
        .map((program) => ({
          ...program,
          score: programCategories(program).reduce(
            (sum, category) => sum + totals[category] + (track === "general" && category === "general" ? GYMNASIUM_TRACK_BONUS : 0),
            0,
          ),
        }))
        .filter((program) => program.score > 0)
        .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, "cs")));
      const distance = home && school.latitude !== null && school.longitude !== null
        ? distanceKm(home.latitude, home.longitude, school.latitude, school.longitude)
        : null;
      return { ...school, score: programs[0]?.score ?? 0, distanceKm: distance, programs };
    })
    .filter((school) => school.programs.length > 0);

  // A distance limit cannot be checked for schools without coordinates; report how many were left out.
  const withoutLocation = maxDistanceKm === null ? 0 : matching.filter((school) => school.distanceKm === null).length;
  const ranked = matching
    .filter((school) => maxDistanceKm === null || (school.distanceKm !== null && school.distanceKm <= maxDistanceKm))
    .sort((left, right) =>
      right.score - left.score ||
      (left.distanceKm ?? Number.POSITIVE_INFINITY) - (right.distanceKm ?? Number.POSITIVE_INFINITY) ||
      left.name.localeCompare(right.name, "cs"));
  return { schools: ranked, withoutLocation };
};
