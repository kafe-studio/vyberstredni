import { withBase } from "./urls";

/**
 * Anonymous first-party statistics: page views, time on page and a few actions.
 * No cookies and nothing stored in the browser; the server only keeps a daily-rotating visitor hash.
 */
const ENDPOINT = withBase("/api/collect/");

type EventData = Record<string, string | number | boolean | null | undefined>;

let firstPage = true;
let pageStart = 0;
let maxScroll = 0;
let leaveSent = true;

const send = (type: string, data?: EventData, extra: Record<string, unknown> = {}) => {
  try {
    const body = JSON.stringify({
      type,
      path: location.pathname,
      screen: window.screen.width,
      lang: navigator.language,
      data,
      ...extra,
    });
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.(ENDPOINT, blob)) {
      void fetch(ENDPOINT, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
    }
  } catch {
    // Statistics must never break the page.
  }
};

/** Records an action on the current page (quiz completed, search, …). */
export const track = (type: string, data?: EventData) => send(type, data);

const scrollPercent = () => {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  return scrollable <= 0 ? 100 : Math.min(100, Math.round((window.scrollY / scrollable) * 100));
};

const sendLeave = () => {
  if (leaveSent) return;
  leaveSent = true;
  const seconds = Math.round((performance.now() - pageStart) / 1000);
  send("leave", { seconds, scroll: Math.max(maxScroll, scrollPercent()) });
};

const onPageLoad = () => {
  if (location.pathname.includes("/admin")) return;
  const params = new URLSearchParams(location.search);
  // Facebook and Google Ads add click ids instead of UTM parameters.
  const utmSource = params.get("utm_source") ?? (params.has("fbclid") ? "facebook" : params.has("gclid") ? "google-ads" : null);
  // document.referrer keeps the first page's referrer during client-side navigation, so send it only once.
  send("pageview", undefined, firstPage
    ? { referrer: document.referrer, utmSource, utmCampaign: params.get("utm_campaign") }
    : {});
  firstPage = false;
  pageStart = performance.now();
  maxScroll = scrollPercent();
  leaveSent = false;
};

/** Starts the tracker once per document; Astro's client router fires astro:page-load on every navigation. */
export const startAnalytics = () => {
  document.addEventListener("astro:page-load", onPageLoad);
  document.addEventListener("astro:before-preparation", sendLeave);
  window.addEventListener("pagehide", sendLeave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") sendLeave();
  });
  window.addEventListener("scroll", () => {
    maxScroll = Math.max(maxScroll, scrollPercent());
  }, { passive: true });
  // Links to other websites (school webs, our other projects).
  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!link || link.host === location.host || !/^https?:$/.test(link.protocol)) return;
    track("outbound", { host: link.hostname.replace(/^www\./, ""), url: `${link.hostname}${link.pathname}`.slice(0, 120) });
  });
};
