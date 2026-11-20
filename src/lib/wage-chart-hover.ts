/**
 * Crosshair + tooltip for the wage charts drawn by src/lib/wage-chart.ts. One delegated listener on the document
 * serves every chart, also charts inserted later (the Obory page renders them on demand) and after client-side
 * navigation, so calling this more than once is harmless.
 */

let enabled = false;

const hide = (figure: Element) => {
  figure.querySelector<HTMLElement>(".wage-tip")?.classList.add("hidden");
  figure.querySelector(".wage-crosshair")?.setAttribute("visibility", "hidden");
};

const show = (hit: SVGRectElement) => {
  const figure = hit.closest(".wage-chart");
  const svg = hit.ownerSVGElement;
  const tip = figure?.querySelector<HTMLElement>(".wage-tip");
  const crosshair = figure?.querySelector(".wage-crosshair");
  if (!figure || !svg || !tip || !crosshair) return;
  const x = hit.dataset.x ?? "0";
  crosshair.setAttribute("x1", x);
  crosshair.setAttribute("x2", x);
  crosshair.setAttribute("visibility", "visible");
  tip.textContent = hit.dataset.tip ?? "";
  tip.classList.remove("hidden");

  const figureBox = figure.getBoundingClientRect();
  const svgBox = svg.getBoundingClientRect();
  const viewWidth = svg.viewBox.baseVal.width || svgBox.width;
  const pointX = svgBox.left - figureBox.left + (Number(x) / viewWidth) * svgBox.width;
  const tipWidth = tip.offsetWidth;
  // Keep the tooltip inside the figure: right of the point, or left of it near the right edge.
  const left = pointX + 12 + tipWidth > figureBox.width ? Math.max(0, pointX - 12 - tipWidth) : pointX + 12;
  tip.style.left = `${left}px`;
  // Below the plot, so the tooltip never hides the lines it describes.
  tip.style.top = `${svgBox.bottom - figureBox.top + 4}px`;
};

export const enableWageChartHover = () => {
  if (enabled) return;
  enabled = true;
  document.addEventListener("pointerover", (event) => {
    const target = event.target;
    if (target instanceof SVGRectElement && target.classList.contains("wage-hit")) show(target);
  });
  document.addEventListener("pointerout", (event) => {
    const target = event.target;
    const next = event.relatedTarget;
    if (!(target instanceof Element) || !target.classList.contains("wage-hit")) return;
    const figure = target.closest(".wage-chart");
    if (figure && !(next instanceof Element && next.classList.contains("wage-hit") && figure.contains(next))) hide(figure);
  });
};
