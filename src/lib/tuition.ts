/**
 * Whether a school may charge tuition (školné), from its founder in the MŠMT register.
 * § 123 odst. 1 zákona č. 561/2004 Sb. (školský zákon): secondary schools founded by the state, a region, a municipality
 * or a union of municipalities teach for free; other schools (private, church) may charge. No public source says
 * whether, or how much, a given private or church school actually charges.
 */
export type Tuition = "free" | "may-charge";

/** Founder codes from the register: 1 state, 2 municipality, 3 other public (ministries), 7 region; 5 private, 6 church. */
const FREE_FOUNDERS = new Set(["1", "2", "3", "7"]);
const CHARGING_FOUNDERS = new Set(["5", "6"]);

export const tuitionOf = (founderCode: string): Tuition | null =>
  FREE_FOUNDERS.has(founderCode) ? "free" : CHARGING_FOUNDERS.has(founderCode) ? "may-charge" : null;

export const tuitionLabels: Record<Tuition, string> = {
  free: "Bez školného",
  "may-charge": "Může mít školné",
};

export const tuitionNotes: Record<Tuition, string> = {
  free: "Veřejná škola: podle školského zákona (§ 123) se tu za studium neplatí.",
  "may-charge": "Soukromé a církevní školy smějí vybírat školné (§ 123 školského zákona). Jestli ho tahle škola chce a kolik, ověř na jejím webu.",
};

/** Short card text: "Bez školného", "Soukromá: může mít školné", "Církevní: může mít školné". */
export const tuitionBadge = (founderCode: string): string | null => {
  const tuition = tuitionOf(founderCode);
  if (tuition === "free") return tuitionLabels.free;
  if (tuition === "may-charge") return `${founderCode === "6" ? "Církevní" : "Soukromá"}: může mít školné`;
  return null;
};

/** Card chip markup shared by the client-rendered lists; "" for an unknown founder. */
export const tuitionChipHtml = (founderCode: string): string => {
  const badge = tuitionBadge(founderCode);
  if (!badge) return "";
  return tuitionOf(founderCode) === "free"
    ? `<span class="rounded-full bg-muted px-2.5 py-1 font-semibold text-muted-foreground">✓ ${badge}</span>`
    : `<span class="rounded-full bg-sun/60 px-2.5 py-1 font-bold text-ink">💰 ${badge}</span>`;
};

export const TUITION_LAW_URL = "https://www.zakonyprolidi.cz/cs/2004-561#p123";
