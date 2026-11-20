import { describe, expect, it } from "vitest";
import wagesJson from "../data/program-wages.json";
import {
  officialProjection,
  programWages,
  recentGrowthRates,
  trendProjection,
  wageSummary,
  wagesSourceFrom,
  type ProgramWagesSource,
  type WagePoint,
} from "./program-wages";
import { wageChartHtml } from "./wage-chart";

const point = (year: number, median: number, employees: number | null = 10): WagePoint => ({
  year,
  median,
  q1: Math.round(median * 0.8),
  q3: Math.round(median * 1.2),
  employees,
});

/** Grows exactly 10 % a year from 2019 to 2025. */
const steadySeries = [2019, 2020, 2021, 2022, 2023, 2024, 2025].map((year) => point(year, Math.round(30000 * 1.1 ** (year - 2019))));

const source = (series: WagePoint[], direct = true): ProgramWagesSource => ({
  fetchedAt: "2026-11-20",
  sources: {
    nsp: { label: "NSP", url: "https://nsp.cz" },
    ispv: { label: "ISPV", url: "https://example.test/ispv" },
    mf: { label: "MF", url: "https://example.test/mf" },
  },
  mfForecast: { 2026: { growth: 6.4, kind: "forecast" }, 2027: { growth: 6.3, kind: "forecast" }, 2028: { growth: 5.4, kind: "outlook" } },
  occupations: { 3117: { name: "Hutní technici", sphere: "wage", series } },
  programs: { "21-43-M/01": { isco: "3117", direct, units: [{ title: "Hutní technik", url: "https://nsp.cz/export/1/pdf" }] } },
});

describe("recentGrowthRates", () => {
  it("takes the last five consecutive year-on-year changes", () => {
    const rates = recentGrowthRates(steadySeries);
    expect(rates).toHaveLength(5);
    rates.forEach((rate) => expect(rate).toBeCloseTo(0.1, 3));
  });

  it("stops at a gap in the series", () => {
    const withGap = steadySeries.filter((item) => item.year !== 2022);
    // 2023→2024 and 2024→2025; 2021→2023 is not a year-on-year change.
    expect(recentGrowthRates(withGap)).toHaveLength(2);
  });
});

describe("trendProjection", () => {
  it("compounds the average growth and widens the band by its spread", () => {
    const latest = steadySeries.at(-1);
    if (!latest) throw new Error("fixture");
    const trend = trendProjection(latest, [0.05, 0.07, 0.05, 0.07], [2026, 2027]);
    expect(trend?.rate).toBeCloseTo(0.06, 5);
    expect(trend?.years).toBe(4);
    expect(trend?.points[1]?.median).toBe(Math.round((latest.median * 1.06 ** 2) / 100) * 100);
    expect(trend?.points[1]?.low).toBeLessThan(trend?.points[1]?.median ?? 0);
    expect(trend?.points[1]?.high).toBeGreaterThan(trend?.points[1]?.median ?? 0);
  });

  it("gives no trend for a short series", () => {
    expect(trendProjection(point(2025, 40000), [0.05, 0.05, 0.05], [2026])).toBeNull();
  });
});

describe("officialProjection", () => {
  it("applies the forecast growth year after year, skipping years already measured", () => {
    const projection = officialProjection(point(2025, 50000), {
      2025: { growth: 99, kind: "forecast" },
      2026: { growth: 10, kind: "forecast" },
      2027: { growth: 10, kind: "outlook" },
    });
    expect(projection.points).toEqual([
      { year: 2026, median: 55000, kind: "forecast" },
      { year: 2027, median: 60500, kind: "outlook" },
    ]);
  });
});

describe("programWages", () => {
  it("returns null for a program without an occupation", () => {
    expect(programWages("99-99-M/99", source(steadySeries))).toBeNull();
  });

  it("joins the occupation, its history and both projections", () => {
    const wages = programWages("21-43-M/01", source(steadySeries));
    expect(wages?.latest.year).toBe(2025);
    expect(wages?.trend?.points.map((item) => item.year)).toEqual([2026, 2027, 2028]);
    expect(wages?.official.points).toHaveLength(3);
  });

  it("explains the numbers and their limits in Czech", () => {
    const wages = programWages("21-43-M/01", source(steadySeries));
    if (!wages) throw new Error("fixture");
    const summary = wageSummary(wages);
    expect(summary.current).toContain("v roce 2025");
    expect(summary.current).toContain("Prostřední polovina");
    expect(summary.forecast).toContain("Za posledních 5 let");
    expect(summary.forecast).toContain("predikce Ministerstva financí");
    expect(summary.caveats).toContain("nástupní mzda absolventa bývá nižší");
  });

  it("uses the plural for four years and flags small and indirect occupations", () => {
    const short = steadySeries.slice(2).map((item) => ({ ...item, employees: 0.4 }));
    const wages = programWages("21-43-M/01", source(short, false));
    if (!wages) throw new Error("fixture");
    const summary = wageSummary(wages);
    expect(summary.forecast).toContain("Za poslední 4 roky");
    expect(summary.caveats).toContain("málo zaměstnanců");
    expect(summary.caveats).toContain("příbuzných oborů");
  });
});

describe("wageChartHtml", () => {
  it("draws every series, a hover target per year and a table view", () => {
    const wages = programWages("21-43-M/01", source(steadySeries));
    if (!wages) throw new Error("fixture");
    const html = wageChartHtml(wages, "Test");
    expect(html).not.toContain("NaN");
    expect(html.match(/class="wage-hit"/g)).toHaveLength(10);
    expect(html).toContain("Trend povolání");
    expect(html).toContain("Podle predikce MF");
    expect(html.match(/<tr>/g)?.length).toBe(1 + 7 + 3);
  });
});

describe("program-wages.json", () => {
  const data = wagesSourceFrom(wagesJson);

  it("covers most programs and links each to an occupation with a current series", () => {
    const programs = Object.entries(data.programs);
    // 185 of 280 in November 2026: gymnázia, lycea, art programs and unclear matches have no wage on purpose.
    expect(programs.length).toBeGreaterThan(150);
    const latestYear = Math.max(...Object.values(data.occupations).flatMap((occupation) => occupation.series.map((item) => item.year)));
    for (const [code, record] of programs) {
      const occupation = data.occupations[record.isco];
      expect(occupation, code).toBeDefined();
      expect(occupation?.series.at(-1)?.year, code).toBe(latestYear);
      expect(record.units.length, code).toBeGreaterThan(0);
    }
  });

  it("has an official forecast for the years after the latest data", () => {
    expect(Object.keys(data.mfForecast).length).toBeGreaterThanOrEqual(2);
    expect(data.sources.mf.url).toMatch(/^https:\/\/mf\.gov\.cz\//);
  });
});
