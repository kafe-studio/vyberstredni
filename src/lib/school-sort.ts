import { formatDistance, type SchoolStats } from "./school-data";

/**
 * Sorting of school lists (catalog and quiz results). Every option sorts by one value; schools without it go last,
 * ties are broken by name.
 */
export const SORT_KEYS = ["match", "distance", "name", "maturita", "easiest", "popular", "size"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const sortLabels: Record<SortKey, string> = {
  match: "Shody s tvými zájmy",
  distance: "Vzdálenosti od bydliště",
  name: "Názvu (A–Z)",
  maturita: "Úspěšnosti u maturity",
  easiest: "Nejsnazšího přijetí",
  popular: "Největšího zájmu uchazečů",
  size: "Velikosti školy",
};

/** What a sort needs: the quiz answers (match) or a saved home (distance). */
export const sortRequirement: Partial<Record<SortKey, "quiz" | "home">> = { match: "quiz", distance: "home" };

export const isSortKey = (value: string): value is SortKey => (SORT_KEYS as readonly string[]).includes(value);

export type SortableSchool = {
  name: string;
  capacity: string;
  /** Fit with the quiz interests; higher is better. */
  interestScore: number;
  distanceKm: number | null;
  stats: SchoolStats | null;
};

/** The value a sort uses and whether higher values come first. */
const sortValue = (school: SortableSchool, key: SortKey): { value: number | null; descending: boolean } => {
  switch (key) {
    case "match": return { value: school.interestScore > 0 ? school.interestScore : null, descending: true };
    case "distance": return { value: school.distanceKm, descending: false };
    case "maturita": return { value: school.stats?.maturita ?? null, descending: true };
    case "easiest": return { value: school.stats?.applicationsPerPlace ?? null, descending: false };
    case "popular": return { value: school.stats?.applicationsPerPlace ?? null, descending: true };
    case "size": {
      const capacity = Number(school.capacity);
      return { value: Number.isFinite(capacity) && capacity > 0 ? capacity : null, descending: true };
    }
    case "name": return { value: null, descending: false };
  }
};

export const compareSchools = (key: SortKey) => (left: SortableSchool, right: SortableSchool) => {
  const a = sortValue(left, key);
  const b = sortValue(right, key);
  if (a.value !== b.value) {
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    return a.descending ? b.value - a.value : a.value - b.value;
  }
  // Same value: the closer school first when a distance is known, then by name.
  const distance = (left.distanceKm ?? Number.POSITIVE_INFINITY) - (right.distanceKm ?? Number.POSITIVE_INFINITY);
  return (key !== "name" && Number.isFinite(distance) && distance !== 0 ? distance : 0) ||
    left.name.localeCompare(right.name, "cs");
};

const percent = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 });
const ratio = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 });

/** Short facts for a school card; the one the list is sorted by comes first. */
export const schoolFacts = (school: SortableSchool, key: SortKey) => {
  const facts: Array<[SortKey, string]> = [];
  if (school.distanceKm !== null) facts.push(["distance", `📍 ${formatDistance(school.distanceKm)} od tebe`]);
  const maturita = school.stats?.maturita ?? null;
  if (maturita !== null) facts.push(["maturita", `🎓 maturitu udělá ${percent.format(maturita)} %`]);
  const applications = school.stats?.applicationsPerPlace ?? null;
  if (applications !== null) {
    const shown = Math.round(applications * 10) / 10;
    // Czech: 1 přihláška, 2–4 přihlášky, 5+ přihlášek, decimals přihlášky.
    const word = !Number.isInteger(shown) || (shown >= 2 && shown <= 4) ? "přihlášky" : shown === 1 ? "přihláška" : "přihlášek";
    facts.push(["easiest", `📝 ${ratio.format(shown)} ${word} na místo`]);
  }
  const sortedKey = key === "popular" ? "easiest" : key;
  return facts.sort(([left], [right]) => Number(right === sortedKey) - Number(left === sortedKey)).map(([, text]) => text);
};
