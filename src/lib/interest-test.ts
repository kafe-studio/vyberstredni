import { distanceKm, type CatalogProgram, type SchoolProgramsById, type SchoolSummary } from "./school-data";
import { isPlacementInstitution, type SupportType } from "./special-needs";

export const CATEGORIES = [
  "digital",
  "electro",
  "engineering",
  "cars",
  "building",
  "wood",
  "science",
  "nature",
  "health",
  "beauty",
  "safety",
  "design",
  "music",
  "fashion",
  "business",
  "languages",
  "hospitality",
  "people",
  "practical",
  "sport",
  "general",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const categoryLabels: Record<Category, string> = {
  digital: "Počítače a IT",
  electro: "Elektro a elektronika",
  engineering: "Strojírenství a kovo",
  cars: "Auta a doprava",
  building: "Stavebnictví",
  wood: "Dřevo a nábytek",
  science: "Chemie a přírodní vědy",
  nature: "Příroda a zvířata",
  health: "Zdravotnictví",
  beauty: "Kadeřnictví a kosmetika",
  safety: "Bezpečnost a IZS",
  design: "Výtvarné umění a design",
  music: "Hudba, tanec a divadlo",
  fashion: "Móda a textil",
  business: "Ekonomika a obchod",
  languages: "Cizí jazyky",
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

/** Base categories of a program code group (the first two digits of the official program code). */
const categoryByCodeGroup: Partial<Record<string, Category[]>> = {
  "16": ["nature", "science"],
  "18": ["digital"],
  "21": ["engineering", "science"],
  "23": ["engineering"],
  "26": ["electro"],
  "29": ["practical"],
  "31": ["fashion", "practical"],
  "32": ["fashion", "practical"],
  "33": ["wood", "practical"],
  "34": ["design", "practical"],
  "36": ["building"],
  "37": ["cars", "business"],
  "41": ["nature", "practical"],
  "43": ["nature"],
  "53": ["health"],
  "63": ["business"],
  "64": ["business"],
  "65": ["hospitality"],
  "66": ["business"],
  "69": ["practical"],
  "72": ["people"],
  "74": ["sport", "people"],
  "75": ["people"],
};

/** Categories a program name adds within its code group; every matching rule applies. */
const nameRules: Partial<Record<string, Array<[RegExp, Category[]]>>> = {
  "23": [[/motorových vozidel|karosář|autolak|dopravní prostředky|silničních strojů|letecký|lodník/, ["cars"]]],
  "26": [[/autoelektr/, ["cars"]], [/telekomunikace|spojový/, ["digital"]]],
  "28": [[/keram|sklář|bižuter|silikát/, ["design", "practical"]], [/chemi/, ["science"]]],
  "29": [[/analýza|technologie potravin/, ["science"]], [/kuchař|číšník|cukrář|pekař|řezník|gastronom/, ["hospitality"]]],
  "36": [[/tesař/, ["wood", "practical"]], [/geodézie/, ["science"]]],
  "39": [
    [/požární|bezpečnost/, ["safety"]],
    [/malíř|lakýr/, ["building", "practical"]],
    [/autotronik/, ["cars", "electro"]],
    [/instalatér/, ["building", "electro"]],
    [/mechatronik/, ["engineering", "electro"]],
  ],
  "41": [[/opravář|mechanizátor|mechanizace|strojů/, ["engineering"]], [/zpracovatel dřeva/, ["wood"]]],
  "63": [[/obchodní akademie/, ["languages"]]],
  "65": [[/hotelnictví|cestovní ruch/, ["business", "languages"]]],
  "66": [[/aranžér/, ["design"]]],
  "68": [[/bezpečnost|pořád|požár|vojen|polic/, ["safety"]], [/veřejnospráv|správ/, ["business", "people"]]],
  "69": [
    [/kadeřník|kosmeti|vlasov|maskér|manikúr|pedikúr/, ["beauty"]],
    [/masér/, ["health", "sport"]],
    [/optik/, ["health"]],
    [/autoservis/, ["cars"]],
  ],
  "82": [
    [/zpěv|hudb|tanec|dramat|hudebních nástrojů|varhan|herectví/, ["music"]],
    [/oděv|textil|obuvi|módních/, ["fashion", "design"]],
    [/truhlář|dřev|řezb/, ["wood", "design"]],
    [/maskér|vlásenk/, ["beauty", "design"]],
    [/design|grafi|malba|fotograf|multimedi|scénick|keramik|sklo|skla|kov|kamen|zlatník|rytec|štukatér|pozlacovač|restaurát|starožitník|hrač|bižuter/, ["design"]],
  ],
};

/** Lycea: a general base with a focus (78-42-M/01 … /06), plus the military lyceum. */
const lyceumCategories: Partial<Record<string, Category[]>> = {
  "78-42-M/01": ["engineering", "electro", "digital", "science"],
  "78-42-M/02": ["business"],
  "78-42-M/03": ["people"],
  "78-42-M/04": ["health"],
  "78-42-M/05": ["science", "nature"],
  "78-42-M/06": ["general", "people"],
};

const programCategoryCache = new Map<string, Category[]>();

/** Maps an official program (code group + name) to interest categories. Results are cached per code + name. */
export const programCategories = (program: CatalogProgram): Category[] => {
  const key = `${program.code}|${program.name}`;
  const cached = programCategoryCache.get(key);
  if (cached) return cached;
  const categories = computeProgramCategories(program);
  programCategoryCache.set(key, categories);
  return categories;
};

const computeProgramCategories = (program: CatalogProgram): Category[] => {
  const codeGroup = program.code.slice(0, 2);
  const name = program.name.toLocaleLowerCase("cs");
  if (codeGroup === "79") return program.code.startsWith("79-42") ? ["general", "sport"] : ["general"];
  if (codeGroup === "78") {
    if (/vojensk/.test(name)) return ["safety", "general"];
    return lyceumCategories[program.code] ?? ["general"];
  }

  const categories = new Set(categoryByCodeGroup[codeGroup] ?? []);
  for (const [pattern, added] of nameRules[codeGroup] ?? []) {
    if (pattern.test(name)) added.forEach((category) => categories.add(category));
  }
  // Fallbacks for groups whose base depends entirely on the name.
  if (codeGroup === "28" && categories.size === 0) categories.add("science");
  if (codeGroup === "39" && categories.size === 0) categories.add("engineering");
  if (codeGroup === "82" && categories.size === 0) categories.add("design");
  if (codeGroup === "68" && categories.size === 0) categories.add("safety");

  if (/-[EH]\//.test(program.code)) categories.add("practical");
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

/**
 * Study track of a program as the catalog filter understands it ("Gymnázium" = gymnázia only).
 * The quiz builds on it in eligibleForQuiz: its gymnázium track also offers lycea and it hides E/J levels.
 */
export const matchesTrack = (code: string, track: StudyTrack) => {
  const level = programLevel(code);
  // C = praktická škola for pupils with special educational needs; not a general recommendation.
  if (level === "C") return false;
  if (track === "general") return level === "K";
  if (track === "maturita") return ["M", "L", "P"].includes(level);
  if (track === "vyucni") return ["H", "E"].includes(level);
  return true;
};

/**
 * Levels the quiz recommends only to students who asked for special support (they are always in the catalog):
 * C = praktická škola, E = programs designed for pupils with special educational needs.
 * J (short "střední vzdělání" without maturita or výuční list) is never recommended.
 */
const SUPPORT_ONLY_LEVELS = new Set(["C", "E"]);
const NEVER_RECOMMENDED_LEVELS = new Set(["J"]);

const isLyceum = (code: string) => code.startsWith("78-42-M");

/**
 * A gymnázium focus only counts when the adjective belongs to the gymnázium itself
 * ("1. IT Gymnázium", "Sportovní gymnázium", "Lékařské a přírodovědné gymnázium"),
 * not when the name lists other programs of the same school ("Obchodní akademie a Gymnázium").
 */
const GYMNASIUM_PROFILES: Array<[RegExp, Category[]]> = [
  [/\bIT\s+gymn/iu, ["digital"]],
  [/sportovní\s+gymn|gymnázium\s+se\s+sportovní/iu, ["sport"]],
  [/přírodovědn\p{L}*\s+gymn/iu, ["science", "nature"]],
  [/lékařsk\p{L}*(?:\s+a\s+\p{L}+)?\s+gymn/iu, ["health"]],
  // Language gymnázia and international/bilingual ones. "… a jazyková škola s právem státní jazykové zkoušky" is a
  // separate language school for adults in the same organisation, not the gymnázium's focus.
  [/jazykov\p{L}*\s+gymn|anglick\p{L}*\s+gymn|anglicko-česk|\bInternational\b|mezinárodní\s+gymn|mezinárodních\s+a\s+veřejných|English\s+College|Německá\s+škola/iu, ["languages"]],
];

const profileCache = new Map<string, Category[]>();

export const gymnasiumProfile = (schoolName: string): Category[] => {
  const cached = profileCache.get(schoolName);
  if (cached) return cached;
  const profile = [...new Set(GYMNASIUM_PROFILES.flatMap(([pattern, categories]) => (pattern.test(schoolName) ? categories : [])))];
  profileCache.set(schoolName, profile);
  return profile;
};

/** Programs a 9th grader can enter, optionally including the special-support levels C and E. */
const recommendable = (code: string, allowSupportLevels: boolean) => {
  const level = programLevel(code);
  if (NEVER_RECOMMENDED_LEVELS.has(level) || isNotForNinthGraders(code)) return false;
  return allowSupportLevels || !SUPPORT_ONLY_LEVELS.has(level);
};

/**
 * Programs the quiz may recommend for a study track. The gymnázium track also includes lycea:
 * they combine a general base with a focus, which is what "široký základ, pak vysoká" looks for.
 * With special support, praktická škola (C) counts like an apprenticeship.
 */
const eligibleForQuiz = (code: string, track: StudyTrack, allowSupportLevels: boolean) => {
  if (!recommendable(code, allowSupportLevels)) return false;
  const level = programLevel(code);
  if (track === "general") return level === "K" || isLyceum(code);
  if (level === "C") return track === "vyucni" || track === "any";
  return matchesTrack(code, track);
};

/** Small bonus so every gymnázium/lyceum qualifies on the gymnázium track even without a matching interest. */
const GENERAL_TRACK_BONUS = 1;

/** Interest categories sorted by strength; ties go to the answer of the first question, then to the fixed order. */
export const rankInterests = (totals: Record<Category, number>, primary: Category | null): Category[] =>
  CATEGORIES.filter((category) => totals[category] > 0).sort((left, right) =>
    totals[right] - totals[left] ||
    Number(right === primary) - Number(left === primary) ||
    CATEGORIES.indexOf(left) - CATEGORIES.indexOf(right));

/** Keeps the first program per name; cards show names only, so names must not repeat. */
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
export type MatchedProgram = CatalogProgram & { score: number; categories: Category[]; matchesMain: boolean };
export type Recommendation = SchoolSummary & {
  score: number;
  /** The school (or, for SVP, the program level) fits the special support the student asked for. */
  supportMatch: boolean;
  /** The best program serves the student's main interest. */
  matchesMain: boolean;
  /** The school teaches the main interest in some program (used to order otherwise equal gymnázia). */
  mainAffinity: boolean;
  distanceKm: number | null;
  programs: MatchedProgram[];
};
export type RankingResult = { schools: Recommendation[]; withoutLocation: number; mainInterest: Category | null };

export type RankingInput = {
  schools: readonly SchoolSummary[];
  programsById: SchoolProgramsById;
  totals: Record<Category, number>;
  track: StudyTrack;
  home?: HomeLocation | null;
  maxDistanceKm?: number | null;
  primaryInterest?: Category | null;
  /** Special support the student needs; null = mainstream schools only. */
  support?: SupportType | null;
};

/**
 * Orders schools for the quiz result:
 * 0. with special support: schools for that support first (always listed, even without an interest match),
 * 1. schools whose best program serves the main interest, 2. program score, 3. the school also teaches the main
 * interest, 4. distance (when a home is set), 5. number of fitting programs, 6. name.
 * Schools for a different kind of support are never shown.
 */
export const rankSchools = ({
  schools,
  programsById,
  totals,
  track,
  home = null,
  maxDistanceKm = null,
  primaryInterest = null,
  support = null,
}: RankingInput): RankingResult => {
  const mainInterest = rankInterests(totals, primaryInterest)[0] ?? null;
  // E/C programs are meant for pupils with special educational needs; other disabilities get them only at their
  // own support schools (see the fallback below).
  const allowSupportLevels = support === "svp";

  const matching = schools
    .filter((school) => !isPlacementInstitution(school.name))
    .filter((school) => school.support === null || school.support === support)
    .map((school): Recommendation => {
      const supportSchool = support !== null && school.support === support;
      const profile = gymnasiumProfile(school.name);
      const categoriesOf = (program: CatalogProgram): Category[] => {
        const base = programCategories(program);
        return programLevel(program.code) === "K" ? [...new Set([...base, ...profile])] : base;
      };
      const current = (programsById[school.id] ?? []).filter((program) => !program.isPhasingOut);

      const toMatched = (program: CatalogProgram): MatchedProgram => {
        const categories = categoriesOf(program);
        const bonus = track === "general" ? GENERAL_TRACK_BONUS : 0;
        return {
          ...program,
          categories,
          score: categories.reduce((sum, category) => sum + totals[category], 0) + bonus,
          matchesMain: mainInterest !== null && categories.includes(mainInterest),
        };
      };
      const byFit = (left: MatchedProgram, right: MatchedProgram) =>
        Number(right.matchesMain) - Number(left.matchesMain) ||
        right.score - left.score ||
        left.name.localeCompare(right.name, "cs");

      let programs = uniqueByName(current
        .filter((program) => eligibleForQuiz(program.code, track, allowSupportLevels))
        .map(toMatched)
        .filter((program) => program.score > 0)
        .sort(byFit));

      // A school for a visual, hearing or physical disability is always listed: there are only a few of them in the
      // whole country, so its programs are shown even when they match neither the interests nor the track.
      // SVP schools (over 150) must match like any other school.
      if (supportSchool && support !== "svp" && programs.length === 0) {
        programs = uniqueByName(current.filter((program) => recommendable(program.code, true)).map(toMatched).sort(byFit));
      }

      // Only programs a 9th grader can actually enter count towards the school's affinity.
      const mainAffinity = mainInterest !== null && current.some((program) =>
        recommendable(program.code, allowSupportLevels) && categoriesOf(program).includes(mainInterest));
      const distance = home && school.latitude !== null && school.longitude !== null
        ? distanceKm(home.latitude, home.longitude, school.latitude, school.longitude)
        : null;
      const best = programs[0];
      const supportMatch = supportSchool ||
        (support === "svp" && best !== undefined && SUPPORT_ONLY_LEVELS.has(programLevel(best.code)));
      return {
        ...school,
        supportMatch,
        score: best?.score ?? 0,
        matchesMain: best?.matchesMain ?? false,
        mainAffinity,
        distanceKm: distance,
        programs,
      };
    })
    .filter((school) => school.programs.length > 0);

  // A distance limit cannot be checked for schools without coordinates; report how many were left out.
  const withoutLocation = maxDistanceKm === null ? 0 : matching.filter((school) => school.distanceKm === null).length;
  const ranked = matching
    .filter((school) => maxDistanceKm === null || (school.distanceKm !== null && school.distanceKm <= maxDistanceKm))
    .sort((left, right) =>
      Number(right.supportMatch) - Number(left.supportMatch) ||
      Number(right.matchesMain) - Number(left.matchesMain) ||
      right.score - left.score ||
      Number(right.mainAffinity) - Number(left.mainAffinity) ||
      (left.distanceKm ?? Number.POSITIVE_INFINITY) - (right.distanceKm ?? Number.POSITIVE_INFINITY) ||
      right.programs.length - left.programs.length ||
      left.name.localeCompare(right.name, "cs"));
  return { schools: ranked, withoutLocation, mainInterest };
};
