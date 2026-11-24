/** Open days, admission details and social profiles of a school, from src/data/school-extras.json. */

export type ExamKind = "oral" | "written" | "talent" | "practical";
export type SocialNetwork = "facebook" | "instagram" | "youtube" | "tiktok";

export type AdmissionInfo = {
  /** "ČJ a M" when the unified entrance exam is part of the admission, null when the card does not say. */
  unifiedExam: string | null;
  /** The school's own exams on top of the unified one. */
  exams: ExamKind[];
  /** "Jiná kritéria přijímání" as the school reported them; null when the card has no such row. */
  criteria: string[] | null;
};

export type OpenDays = { text: string; dates: string[] };

export type SchoolExtras = {
  redIzo: string;
  openDays: OpenDays | null;
  admissions: Record<string, AdmissionInfo>;
  social: Partial<Record<SocialNetwork, string>>;
};

export type SchoolExtrasSource = {
  fetchedAt: string;
  sources: { infoabsolvent: { label: string; url: string; cardUrl: string } };
  schools: Record<string, SchoolExtras>;
};

/** The JSON file as TypeScript infers it from an import: enum-like fields are plain strings. */
export type SchoolExtrasJson = Omit<SchoolExtrasSource, "schools"> & {
  schools: Record<string, {
    redIzo: string;
    openDays: OpenDays | null;
    admissions: Record<string, { unifiedExam: string | null; exams: string[]; criteria: string[] | null }>;
    social: Record<string, string>;
  }>;
};

const EXAM_KINDS: readonly ExamKind[] = ["oral", "written", "talent", "practical"];
export const SOCIAL_NETWORKS: readonly SocialNetwork[] = ["facebook", "instagram", "youtube", "tiktok"];

const isExamKind = (value: string): value is ExamKind => (EXAM_KINDS as readonly string[]).includes(value);
const isSocialNetwork = (value: string): value is SocialNetwork => (SOCIAL_NETWORKS as readonly string[]).includes(value);

export const extrasSourceFrom = (json: SchoolExtrasJson): SchoolExtrasSource => ({
  ...json,
  schools: Object.fromEntries(Object.entries(json.schools).map(([id, school]) => [id, {
    ...school,
    admissions: Object.fromEntries(Object.entries(school.admissions).map(([code, admission]) => [
      code,
      { ...admission, exams: admission.exams.filter(isExamKind) },
    ])),
    social: Object.fromEntries(Object.entries(school.social).filter(([network]) => isSocialNetwork(network))),
  }])),
});

export const socialLabels: Record<SocialNetwork, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
};

const examLabels: Record<ExamKind, string> = {
  oral: "ústní",
  written: "písemná",
  talent: "talentová",
  practical: "praktická",
};

/**
 * Criteria wording schools use for what is on the report card: grades ("body za prospěch", "průměr do 2,8",
 * "bez špatných známek") and the conduct mark ("známka z chování").
 */
const GRADES = /prospěch|vysvědčen|znám(?:k|e)|klasifikac|průměr|chování/i;

/**
 * Whether the school counts the report card in the admission for this program:
 * "counted" when one of its criteria is about grades, "not-counted" when it lists other criteria but none about grades,
 * "unknown" when it reported no other criteria at all.
 */
export type GradesRule = "counted" | "not-counted" | "unknown";

export const gradesRule = (admission: AdmissionInfo | undefined): GradesRule => {
  if (!admission?.criteria) return "unknown";
  return admission.criteria.some((criterion) => GRADES.test(criterion)) ? "counted" : "not-counted";
};

export const gradesLabels: Record<GradesRule, string> = {
  counted: "Vysvědčení se započítává",
  "not-counted": "Vysvědčení se nezapočítává",
  unknown: "Jestli se počítá vysvědčení, škola neuvedla",
};

/** "ČJ a M" -> "čeština a matematika"; other wordings are shown as the card has them. */
const unifiedExamText = (value: string) =>
  value.replace(/ČJ/g, "čeština").replace(/(^|\s)M(?=\s|,|$)/g, "$1matematika");

/** Plain-language lines about the admission of one program. */
export const admissionLines = (admission: AdmissionInfo | undefined): string[] => {
  if (!admission) return [];
  const lines: string[] = [];
  if (admission.unifiedExam && !/nekoná/i.test(admission.unifiedExam)) {
    lines.push(`Jednotná přijímací zkouška: ${unifiedExamText(admission.unifiedExam)}`);
  } else if (admission.unifiedExam) {
    lines.push("Jednotná přijímací zkouška se nekoná");
  }
  if (admission.exams.length) {
    const kinds = admission.exams.map((kind) => examLabels[kind]);
    lines.push(`Vlastní zkouška školy: ${kinds.join(", ")}`);
  }
  if (admission.criteria?.length) {
    lines.push(`Další kritéria: ${admission.criteria.join(", ")}`);
  }
  return lines;
};

/**
 * The school's own wording when it says more than the dates ("viz web školy", times, a registration link);
 * null when the text is only the dates shown in the list.
 */
export const openDaysNote = (openDays: OpenDays | null): string | null => {
  if (!openDays) return null;
  const rest = openDays.text.replace(/\d{1,2}\.\s*\d{1,2}\.\s*\d{4}/g, "").replace(/[\s,;.–-]+/g, "");
  return /\p{L}{3,}|\d/u.test(rest) ? openDays.text : null;
};

/** Open days from `today` (ISO date) on. */
export const upcomingOpenDays = (openDays: OpenDays | null, today: string) =>
  (openDays?.dates ?? []).filter((day) => day >= today);

/** "2027-01-15" -> "pá 15. 1. 2027". */
export const formatOpenDay = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  const weekday = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("cs-CZ", { weekday: "short", timeZone: "UTC" });
  return `${weekday} ${day}. ${month}. ${year}`;
};

/** Where the law says how report cards may count (school act § 60i, in force from 1. 9. 2026). */
export const ADMISSION_LAW_URL = "https://www.zakonyprolidi.cz/cs/2004-561#p60i";
