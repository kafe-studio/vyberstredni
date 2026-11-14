import { env } from "cloudflare:workers";

/**
 * First-party, cookie-less visit statistics stored in D1.
 * A visitor is a salted hash of IP + user agent that changes every day, so nobody can be followed across days
 * and no personal data is stored.
 */

export const EVENT_TYPES = [
  "pageview",
  "leave",
  "quiz_start",
  "quiz_complete",
  "quiz_reset",
  "search",
  "directions",
  "favorite",
  "outbound",
  "program_view",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

const RETENTION_DAYS = 400;
const MAX_PATH = 300;
const MAX_TEXT = 120;
const MAX_DATA_KEYS = 12;

let schemaReady: Promise<void> | null = null;

const ensureSchema = (db: D1Database) => {
  schemaReady ??= db
    .batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        day TEXT NOT NULL,
        hour INTEGER NOT NULL,
        weekday INTEGER NOT NULL,
        type TEXT NOT NULL,
        path TEXT NOT NULL,
        page_kind TEXT NOT NULL,
        school_id TEXT,
        visitor TEXT NOT NULL,
        referrer_host TEXT,
        utm_source TEXT,
        utm_campaign TEXT,
        country TEXT,
        region TEXT,
        city TEXT,
        device TEXT,
        browser TEXT,
        os TEXT,
        screen INTEGER,
        lang TEXT,
        data TEXT
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS visits_day_type ON visits (day, type)"),
      db.prepare("CREATE INDEX IF NOT EXISTS visits_ts ON visits (ts)"),
      db.prepare("CREATE INDEX IF NOT EXISTS visits_visitor_day ON visits (visitor, day)"),
    ])
    .then(() => undefined)
    .catch((error: unknown) => {
      schemaReady = null;
      return Promise.reject(error);
    });
  return schemaReady;
};

const pragueParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Day (YYYY-MM-DD), hour and weekday (0 = Monday) in Czech time. */
export const pragueTime = (date: Date) => {
  const parts = Object.fromEntries(pragueParts.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    weekday: Math.max(0, WEEKDAYS.indexOf(parts.weekday ?? "")),
  };
};

const BOT_PATTERN = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pagespeed|monitor|curl|wget|python|httpclient|axios|node-fetch/i;

export const parseUserAgent = (ua: string) => {
  const device = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)
    ? "tablet"
    : /Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)
      ? "mobile"
      : "desktop";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /FBAN|FBAV|FB_IAB/.test(ua)
          ? "Facebook (v aplikaci)"
          : /Instagram/.test(ua)
            ? "Instagram (v aplikaci)"
            : /Firefox|FxiOS/.test(ua)
              ? "Firefox"
              : /Chrome|CriOS/.test(ua)
                ? "Chrome"
                : /Safari/.test(ua)
                  ? "Safari"
                  : "Jiný";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "Jiný";
  return { device, browser, os, isBot: BOT_PATTERN.test(ua) };
};

/** Which part of the site a path belongs to, and the school id on a school page. */
export const classifyPath = (path: string) => {
  const local = path.replace(/^\/vyberstredni/, "") || "/";
  const school = /^\/skoly\/([^/]+)\/?$/.exec(local);
  if (school) return { pageKind: "school", schoolId: decodeURIComponent(school[1] ?? "") };
  const kinds: Array<[RegExp, string]> = [
    [/^\/?$/, "home"],
    [/^\/skoly\/?$/, "catalog"],
    [/^\/obory\/?/, "programs"],
    [/^\/test\/?/, "quiz"],
    [/^\/oblibene\/?/, "favorites"],
    [/^\/blog\/?/, "blog"],
  ];
  return { pageKind: kinds.find(([pattern]) => pattern.test(local))?.[1] ?? "other", schoolId: null };
};

const text = (value: unknown, max = MAX_TEXT) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Small flat object of strings and numbers; anything else is dropped. */
const cleanData = (value: unknown) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const entries = Object.entries(value)
    .slice(0, MAX_DATA_KEYS)
    .flatMap(([key, item]): Array<[string, string | number]> => {
      const safeKey = key.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 30);
      if (!safeKey) return [];
      if (typeof item === "number" && Number.isFinite(item)) return [[safeKey, Math.round(item * 100) / 100]];
      if (typeof item === "string") return [[safeKey, item.trim().slice(0, MAX_TEXT)]];
      if (typeof item === "boolean") return [[safeKey, item ? 1 : 0]];
      return [];
    });
  return entries.length ? JSON.stringify(Object.fromEntries(entries)) : null;
};

