/** The 14 Czech regions in the official order; Prague is shortened to "Praha" for display. */
export const REGIONS = [
  "Praha",
  "Středočeský kraj",
  "Jihočeský kraj",
  "Plzeňský kraj",
  "Karlovarský kraj",
  "Ústecký kraj",
  "Liberecký kraj",
  "Královéhradecký kraj",
  "Pardubický kraj",
  "Kraj Vysočina",
  "Jihomoravský kraj",
  "Olomoucký kraj",
  "Zlínský kraj",
  "Moravskoslezský kraj",
] as const;

export type Region = (typeof REGIONS)[number];

/** Region name as used across the site, from the register's "kraj" field. */
export const regionFromRegister = (kraj: string): Region => {
  const name = kraj === "Hlavní město Praha" ? "Praha" : kraj;
  const region = REGIONS.find((item) => item === name);
  if (!region) throw new Error(`Unknown region in the school register: ${kraj}`);
  return region;
};

/** Rough bounding box of the Czech Republic, used to reject device locations abroad. */
export const isInCzechRepublic = (latitude: number, longitude: number) =>
  latitude >= 48.5 && latitude <= 51.1 && longitude >= 12.0 && longitude <= 18.9;
