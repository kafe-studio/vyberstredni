import { describe, expect, it } from "vitest";
import extrasJson from "../data/school-extras.json";
import { schools } from "../data/schools";
import {
  admissionLines,
  extrasSourceFrom,
  formatOpenDay,
  gradesRule,
  openDaysNote,
  upcomingOpenDays,
  type AdmissionInfo,
} from "./school-extras";

const admission = (criteria: string[] | null, exams: AdmissionInfo["exams"] = [], unifiedExam: string | null = "ČJ a M"): AdmissionInfo =>
  ({ unifiedExam, exams, criteria });

describe("gradesRule", () => {
  it("recognises grade criteria in the wordings schools use", () => {
    expect(gradesRule(admission(["body za prospěch", "účast v soutěžích"]))).toBe("counted");
    expect(gradesRule(admission(["průměrný prospěch z 8. a 9. třídy"]))).toBe("counted");
    expect(gradesRule(admission(["hodnocení na vysvědčení"]))).toBe("counted");
    expect(gradesRule(admission(["bez špatných známek"]))).toBe("counted");
    expect(gradesRule(admission(["známka z chování, portfolio"]))).toBe("counted");
  });

  it("tells a school without grade criteria from one that reported nothing", () => {
    expect(gradesRule(admission(["účast v soutěžích"]))).toBe("not-counted");
    expect(gradesRule(admission([]))).toBe("not-counted");
    expect(gradesRule(admission(null))).toBe("unknown");
    expect(gradesRule(undefined)).toBe("unknown");
  });
});

describe("admissionLines", () => {
  it("spells out the exams and criteria", () => {
    expect(admissionLines(admission(["body za prospěch"], ["talent", "oral"]))).toEqual([
      "Jednotná přijímací zkouška: čeština a matematika",
      "Vlastní zkouška školy: talentová, ústní",
      "Další kritéria: body za prospěch",
    ]);
  });

  it("says when the unified exam is not held and skips what is unknown", () => {
    expect(admissionLines(admission(null, [], "nekoná se"))).toEqual(["Jednotná přijímací zkouška se nekoná"]);
    expect(admissionLines(undefined)).toEqual([]);
  });
});

describe("open days", () => {
  it("keeps only days from today on", () => {
    const openDays = { text: "20.11.2026, 15.1.2027", dates: ["2026-11-20", "2027-01-15"] };
    expect(upcomingOpenDays(openDays, "2026-11-24")).toEqual(["2027-01-15"]);
    expect(upcomingOpenDays(openDays, "2027-01-15")).toEqual(["2027-01-15"]);
    expect(upcomingOpenDays(null, "2026-11-24")).toEqual([]);
  });

  it("keeps the school's wording only when it says more than the dates", () => {
    expect(openDaysNote({ text: "20.11.2026, 15.1.2027", dates: ["2026-11-20", "2027-01-15"] })).toBeNull();
    expect(openDaysNote({ text: "viz web školy", dates: [] })).toBe("viz web školy");
    expect(openDaysNote({ text: "15.1.2027 od 14 do 17 h", dates: ["2027-01-15"] })).toBe("15.1.2027 od 14 do 17 h");
    expect(openDaysNote(null)).toBeNull();
  });

  it("formats a day in Czech with the weekday", () => {
    expect(formatOpenDay("2027-01-15")).toBe("pá 15. 1. 2027");
  });
});

describe("school-extras.json", () => {
  const data = extrasSourceFrom(extrasJson);
  const entries = Object.values(data.schools);

  it("covers every school of the register", () => {
    for (const school of schools) expect(data.schools[school.id], school.id).toBeDefined();
  });

  it("has open days and admission details for most schools", () => {
    expect(entries.filter((school) => school.openDays?.dates.length).length).toBeGreaterThan(schools.length / 2);
    expect(entries.filter((school) => Object.keys(school.admissions).length).length).toBeGreaterThan(schools.length * 0.8);
  });

  it("stores valid ISO dates and https social links", () => {
    for (const school of entries) {
      for (const day of school.openDays?.dates ?? []) expect(day).toMatch(/^20\d\d-\d\d-\d\d$/);
      for (const url of Object.values(school.social)) expect(url).toMatch(/^https:\/\//);
    }
  });
});
