import { withBase } from "./urls";
import type { SupportType } from "./special-needs";
import { PROGRAM_OUTLOOK_DATA_PATH, type ProgramOutlookData } from "./program-outlook";

/** Compact school record shared by the catalog, detail, favorites, programs and quiz pages. */
export type SchoolSummary = {
  id: string;
  name: string;
  region: string;
  town: string;
  support: SupportType | null;
  /** The school's own domov mládeže or internát ("Domov mládeže, 135 lůžek"), "" without one. */
  dormitory: string;
  type: string;
  focus: string;
  founder: string;
  founderCode: string;
  address: string;
  izo: string;
  redIzo: string;
  ico: string;
  officialTypeCode: string;
  capacity: string;
  phone: string;
  email: string;
  website: string;
  latitude: number | null;
  longitude: number | null;
};

export type CatalogProgram = { code: string; name: string; isPhasingOut: boolean };
export type SchoolProgramsById = Record<string, CatalogProgram[]>;

export const SCHOOLS_DATA_PATH = "/data/schools.json";
export const SCHOOL_PROGRAMS_DATA_PATH = "/data/school-programs.json";
export const SCHOOL_STATS_DATA_PATH = "/data/school-stats.json";

/** CERMAT figures per school (missing schools have no published data). */
export type SchoolStats = {
  /** Share of registered students who passed the common part of the maturita, in %. */
  maturita: number | null;
  /** Applications per place in the 1st admission round (day study). */
  applicationsPerPlace: number | null;
  /** Admitted students' average percentile in the unified entrance exam. */
  percentile: number | null;
};
export type SchoolStatsById = Record<string, SchoolStats>;
export const FAVORITES_KEY = "vyberstredni-favorites";
export const FAVORITE_PROGRAMS_KEY = "vyberstredni-favorite-programs";

// Module-level cache survives ClientRouter navigations, so each file is fetched once per visit.
const jsonCache = new Map<string, Promise<unknown>>();

const loadJson = (path: string): Promise<unknown> => {
  const cached = jsonCache.get(path);
  if (cached) return cached;

  const request = fetch(withBase(path)).then((response) =>
    response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status} for ${path}`)),
  );
  jsonCache.set(path, request);
  request.catch(() => jsonCache.delete(path));
  return request;
};

export const loadSchools = () => loadJson(SCHOOLS_DATA_PATH) as Promise<SchoolSummary[]>;
export const loadSchoolPrograms = () => loadJson(SCHOOL_PROGRAMS_DATA_PATH) as Promise<SchoolProgramsById>;
export const loadSchoolStats = () => loadJson(SCHOOL_STATS_DATA_PATH) as Promise<SchoolStatsById>;
export const loadProgramOutlook = () => loadJson(PROGRAM_OUTLOOK_DATA_PATH) as Promise<ProgramOutlookData>;

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);

const toRadians = (degrees: number) => degrees * Math.PI / 180;

/** Great-circle ("as the crow flies") distance in kilometres. */
export const distanceKm = (fromLatitude: number, fromLongitude: number, toLatitude: number, toLongitude: number) => {
  const deltaLatitude = toRadians(toLatitude - fromLatitude);
  const deltaLongitude = toRadians(toLongitude - fromLongitude);
  const value = Math.sin(deltaLatitude / 2) ** 2 +
    Math.sin(deltaLongitude / 2) ** 2 * Math.cos(toRadians(fromLatitude)) * Math.cos(toRadians(toLatitude));
  const bounded = Math.min(1, Math.max(0, value));
  return 6371 * 2 * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
};

/** Czech format: "850 m", "4,2 km", and whole kilometres from 10 km, where decimals add nothing. */
export const formatDistance = (km: number) => {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(km)} km`;
};

const readList = (key: string): string[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

const writeList = (key: string, items: string[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); favorites then last only for this page.
  }
};

const toggleInList = (key: string, id: string) => {
  const items = readList(key);
  const next = items.includes(id) ? items.filter((item) => item !== id) : [...items, id];
  writeList(key, next);
  return next;
};

export const getFavorites = (): string[] => readList(FAVORITES_KEY);
export const setFavorites = (favorites: string[]) => writeList(FAVORITES_KEY, favorites);
export const toggleFavorite = (id: string) => toggleInList(FAVORITES_KEY, id);

/** Saved programs, by program code ("65-51-H/01"). */
export const getFavoritePrograms = (): string[] => readList(FAVORITE_PROGRAMS_KEY);
export const setFavoritePrograms = (codes: string[]) => writeList(FAVORITE_PROGRAMS_KEY, codes);
export const toggleFavoriteProgram = (code: string) => toggleInList(FAVORITE_PROGRAMS_KEY, code);

/** Shows a ♡/♥ favorite button as saved or not (the outlined button style of the detail pages). */
export const paintFavoriteButton = (button: HTMLElement, active: boolean) => {
  button.classList.toggle("is-favorite", active);
  button.setAttribute("aria-pressed", String(active));
  button.classList.toggle("border-primary/50", active);
  button.classList.toggle("bg-primary/10", active);
  button.classList.toggle("text-primary", active);
  const icon = button.querySelector(".favorite-icon");
  if (icon) icon.textContent = active ? "♥" : "♡";
};

/** The Obory page with this program selected. */
export const programPageUrl = (code: string) => withBase(`/obory/?obor=${encodeURIComponent(code)}`);
