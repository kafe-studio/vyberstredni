/**
 * Whether a school charges tuition (školné), from its founder in the MŠMT register.
 * § 123 odst. 1 zákona č. 561/2004 Sb. (školský zákon): secondary schools founded by the state, a region, a municipality
 * or a union of municipalities teach for free; other schools (private, church) may charge. No public source lists what
 * a given school charges. A check of school websites (November 2026) found that most private schools charge, often tens
 * of thousands of crowns a year, while most church schools charge nothing or a small amount.
 */
export type Tuition = "free" | "private" | "church";

/** Founder codes from the register: 1 MŠMT, 2 municipality, 3 other ministries, 7 region; 5 private, 6 church. */
const FREE_FOUNDERS = new Set(["1", "2", "3", "7"]);

export const tuitionOf = (founderCode: string): Tuition | null =>
  FREE_FOUNDERS.has(founderCode) ? "free" : founderCode === "5" ? "private" : founderCode === "6" ? "church" : null;

/** Detail and comparison wording. */
export const tuitionLabels: Record<Tuition, string> = {
  free: "Bez školného",
  private: "Je možné, že se platí školné",
  church: "Školné spíš ne, ověř",
};

/** Card chip wording. */
export const tuitionBadges: Record<Tuition, string> = {
  free: "Bez školného",
  private: "Soukromá: je možné, že se platí školné",
  church: "Církevní: školné spíš ne, ověř",
};

export const tuitionNotes: Record<Tuition, string> = {
  free: "Veřejná škola: podle školského zákona (§ 123) se tu za studium neplatí.",
  private:
    "Soukromé školy smějí vybírat školné (§ 123 školského zákona) a většina ho vybírá, často i desítky tisíc korun ročně. Některé ale studium nabízejí zdarma. Přesnou částku najdeš na webu školy.",
  church:
    "Církevní školy smějí vybírat školné (§ 123 školského zákona), většina ho ale nevybírá. Některé chtějí menší částku, obvykle stovky až nízké tisíce korun ročně. Ověř na webu školy.",
};

export const tuitionBadge = (founderCode: string): string | null => {
  const tuition = tuitionOf(founderCode);
  return tuition ? tuitionBadges[tuition] : null;
};

/** Card chip markup shared by the client-rendered lists; "" for an unknown founder. */
export const tuitionChipHtml = (founderCode: string): string => {
  const tuition = tuitionOf(founderCode);
  if (!tuition) return "";
  if (tuition === "private") return `<span class="rounded-full bg-sun/60 px-2.5 py-1 font-bold text-ink">💰 ${tuitionBadges.private}</span>`;
  const icon = tuition === "free" ? "✓ " : "";
  return `<span class="rounded-full bg-muted px-2.5 py-1 font-semibold text-muted-foreground">${icon}${tuitionBadges[tuition]}</span>`;
};

export const TUITION_LAW_URL = "https://www.zakonyprolidi.cz/cs/2004-561#p123";
