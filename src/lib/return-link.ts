import { readHistoryValue, writeHistoryValue } from "./history-state";
import { withBase } from "./urls";

/**
 * "Back" on a school detail returns to the list the school was opened from.
 * A plain click on a school link notes where it came from; the detail page then binds that origin to its own
 * history entry, so the label, the link and history.back() always point to the same page, also after
 * Back/Forward or a reload. Without a bound origin the detail keeps its default link to the catalog.
 */
const PENDING_KEY = "vyberstredni-pending-return";
const STATE_KEY = "vyberstredniReturnTo";
/** A note older than this belongs to a navigation that never finished. */
const PENDING_MAX_AGE_MS = 30_000;

/** A left click without modifier keys: the link opens in this tab. */
export const isPlainClick = (event: MouseEvent): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

const isSchoolPath = (pathname: string): boolean => {
  const prefix = withBase("/skoly/");
  return pathname.startsWith(prefix) && /^[^/]+\/?$/.test(pathname.slice(prefix.length));
};

/** The school link a click opens in this tab, or null. */
export const clickedSchoolLink = (event: MouseEvent): URL | null => {
  if (!isPlainClick(event) || !(event.target instanceof Element)) return null;
  const link = event.target.closest("a[href]");
  if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== "_self") || link.hasAttribute("download")) return null;
  const url = new URL(link.href);
  if (url.origin !== window.location.origin || !isSchoolPath(url.pathname) || url.pathname === window.location.pathname) return null;
  return url;
};

/** Document click listener: notes the page a school is opened from. */
export const rememberSchoolClick = (event: MouseEvent): void => {
  const url = clickedSchoolLink(event);
  if (!url) return;
  try {
    const from = `${window.location.pathname}${window.location.search}`;
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ from, to: url.pathname, at: Date.now() }));
  } catch {
    // Storage blocked: the detail page keeps its link to the catalog.
  }
};

const takePendingFrom = (): string | null => {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    window.sessionStorage.removeItem(PENDING_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return null;
    const { from, to, at } = Object.fromEntries(Object.entries(parsed));
    if (typeof from !== "string" || typeof to !== "string" || typeof at !== "number") return null;
    if (to !== window.location.pathname || Date.now() - at > PENDING_MAX_AGE_MS || at > Date.now()) return null;
    return from;
  } catch {
    return null;
  }
};

/**
 * Where this detail was opened from and how to get there, or null. Call on the detail's page load, while the
 * detail's own history entry is current. `goBack` steps back past any in-page (#anchor) entries added since.
 */
export const returnTarget = (): { from: string; goBack: () => void } | null => {
  const bound = readHistoryValue(STATE_KEY);
  const from = typeof bound === "string" ? bound : takePendingFrom();
  // Only an origin bound to this entry is safe to step back to; otherwise keep the default link.
  if (!from || (typeof bound !== "string" && !writeHistoryValue(STATE_KEY, from))) return null;
  const entryIndex = readHistoryValue("index");
  if (typeof entryIndex !== "number") return null;
  return {
    from,
    goBack: () => {
      const currentIndex = readHistoryValue("index");
      if (typeof currentIndex === "number" && currentIndex >= entryIndex) window.history.go(entryIndex - currentIndex - 1);
      else window.location.assign(from);
    },
  };
};
