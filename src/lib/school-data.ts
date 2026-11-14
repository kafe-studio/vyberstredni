import { withBase } from "./urls";
import type { SupportType } from "./special-needs";

/** Compact school record shared by the catalog, detail, favorites, programs and quiz pages. */
export type SchoolSummary = {
  id: string;
  name: string;
  region: string;
  town: string;
  support: SupportType | null;
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
export const FAVORITES_KEY = "vyberstredni-favorites";

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

export const formatDistance = (km: number) => km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;

export const getFavorites = (): string[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

export const setFavorites = (favorites: string[]) => {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); favorites then last only for this page.
  }
};

export const toggleFavorite = (id: string) => {
  const favorites = getFavorites();
  const next = favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id];
  setFavorites(next);
  return next;
};
