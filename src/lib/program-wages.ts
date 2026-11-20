/** Wages of the typical occupation of a program, from src/data/program-wages.json (scripts/build-program-wages.py). */

export type WagePoint = { year: number; median: number; q1: number | null; q3: number | null; employees: number | null };

/** "wage" = mzdová sféra (mostly private employers), "salary" = platová sféra (public sector). */
export type WageSphere = "wage" | "salary";

export type OccupationWages = { name: string; sphere: WageSphere; series: WagePoint[] };

export type JobUnitLink = { title: string; url: string };

export type ProgramWagesRecord = { isco: string; direct: boolean; units: JobUnitLink[] };

export type ForecastKind = "forecast" | "outlook";

export type SourceLink = { label: string; url: string };

/** Shape of src/data/program-wages.json. */
export type ProgramWagesSource = {
  fetchedAt: string;
  sources: { nsp: SourceLink; ispv: SourceLink; mf: SourceLink };
  mfForecast: Record<string, { growth: number; kind: ForecastKind }>;
  occupations: Record<string, OccupationWages>;
  programs: Record<string, ProgramWagesRecord>;
};

/** The JSON file as TypeScript infers it from an import: enum-like fields are plain strings. */
export type ProgramWagesJson = Omit<ProgramWagesSource, "mfForecast" | "occupations"> & {
  mfForecast: Record<string, { growth: number; kind: string }>;
  occupations: Record<string, { name: string; sphere: string; series: WagePoint[] }>;
};

export const wagesSourceFrom = (json: ProgramWagesJson): ProgramWagesSource => ({
  ...json,
  mfForecast: Object.fromEntries(Object.entries(json.mfForecast).map(([year, { growth, kind }]) => [
    year,
    { growth, kind: kind === "outlook" ? "outlook" : "forecast" },
  ])),
  occupations: Object.fromEntries(Object.entries(json.occupations).map(([isco, occupation]) => [
    isco,
    { ...occupation, sphere: occupation.sphere === "salary" ? "salary" : "wage" },
  ])),
});

export type ProjectionPoint ={ year: number; median: number; low: number; high: number };

/** What the pages show for one program. */
export type ProgramWages = {
  isco: string;
  occupation: string;
  sphere: WageSphere;
  /** True when NSP names the program itself as preparation for the occupation, false when only related programs. */
  direct: boolean;
  units: JobUnitLink[];
  latest: WagePoint;
  history: WagePoint[];
  /** The occupation's own recent growth carried forward; null when the series is too short. */
  trend: { rate: number; spread: number; years: number; points: ProjectionPoint[] } | null;
  /** The occupation's latest median growing like the average wage in the Ministry of Finance forecast. */
  official: { points: Array<{ year: number; median: number; kind: ForecastKind }> };
  sources: { nsp: SourceLink; ispv: SourceLink; mf: SourceLink };
};

/** Annual growth rates used for the trend: the last five year-on-year changes. */
export const TREND_YEARS = 5;
/** Fewer consecutive year-on-year changes than this give no trend. */
export const MIN_TREND_YEARS = 4;
/** Below this many employees (thousands) the ISPV figures are only indicative. */
export const FEW_EMPLOYEES = 1;

export const sphereLabels: Record<WageSphere, string> = {
  wage: "mzdová sféra (soukromé firmy)",
  salary: "platová sféra (veřejný sektor)",
};

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

const standardDeviation = (values: number[]) => {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
};

/** Year-on-year growth rates (as fractions) of the last `TREND_YEARS` consecutive years ending at the latest year. */
export const recentGrowthRates = (series: WagePoint[]): number[] => {
  const rates: number[] = [];
  for (let index = series.length - 1; index > 0 && rates.length < TREND_YEARS; index -= 1) {
    const current = series[index];
    const previous = series[index - 1];
    if (!current || !previous || current.year - previous.year !== 1 || previous.median <= 0) break;
    rates.unshift(current.median / previous.median - 1);
  }
  return rates;
};

