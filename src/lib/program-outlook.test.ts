import { describe, expect, it } from "vitest";
import outlook from "../data/program-outlook.json";
import { currentProgramGroups } from "../data/schools";
import {
  MAX_OCCUPATIONS,
  demandFor,
  levelForRatio,
  programOutlook,
  type ProgramOutlookRecord,
  type ProgramUnemployment,
  type UnemploymentRow,
} from "./program-outlook";

const row = (label: string, rate: number, graduates: number | null = 1000): UnemploymentRow => ({
  label,
  graduates,
  rate,
  previousRate: null,
});

const unemployment = (program: UnemploymentRow | null, group: UnemploymentRow | null, categoryRate = 10): ProgramUnemployment => ({
  period: "duben 2026",
  previousPeriod: "duben 2025",
  program,
  group,
  category: row("Střední odborné vzdělání s výučním listem - H", categoryRate, 20000),
});

describe("levelForRatio", () => {
  it("splits at the documented thresholds", () => {
    expect(levelForRatio(0.5)).toBe("high");
    expect(levelForRatio(0.75)).toBe("high");
    expect(levelForRatio(1)).toBe("average");
    expect(levelForRatio(1.25)).toBe("low");
    expect(levelForRatio(2)).toBe("low");
  });
});

describe("demandFor", () => {
  it("rates on the program's own rate when it has enough graduates", () => {
    const demand = demandFor(unemployment(row("Kuchař - číšník", 5), row("65 Gastronomie, hotelnictví a turismus", 15)));
    expect(demand?.level).toBe("high");
    expect(demand?.summary).toContain("absolventů tohoto oboru byla 5 %");
    expect(demand?.summary).toContain("průměr za střední odborné vzdělání s výučním listem 10 %");
    expect(demand?.summary).toContain("(duben 2026)");
  });

  it("falls back to the group when the program has too few graduates", () => {
    const demand = demandFor(unemployment(row("Kameník", 0, 5), row("36 Stavebnictví, geodézie a kartografie", 13)));
    expect(demand?.level).toBe("low");
    expect(demand?.summary).toContain("ve skupině oborů Stavebnictví, geodézie a kartografie byla 13 %");
  });

  it("gives no rating without reliable numbers", () => {
    expect(demandFor(null)).toBeNull();
    expect(demandFor(unemployment(row("Hutník", 0, 3), row("21 Hornictví, hutnictví a slévárenství", 0, 3)))).toBeNull();
    expect(demandFor(unemployment(row("Obor", 5), null, 0))).toBeNull();
  });
});

describe("programOutlook", () => {
  it("explains a missing rating for gymnázia and for programs without data", () => {
    expect(programOutlook("79-41-K/41", undefined).demandNote).toContain("gymnázií");
    expect(programOutlook("53-41-J/01", undefined).demandNote).toContain("nejsou údaje");
  });

  it("caps the occupation list", () => {
    const record: ProgramOutlookRecord = {
      employment: "Text",
      occupations: Array.from({ length: MAX_OCCUPATIONS + 3 }, (_, index) => `Povolání ${index}`),
      cardUrl: null,
      statsUrl: null,
      unemployment: null,
    };
    const result = programOutlook("65-51-H/01", record);
    expect(result.occupations).toHaveLength(MAX_OCCUPATIONS);
    expect(result.moreOccupations).toBe(3);
  });
});

describe("program-outlook.json", () => {
  const records: Record<string, ProgramOutlookRecord> = outlook.programs;
  const codes = [...currentProgramGroups().values()].map((program) => program.code);

  it("covers every currently offered program", () => {
    for (const code of codes) expect(records[code], code).toBeDefined();
  });

  it("rates most programs and links every rating to its source", () => {
    const outlooks = codes.map((code) => programOutlook(code, records[code]));
    const rated = outlooks.filter((item) => item.demand !== null);
    expect(rated.length).toBeGreaterThan(codes.length / 2);
    for (const item of rated) expect(item.statsUrl).toMatch(/^https:\/\/www\.infoabsolvent\.cz\/Obory\/Sds\//);
    for (const item of outlooks) expect(item.demand !== null || item.demandNote !== "").toBe(true);
  });
});