const visitorHash = async (day: string, ip: string, ua: string) => {
  const salt = env.ADMIN_SESSION_SECRET ?? "vyberstredni";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${day}|${ip}|${ua}`));
  return [...new Uint8Array(digest).slice(0, 12)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const hostOf = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};


/** A geolocation field of request.cf, which Cloudflare fills on incoming requests. */
const geo = (cf: unknown, key: "country" | "region" | "city") => {
  if (typeof cf !== "object" || cf === null || !(key in cf)) return null;
  const value: unknown = Reflect.get(cf, key);
  return typeof value === "string" && value ? value.slice(0, 80) : null;
};

export type CollectInput = {
  type: unknown;
  path: unknown;
  referrer: unknown;
  utmSource: unknown;
  utmCampaign: unknown;
  screen: unknown;
  lang: unknown;
  data: unknown;
};

/** Stores one event; returns false when it was ignored (bot, invalid input, missing database). */
export const recordEvent = async (request: Request, cf: unknown, input: CollectInput) => {
  const db = env.DB;
  if (!db) return false;
  const type = EVENT_TYPES.find((item) => item === input.type);
  const path = text(input.path, MAX_PATH);
  if (!type || !path.startsWith("/")) return false;
  const ua = request.headers.get("user-agent") ?? "";
  const agent = parseUserAgent(ua);
  if (agent.isBot || !ua) return false;

  const now = new Date();
  const { day, hour, weekday } = pragueTime(now);
  const { pageKind, schoolId: pageSchool } = classifyPath(path);
  // Favourites toggled in the catalog name their school in the event data.
  const dataSchool = typeof input.data === "object" && input.data !== null && "school" in input.data ? text(input.data.school, 40) : "";
  const schoolId = pageSchool ?? (dataSchool || null);
  if (pageKind === "other" && path.includes("/admin")) return false;
  const ip = request.headers.get("cf-connecting-ip") ?? "";
  const referrerHost = hostOf(text(input.referrer, MAX_PATH));
  const ownHost = hostOf(request.url);
  const screen = typeof input.screen === "number" && Number.isFinite(input.screen) ? Math.round(input.screen) : null;

  await ensureSchema(db);
  await db
    .prepare(`INSERT INTO visits (ts, day, hour, weekday, type, path, page_kind, school_id, visitor, referrer_host,
      utm_source, utm_campaign, country, region, city, device, browser, os, screen, lang, data)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)`)
    .bind(
      now.getTime(),
      day,
      hour,
      weekday,
      type,
      path,
      pageKind,
      schoolId,
      await visitorHash(day, ip, ua),
      referrerHost && referrerHost !== ownHost ? referrerHost : null,
      text(input.utmSource, 60) || null,
      text(input.utmCampaign, 60) || null,
      geo(cf, "country"),
      geo(cf, "region"),
      geo(cf, "city"),
      agent.device,
      agent.browser,
      agent.os,
      screen,
      text(input.lang, 12) || null,
      cleanData(input.data),
    )
    .run();

  // Occasional clean-up keeps the table at roughly a year of data.
  if (Math.random() < 0.01) {
    await db.prepare("DELETE FROM visits WHERE ts < ?1").bind(now.getTime() - RETENTION_DAYS * 86_400_000).run();
  }
  return true;
};

type Row = Record<string, string | number | null>;

const shiftDay = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** All statistics for the days from..to (inclusive, Czech time) plus the same-length period before. */
export const loadStats = async (from: string, to: string) => {
  const db = env.DB;
  if (!db) return null;
  await ensureSchema(db);
  const length = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  const previousFrom = shiftDay(from, -length);
  const previousTo = shiftDay(from, -1);
  const now = Date.now();

  const range = "day BETWEEN ?1 AND ?2";
  const pageviews = `type = 'pageview' AND ${range}`;
  const queries: Array<[string, string, unknown[]]> = [
    ["totals", `SELECT COUNT(*) AS pageviews, COUNT(DISTINCT visitor || day) AS visitors FROM visits WHERE ${pageviews}`, [from, to]],
    ["previous", `SELECT COUNT(*) AS pageviews, COUNT(DISTINCT visitor || day) AS visitors FROM visits WHERE ${pageviews}`, [previousFrom, previousTo]],
    ["daily", `SELECT day, COUNT(*) AS pageviews, COUNT(DISTINCT visitor) AS visitors FROM visits WHERE ${pageviews} GROUP BY day ORDER BY day`, [from, to]],
    ["hourly", `SELECT hour, COUNT(*) AS pageviews, COUNT(DISTINCT visitor) AS visitors FROM visits WHERE ${pageviews} GROUP BY hour`, [from, to]],
    ["heatmap", `SELECT weekday, hour, COUNT(*) AS pageviews FROM visits WHERE ${pageviews} GROUP BY weekday, hour`, [from, to]],
    ["pages", `SELECT path, COUNT(*) AS pageviews, COUNT(DISTINCT visitor || day) AS visitors FROM visits WHERE ${pageviews} GROUP BY path ORDER BY pageviews DESC LIMIT 40`, [from, to]],
    ["sections", `SELECT page_kind AS label, COUNT(*) AS pageviews, COUNT(DISTINCT visitor || day) AS visitors FROM visits WHERE ${pageviews} GROUP BY page_kind ORDER BY pageviews DESC`, [from, to]],
    ["schools", `SELECT school_id AS id, COUNT(*) AS pageviews, COUNT(DISTINCT visitor || day) AS visitors FROM visits WHERE ${pageviews} AND page_kind = 'school' GROUP BY school_id ORDER BY pageviews DESC LIMIT 40`, [from, to]],
    ["referrers", `SELECT COALESCE(referrer_host, '(přímý přístup)') AS label, COUNT(DISTINCT visitor || day) AS visitors FROM visits WHERE ${pageviews} GROUP BY label ORDER BY visitors DESC LIMIT 25`, [from, to]],
    ["campaigns", `SELECT utm_source || COALESCE(' / ' || utm_campaign, '') AS label, COUNT(DISTINCT visitor || day) AS visitors FROM visits WHERE ${pageviews} AND utm_source IS NOT NULL GROUP BY label ORDER BY visitors DESC LIMIT 20`, [from, to]],
    ["countries", `SELECT COALESCE(country, '?') AS label, COUNT(DISTINCT visitor || day) AS visitors FROM visits WHERE ${pageviews} GROUP BY label ORDER BY visitors DESC LIMIT 20`, [from, to]],
    ["regions", `SELECT COALESCE(region, '?') AS label, COUNT(DISTINCT visitor || day) AS visitors FROM visits WHERE ${pageviews} AND country = 'CZ' GROUP BY label ORDER BY visitors DESC LIMIT 20`, [from, to]],
    ["cities", `SELECT COALESCE(city, '?') AS label, COUNT(DISTINCT visitor || day) AS visitors FROM visits WHERE ${pageviews} GROUP BY label ORDER BY visitors DESC LIMIT 30`, [from, to]],
    ["devices", `SELECT device AS label, COUNT(DISTINCT visitor || day) AS visitors FROM visits WHERE ${pageviews} GROUP BY label ORDER BY visitors DESC`, [from, to]],
    ["browsers", `SELECT browser AS label, COUNT(DISTINCT visitor || day) AS visitors FROM visits WHERE ${pageviews} GROUP BY label ORDER BY visitors DESC`, [from, to]],
    ["systems", `SELECT os AS label, COUNT(DISTINCT visitor || day) AS visitors FROM visits WHERE ${pageviews} GROUP BY label ORDER BY visitors DESC`, [from, to]],
    ["screens", `SELECT CASE WHEN screen IS NULL THEN '?' WHEN screen < 400 THEN 'do 400 px' WHEN screen < 768 THEN '400–767 px' WHEN screen < 1280 THEN '768–1279 px' WHEN screen < 1920 THEN '1280–1919 px' ELSE '1920 px a víc' END AS label, COUNT(DISTINCT visitor || day) AS visitors FROM visits WHERE ${pageviews} GROUP BY label ORDER BY visitors DESC`, [from, to]],
    ["events", `SELECT type AS label, COUNT(*) AS events, COUNT(DISTINCT visitor || day) AS visitors FROM visits WHERE type <> 'pageview' AND type <> 'leave' AND ${range} GROUP BY type`, [from, to]],
    ["sessions", `WITH v AS (SELECT visitor, day, COUNT(*) AS c FROM visits WHERE ${pageviews} GROUP BY visitor, day)
      SELECT COUNT(*) AS sessions, COALESCE(SUM(c = 1), 0) AS bounces, AVG(c) AS pagesPerVisit FROM v`, [from, to]],
    ["entries", `WITH v AS (SELECT visitor, day, MIN(ts) AS first FROM visits WHERE ${pageviews} GROUP BY visitor, day)
      SELECT p.path AS label, COUNT(*) AS visitors FROM v JOIN visits p ON p.visitor = v.visitor AND p.day = v.day AND p.ts = v.first AND p.type = 'pageview'
      GROUP BY p.path ORDER BY visitors DESC LIMIT 15`, [from, to]],
    ["exits", `WITH v AS (SELECT visitor, day, MAX(ts) AS last FROM visits WHERE ${pageviews} GROUP BY visitor, day)
      SELECT p.path AS label, COUNT(*) AS visitors FROM v JOIN visits p ON p.visitor = v.visitor AND p.day = v.day AND p.ts = v.last AND p.type = 'pageview'
      GROUP BY p.path ORDER BY visitors DESC LIMIT 15`, [from, to]],
    ["engagement", `SELECT page_kind AS label, COUNT(*) AS views, AVG(json_extract(data, '$.seconds')) AS seconds, AVG(json_extract(data, '$.scroll')) AS scroll
      FROM visits WHERE type = 'leave' AND ${range} AND json_extract(data, '$.seconds') BETWEEN 1 AND 3600 GROUP BY page_kind ORDER BY views DESC`, [from, to]],
    ["interests", `SELECT json_extract(data, '$.interest') AS label, COUNT(*) AS events FROM visits WHERE type = 'quiz_complete' AND ${range} GROUP BY label ORDER BY events DESC`, [from, to]],
    ["tracks", `SELECT json_extract(data, '$.track') AS label, COUNT(*) AS events FROM visits WHERE type = 'quiz_complete' AND ${range} GROUP BY label ORDER BY events DESC`, [from, to]],
    ["supports", `SELECT json_extract(data, '$.support') AS label, COUNT(*) AS events FROM visits WHERE type = 'quiz_complete' AND ${range} GROUP BY label ORDER BY events DESC`, [from, to]],
    ["homes", `SELECT COALESCE(json_extract(data, '$.homeRegion'), '(bez bydliště)') AS label, COUNT(*) AS events FROM visits WHERE type = 'quiz_complete' AND ${range} GROUP BY label ORDER BY events DESC`, [from, to]],
    ["distances", `SELECT COALESCE(NULLIF(json_extract(data, '$.maxDistance'), ''), 'bez limitu') AS label, COUNT(*) AS events FROM visits WHERE type = 'quiz_complete' AND ${range} GROUP BY label ORDER BY events DESC`, [from, to]],
    ["searches", `SELECT lower(json_extract(data, '$.q')) AS label, json_extract(data, '$.where') AS place, COUNT(*) AS events, AVG(json_extract(data, '$.results')) AS results
      FROM visits WHERE type = 'search' AND ${range} GROUP BY label, place ORDER BY events DESC LIMIT 40`, [from, to]],
    ["directions", `SELECT school_id AS id, COUNT(*) AS events FROM visits WHERE type = 'directions' AND ${range} GROUP BY school_id ORDER BY events DESC LIMIT 20`, [from, to]],
    ["favorites", `SELECT school_id AS id, COUNT(*) AS events FROM visits WHERE type = 'favorite' AND json_extract(data, '$.added') = 1 AND ${range} GROUP BY school_id ORDER BY events DESC LIMIT 20`, [from, to]],
    ["programViews", `SELECT json_extract(data, '$.program') AS label, COUNT(*) AS events FROM visits WHERE type = 'program_view' AND ${range} GROUP BY label ORDER BY events DESC LIMIT 30`, [from, to]],
    ["outbound", `SELECT json_extract(data, '$.host') AS label, COUNT(*) AS events FROM visits WHERE type = 'outbound' AND ${range} GROUP BY label ORDER BY events DESC LIMIT 25`, [from, to]],
    ["live", "SELECT COUNT(DISTINCT visitor) AS visitors5, (SELECT COUNT(DISTINCT visitor) FROM visits WHERE ts > ?2) AS visitors30 FROM visits WHERE ts > ?1", [now - 5 * 60_000, now - 30 * 60_000]],
    ["recent", `SELECT ts, type, path, school_id AS schoolId, country, city, device, browser, referrer_host AS referrer, data FROM visits WHERE type <> 'leave' ORDER BY ts DESC LIMIT 60`, []],
  ];

  const results = await db.batch<Row>(queries.map(([, sql, params]) => db.prepare(sql).bind(...params)));
  const stats: Record<string, Row[]> = {};
  queries.forEach(([name], index) => {
    stats[name] = results[index]?.results ?? [];
  });
  return { from, to, previousFrom, previousTo, generatedAt: now, ...stats };
};