export const trendProjection = (latest: WagePoint, rates: number[], years: number[]): ProgramWages["trend"] => {
  if (rates.length < MIN_TREND_YEARS) return null;
  const rate = mean(rates);
  const spread = standardDeviation(rates);
  const points = years.map((year) => {
    const steps = year - latest.year;
    return {
      year,
      median: roundTo(latest.median * (1 + rate) ** steps, 100),
      low: roundTo(latest.median * (1 + rate - spread) ** steps, 100),
      high: roundTo(latest.median * (1 + rate + spread) ** steps, 100),
    };
  });
  return { rate, spread, years: rates.length, points };
};

export const officialProjection = (latest: WagePoint, forecast: ProgramWagesSource["mfForecast"]): ProgramWages["official"] => {
  let median = latest.median;
  const points: ProgramWages["official"]["points"] = [];
  for (const [year, { growth, kind }] of Object.entries(forecast).sort(([left], [right]) => Number(left) - Number(right))) {
    if (Number(year) <= latest.year) continue;
    median *= 1 + growth / 100;
    points.push({ year: Number(year), median: roundTo(median, 100), kind });
  }
  return { points };
};

export const programWages = (code: string, source: ProgramWagesSource): ProgramWages | null => {
  const record = source.programs[code];
  const occupation = record ? source.occupations[record.isco] : undefined;
  const latest = occupation?.series.at(-1);
  if (!record || !occupation || !latest) return null;
  const official = officialProjection(latest, source.mfForecast);
  return {
    isco: record.isco,
    occupation: occupation.name,
    sphere: occupation.sphere,
    direct: record.direct,
    units: record.units,
    latest,
    history: occupation.series,
    trend: trendProjection(latest, recentGrowthRates(occupation.series), official.points.map((point) => point.year)),
    official,
    sources: source.sources,
  };
};

export const formatCzk = (value: number) => `${value.toLocaleString("cs-CZ")} Kč`;

export const formatPercent = (fraction: number) =>
  `${(fraction * 100).toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

/** Plain-language sentences the wage card shows, with the numbers they rest on. */
export const wageSummary = (wages: ProgramWages) => {
  const { latest, trend, official } = wages;
  const range = latest.q1 !== null && latest.q3 !== null
    ? ` Prostřední polovina lidí bere ${formatCzk(latest.q1)} až ${formatCzk(latest.q3)}.`
    : "";
  const current = `Polovina zaměstnanců v tomto povolání měla v roce ${latest.year} hrubou mzdu vyšší než ${formatCzk(latest.median)} měsíčně (medián).${range}`;
  const lastOfficial = official.points.at(-1);
  const lastTrend = trend?.points.at(-1);
  const forecast = [
    trend && lastTrend
      ? `${trend.years < 5 ? `Za poslední ${trend.years} roky` : `Za posledních ${trend.years} let`} rostl medián průměrně o ${formatPercent(trend.rate)} ročně; při stejném tempu by v roce ${lastTrend.year} byl kolem ${formatCzk(lastTrend.median)} (rozpětí ${formatCzk(lastTrend.low)} až ${formatCzk(lastTrend.high)}).`
      : "",
    lastOfficial
      ? `Kdyby rostl stejně jako průměrná mzda podle predikce Ministerstva financí, byl by v roce ${lastOfficial.year} kolem ${formatCzk(lastOfficial.median)}.`
      : "",
  ].filter(Boolean).join(" ");
  const caveats = [
    "Jde o mzdy všech zaměstnanců v povolání bez ohledu na věk a praxi, nástupní mzda absolventa bývá nižší.",
    latest.employees !== null && latest.employees < FEW_EMPLOYEES
      ? "Povolání má málo zaměstnanců, údaje jsou jen orientační."
      : "",
    wages.direct ? "" : "Povolání je odvozené z příbuzných oborů, které pro něj Národní soustava povolání uvádí.",
  ].filter(Boolean).join(" ");
  return { current, forecast, caveats };
};
