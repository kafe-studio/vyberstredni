import cermat from "./cermat.json";

/** CERMAT: unified entrance exam (JPZ), 1st round, day study of one program. */
export type ProgramAdmission = {
  capacity: number;
  applications: number;
  admitted: number;
  entranceExam: boolean;
  /** Admitted students beat this share (%) of all candidates in the Czech Republic, on average / the weakest one. */
  percentileAvg: number | null;
  percentileMin: number | null;
};

/** CERMAT: common part of the maturita exam; success rate = passed out of all registered students. */
export type SchoolMaturita = {
  registered: number;
  takers: number;
  successRate: number | null;
  czechScore: number | null;
  mathScore: number | null;
  mathShare: number | null;
  groups: Array<{ code: string; label: string; registered: number; successRate: number | null; nationalSuccessRate: number | null }>;
};

export type SchoolCermat = {
  admission: Record<string, ProgramAdmission>;
  maturita: SchoolMaturita | null;
  /** The maturita record covers the whole legal entity (e.g. a school together with a conservatory). */
  maturitaSharedByComponents: boolean;
};

const bySchool: Record<string, SchoolCermat> = cermat.schools;

/** Only the prerendered school detail page imports this module, so the data never reaches the Worker bundle. */
export const cermatFor = (schoolId: string): SchoolCermat | null => bySchool[schoolId] ?? null;

export const cermatInfo = {
  year: cermat.year,
  admissionSource: cermat.admissionSource,
  maturitaSource: cermat.maturitaSource,
  nationalMaturitaSuccessRate: cermat.nationalMaturitaSuccessRate,
};
