/**
 * Schools for pupils with disabilities or special educational needs (SVP).
 * The register has no explicit flag, so they are recognised from the official name and from the programs:
 * a school offering only E-level (programs designed for pupils with SVP) or C-level (praktická škola) programs
 * is an SVP school even when its name does not say so.
 */
export const SUPPORT_TYPES = ["visual", "hearing", "physical", "svp"] as const;
export type SupportType = (typeof SUPPORT_TYPES)[number];

export const supportLabels: Record<SupportType, string> = {
  visual: "pro žáky se zrakovým postižením",
  hearing: "pro žáky se sluchovým postižením",
  physical: "pro žáky s tělesným postižením",
  svp: "pro žáky se speciálními vzdělávacími potřebami",
};

export const isSupportType = (value: string): value is SupportType =>
  (SUPPORT_TYPES as readonly string[]).includes(value);

const VISUAL = /zrakov|nevidom|slabozrak/iu;
const HEARING = /sluchov|neslyš|nedoslýchav/iu;
const PHYSICAL = /tělesně|tělesným|Jedličk/iu;
const SVP = /speciální|speciálními|speciálně\s+pedagog|praktická\s+škola|více\s+vadami|postižen|autis/iu;

const levelOf = (code: string) => /^\d{2}-\d{2}-([A-Z])/u.exec(code)?.[1] ?? "";

/** Which kind of support a school is meant for, or null for a mainstream school. */
export const classifySupport = (name: string, currentProgramCodes: readonly string[]): SupportType | null => {
  if (VISUAL.test(name)) return "visual";
  if (HEARING.test(name)) return "hearing";
  if (PHYSICAL.test(name)) return "physical";
  if (SVP.test(name)) return "svp";
  const levels = currentProgramCodes.map(levelOf);
  if (levels.length > 0 && levels.every((level) => level === "E" || level === "C")) return "svp";
  return null;
};

/**
 * Institutions where pupils are placed by a court or an authority (výchovný ústav, diagnostický ústav,
 * dětský domov se školou). They are listed in the catalog but never recommended by the quiz.
 */
const PLACEMENT_INSTITUTION = /výchovn\p{L}*\s+ústav|diagnostick\p{L}*\s+ústav|dětský\s+domov\s+se\s+školou/iu;

export const isPlacementInstitution = (name: string) => PLACEMENT_INSTITUTION.test(name);
