import { escapeHtml } from "./school-data";
import { formatCzk, type ProgramWages } from "./program-wages";

/**
 * Line chart of an occupation's median wage: the ISPV history, the occupation's own trend carried forward (with its
 * uncertainty band) and the Ministry of Finance average-wage forecast applied to it. Returns HTML (legend, SVG,
 * table view) so the static school pages and the client-rendered Obory page draw the same chart.
 * Hover tooltips come from src/lib/wage-chart-hover.ts.
 */

/** Validated against the paper surface #fffdf7 (dataviz validate_palette.js: all checks pass). */
export const WAGE_CHART_COLORS = { own: "#3556b8", official: "#d9731a" } as const;

/**
 * "narrow" fits a program card on a phone (~210 px wide, so fewer year labels keep the text readable); "wide" fills
 * the Obory page card. The SVG scales with its box, so the view box sets the text size relative to the chart.
 */
export type WageChartLayout = "narrow" | "wide";

const LAYOUTS: Record<WageChartLayout, { width: number; height: number; yearStep: number; maxWidth: string }> = {
  narrow: { width: 260, height: 190, yearStep: 4, maxWidth: "max-w-xs" },
  wide: { width: 440, height: 220, yearStep: 2, maxWidth: "max-w-xl" },
};
const MARGIN = { top: 22, right: 10, bottom: 24, left: 46 };
const SURFACE = "#fffdf7";
const GRID = "rgba(30, 35, 51, 0.12)";
const MUTED_TEXT = "#565e6e";
const FORECAST_SHADE = "#f1ede3";

const thousands = (value: number) => `${Math.round(value / 1000).toLocaleString("cs-CZ")} tis.`;

const niceStep = (span: number) => {
  for (const step of [5000, 10000, 20000, 25000, 50000]) if (span / step <= 5) return step;
  return 100000;
};

const linePath = (points: Array<[number, number]>) =>
  points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

const tooltipFor = (wages: ProgramWages, year: number) => {
  const history = wages.history.find((point) => point.year === year);
  const trend = wages.trend?.points.find((point) => point.year === year);
  const official = wages.official.points.find((point) => point.year === year);
  const lines = [String(year)];
  if (history) {
    lines.push(`Medián: ${formatCzk(history.median)}`);
    if (history.q1 !== null && history.q3 !== null) lines.push(`Prostřední polovina: ${formatCzk(history.q1)} – ${formatCzk(history.q3)}`);
  }
  if (trend) lines.push(`Trend povolání: ${formatCzk(trend.median)} (${formatCzk(trend.low)} – ${formatCzk(trend.high)})`);
  if (official) lines.push(`Podle predikce MF: ${formatCzk(official.median)}${official.kind === "outlook" ? " (výhled)" : ""}`);
  return lines.join("\n");
};

export const wageChartHtml = (wages: ProgramWages, title: string, layout: WageChartLayout = "narrow") => {
  const { width: WIDTH, height: HEIGHT, yearStep, maxWidth } = LAYOUTS[layout];
  const { history, trend, official, latest } = wages;
  const years = [...history.map((point) => point.year), ...official.points.map((point) => point.year)];
  const firstYear = Math.min(...years);
  const lastYear = Math.max(...years);
  const values = [
    ...history.map((point) => point.median),
    ...(trend?.points.flatMap((point) => [point.low, point.high]) ?? []),
    ...official.points.map((point) => point.median),
  ];
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const step = niceStep(rawMax - rawMin);
  const yMin = Math.floor(rawMin / step) * step;
  const yMax = Math.ceil(rawMax / step) * step;

  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (year: number) => MARGIN.left + ((year - firstYear) / Math.max(1, lastYear - firstYear)) * plotWidth;
  const y = (value: number) => MARGIN.top + (1 - (value - yMin) / Math.max(1, yMax - yMin)) * plotHeight;
  const start: [number, number] = [x(latest.year), y(latest.median)];

  const ticks: string[] = [];
  for (let value = yMin; value <= yMax; value += step) {
    ticks.push(`<line x1="${MARGIN.left}" x2="${WIDTH - MARGIN.right}" y1="${y(value).toFixed(1)}" y2="${y(value).toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`);
    ticks.push(`<text x="${MARGIN.left - 6}" y="${(y(value) + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="${MUTED_TEXT}">${thousands(value)}</text>`);
  }
  const yearLabels = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    // Count from the latest measured year so it always gets a label (2017, 2021, 2025, 2029 with a step of 4).
    if ((latest.year - year) % yearStep !== 0) continue;
    yearLabels.push(`<text x="${x(year).toFixed(1)}" y="${HEIGHT - 6}" text-anchor="${year === lastYear ? "end" : "middle"}" font-size="12" fill="${MUTED_TEXT}">${year}</text>`);
  }

  const forecastShade = official.points.length
    ? `<rect x="${start[0].toFixed(1)}" y="${MARGIN.top}" width="${(x(lastYear) - start[0]).toFixed(1)}" height="${plotHeight}" fill="${FORECAST_SHADE}" opacity="0.7"/>
       <text x="${(start[0] + 4).toFixed(1)}" y="${MARGIN.top - 8}" font-size="12" fill="${MUTED_TEXT}">prognóza</text>`
    : "";
  const band = trend
    ? `<path d="${linePath([start, ...trend.points.map((point): [number, number] => [x(point.year), y(point.high)])])} ${trend.points
      .slice()
      .reverse()
      .map((point) => `L${x(point.year).toFixed(1)},${y(point.low).toFixed(1)}`)
      .join(" ")} Z" fill="${WAGE_CHART_COLORS.own}" opacity="0.1"/>`
    : "";
  const historyLine = `<path d="${linePath(history.map((point): [number, number] => [x(point.year), y(point.median)]))}" fill="none" stroke="${WAGE_CHART_COLORS.own}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  const trendLine = trend
    ? `<path d="${linePath([start, ...trend.points.map((point): [number, number] => [x(point.year), y(point.median)])])}" fill="none" stroke="${WAGE_CHART_COLORS.own}" stroke-width="2" stroke-dasharray="6 4" stroke-linecap="round"/>`
    : "";
  const officialLine = official.points.length
    ? `<path d="${linePath([start, ...official.points.map((point): [number, number] => [x(point.year), y(point.median)])])}" fill="none" stroke="${WAGE_CHART_COLORS.official}" stroke-width="2" stroke-dasharray="1 5" stroke-linecap="round"/>`
    : "";
  const labelBelow = start[1] < MARGIN.top + 24;
  const endDot = `<circle cx="${start[0].toFixed(1)}" cy="${start[1].toFixed(1)}" r="4" fill="${WAGE_CHART_COLORS.own}" stroke="${SURFACE}" stroke-width="2"/>
    <text x="${(start[0] - 6).toFixed(1)}" y="${(start[1] + (labelBelow ? 18 : -10)).toFixed(1)}" text-anchor="end" font-size="12" font-weight="700" fill="#1e2333">${formatCzk(latest.median)}</text>`;

  const slot = plotWidth / Math.max(1, lastYear - firstYear);
  const hits = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    const hasData = history.some((point) => point.year === year) || official.points.some((point) => point.year === year);
    if (!hasData) continue;
    hits.push(`<rect class="wage-hit" x="${(x(year) - slot / 2).toFixed(1)}" y="${MARGIN.top}" width="${slot.toFixed(1)}" height="${plotHeight}" fill="transparent" data-x="${x(year).toFixed(1)}" data-tip="${escapeHtml(tooltipFor(wages, year))}"/>`);
  }

  const legendItem = (dash: string, color: string, label: string) =>
    `<li class="flex items-center gap-1.5"><svg width="22" height="8" aria-hidden="true"><line x1="1" x2="21" y1="4" y2="4" stroke="${color}" stroke-width="2" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ""}/></svg>${label}</li>`;
  const legend = `<ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
    ${legendItem("", WAGE_CHART_COLORS.own, "Medián mzdy (ISPV)")}
    ${trend ? legendItem("6 4", WAGE_CHART_COLORS.own, "Trend povolání") : ""}
    ${official.points.length ? legendItem("1 5", WAGE_CHART_COLORS.official, "Podle predikce MF") : ""}
  </ul>`;

  const rows = [
    ...history.map((point) => `<tr><td>${point.year}</td><td>${formatCzk(point.median)}</td><td>${point.q1 !== null && point.q3 !== null ? `${formatCzk(point.q1)} – ${formatCzk(point.q3)}` : "—"}</td><td>—</td><td>—</td></tr>`),
    ...official.points.map((point) => {
      const own = trend?.points.find((item) => item.year === point.year);
      return `<tr><td>${point.year}${point.kind === "outlook" ? " (výhled)" : ""}</td><td>—</td><td>—</td><td>${own ? `${formatCzk(own.median)} (${formatCzk(own.low)} – ${formatCzk(own.high)})` : "—"}</td><td>${formatCzk(point.median)}</td></tr>`;
    }),
  ].join("");

  return `<figure class="wage-chart relative mt-3 ${maxWidth}">
    <figcaption class="sr-only">${escapeHtml(title)}</figcaption>
    ${legend}
    <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" class="mt-2 block h-auto w-full" role="img" aria-label="${escapeHtml(title)}" style="font-variant-numeric: tabular-nums">
      ${forecastShade}
      ${ticks.join("")}
      ${yearLabels.join("")}
      ${band}
      ${historyLine}
      ${trendLine}
      ${officialLine}
      ${endDot}
      <line class="wage-crosshair" x1="0" x2="0" y1="${MARGIN.top}" y2="${MARGIN.top + plotHeight}" stroke="#1e2333" stroke-opacity="0.35" stroke-width="1" visibility="hidden"/>
      ${hits.join("")}
    </svg>
    <div class="wage-tip pointer-events-none absolute z-10 hidden whitespace-pre-line rounded-[3px] border border-border bg-card px-2.5 py-1.5 text-xs leading-5 text-foreground shadow-paper" role="status"></div>
    <details class="mt-2 text-xs">
      <summary class="cursor-pointer text-muted-foreground">Zobrazit čísla v tabulce</summary>
      <div class="mt-2 overflow-x-auto">
        <table class="w-full text-left" style="font-variant-numeric: tabular-nums">
          <thead class="text-muted-foreground"><tr><th class="pr-3 font-medium">Rok</th><th class="pr-3 font-medium">Medián</th><th class="pr-3 font-medium">Prostřední polovina</th><th class="pr-3 font-medium">Trend povolání</th><th class="font-medium">Predikce MF</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </details>
  </figure>`;
};
