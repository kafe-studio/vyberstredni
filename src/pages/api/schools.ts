import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { isAuthorizedAdminRequest } from "../../lib/admin";
import { FOCUS_AREAS, SCHOOL_REGIONS, SCHOOL_TYPES, schools as defaultSchools } from "../../data/schools";

const db = env.DB;
const legacySeedIds = Array.from({ length: 21 }, (_, index) => `spg-${index + 1}`);

const DEFAULT_VERIFIED_NOTE = "Ověřeno podle veřejného profilu a typového zaměření školy.";
const MAX_TEXT_LENGTH = 2000;

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });
const badRequest = (error: string) => Response.json({ error }, { status: 400 });

const text = (value: unknown, fallback = "") =>
  (typeof value === "string" ? value.trim() : fallback).slice(0, MAX_TEXT_LENGTH);

const stringList = (value: unknown) =>
  JSON.stringify(
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").map((item) => text(item))
      : [],
  );

const oneOf = (value: unknown, allowed: readonly string[]) =>
  typeof value === "string" && allowed.includes(value) ? value : null;

const parseJsonList = (value: string | null) => {
  if (!value) return [];

  try {
    const result = JSON.parse(value);
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
};

const normalizeSchool = (row: Record<string, unknown>) => ({
  id: String(row.id ?? ""),
  name: String(row.name ?? ""),
  region: String(row.region ?? "Praha"),
  type: String(row.type ?? "gymnázium"),
  focus: String(row.focus ?? "technologie"),
  description: String(row.description ?? ""),
  acceptance: String(row.acceptance ?? ""),
  capacity: String(row.capacity ?? ""),
  commute: String(row.commute ?? ""),
  fee: String(row.fee ?? ""),
  tags: parseJsonList(typeof row.tags === "string" ? row.tags : null),
  audience: parseJsonList(typeof row.audience === "string" ? row.audience : null),
  idealStudent: String(row.idealStudent ?? row.ideal_student ?? ""),
  strengths: parseJsonList(typeof row.strengths === "string" ? row.strengths : null),
  challenges: parseJsonList(typeof row.challenges === "string" ? row.challenges : null),
  verifiedNote: String(row.verifiedNote ?? DEFAULT_VERIFIED_NOTE),
});

const prepareSchema = async () => {
  if (!db) {
    return;
  }

  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS schools (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        region TEXT NOT NULL,
        type TEXT NOT NULL,
        focus TEXT NOT NULL,
        description TEXT,
        acceptance TEXT,
        capacity TEXT,
        commute TEXT,
        fee TEXT,
        tags TEXT,
        audience TEXT,
        idealStudent TEXT,
        strengths TEXT,
        challenges TEXT,
        verifiedNote TEXT,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    .run();

  // Tables created by an older version of this endpoint lack the verifiedNote column.
  const columns = await db.prepare("PRAGMA table_info(schools)").all<{ name: string }>();
  if (!columns.results.some((column) => column.name === "verifiedNote")) {
    await db.prepare("ALTER TABLE schools ADD COLUMN verifiedNote TEXT").run();
  }

  const existing = await db.prepare("SELECT COUNT(*) AS count FROM schools").first<{ count: number }>();
  const existingCount = existing?.count ?? 0;
  let migrateLegacySeed = false;

  if (existingCount > 0) {
    if (existingCount !== legacySeedIds.length) return;

    const rows = await db.prepare("SELECT id FROM schools").all<{ id: string }>();
    const existingIds = new Set(rows.results.map((row) => row.id));
    migrateLegacySeed =
      existingIds.size === legacySeedIds.length &&
      legacySeedIds.every((id) => existingIds.has(id));

    if (!migrateLegacySeed) return;
  }

  const seedStatements = [];
  for (let start = 0; start < defaultSchools.length; start += 5) {
    const batch = defaultSchools.slice(start, start + 5);
    const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)").join(", ");
    const values = batch.flatMap((school) => [
      school.id,
      school.name,
      school.region,
      school.type,
      school.focus,
      school.description,
      school.acceptance,
      school.capacity,
      school.commute,
      school.fee,
      JSON.stringify(school.tags),
      JSON.stringify(school.audience),
      school.idealStudent,
      JSON.stringify(school.strengths),
      JSON.stringify(school.challenges),
      school.verifiedNote,
    ]);

    seedStatements.push(
      db.prepare(
        `INSERT INTO schools (id, name, region, type, focus, description, acceptance, capacity, commute, fee, tags, audience, idealStudent, strengths, challenges, verifiedNote, updatedAt)
         VALUES ${placeholders}`
      ).bind(...values)
    );
  }
  const migrationStatements = migrateLegacySeed
    ? [
        db.prepare("CREATE TABLE IF NOT EXISTS schools_legacy_seed AS SELECT * FROM schools WHERE 0"),
        db.prepare("INSERT INTO schools_legacy_seed SELECT * FROM schools"),
        db.prepare("DELETE FROM schools"),
        ...seedStatements,
      ]
    : seedStatements;

  await db.batch(migrationStatements);
};

// Schema check and seeding run once per Worker isolate; a failed attempt is retried on the next request.
let schemaReady: Promise<void> | null = null;

const ensureSeedData = () => {
  schemaReady ??= prepareSchema().catch((error: unknown) => {
    schemaReady = null;
    return Promise.reject(error);
  });
  return schemaReady;
};

export const GET: APIRoute = async () => {
  if (!db) {
    return Response.json(defaultSchools);
  }

  await ensureSeedData();
  const result = await db.prepare("SELECT * FROM schools ORDER BY name ASC").all();

  return Response.json(
    result.results.map((row) => normalizeSchool(row as Record<string, unknown>))
  );
};

export const POST: APIRoute = async ({ request }) => {
  if (!(await isAuthorizedAdminRequest(request))) {
    return unauthorized();
  }

  if (!db) {
    return Response.json({ error: "D1 database is not configured." }, { status: 500 });
  }

  const payload: unknown = await request.json().catch(() => null);
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return badRequest("Invalid JSON body.");
  }
  const data = payload as Record<string, unknown>;

  const name = text(data.name);
  const region = oneOf(data.region, SCHOOL_REGIONS);
  const type = oneOf(data.type, SCHOOL_TYPES);
  const focus = oneOf(data.focus, FOCUS_AREAS);
  if (!name) return badRequest("School name is required.");
  if (!region || !type || !focus) return badRequest("Invalid region, type or focus.");

  const id = text(data.id) || crypto.randomUUID();
  const item = {
    id,
    name,
    region,
    type,
    focus,
    description: text(data.description),
    acceptance: text(data.acceptance),
    capacity: text(data.capacity),
    commute: text(data.commute),
    fee: text(data.fee),
    tags: stringList(data.tags),
    audience: stringList(data.audience),
    idealStudent: text(data.idealStudent),
    strengths: stringList(data.strengths),
    challenges: stringList(data.challenges),
    verifiedNote: text(data.verifiedNote) || DEFAULT_VERIFIED_NOTE,
  };

  await ensureSeedData();
  await db
    .prepare(
      `INSERT INTO schools (id, name, region, type, focus, description, acceptance, capacity, commute, fee, tags, audience, idealStudent, strengths, challenges, verifiedNote, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, region = excluded.region, type = excluded.type, focus = excluded.focus,
         description = excluded.description, acceptance = excluded.acceptance, capacity = excluded.capacity,
         commute = excluded.commute, fee = excluded.fee, tags = excluded.tags, audience = excluded.audience,
         idealStudent = excluded.idealStudent, strengths = excluded.strengths, challenges = excluded.challenges,
         verifiedNote = excluded.verifiedNote, updatedAt = CURRENT_TIMESTAMP`
    )
    .bind(
      item.id,
      item.name,
      item.region,
      item.type,
      item.focus,
      item.description,
      item.acceptance,
      item.capacity,
      item.commute,
      item.fee,
      item.tags,
      item.audience,
      item.idealStudent,
      item.strengths,
      item.challenges,
      item.verifiedNote
    )
    .run();

  return Response.json({ success: true, id });
};

export const DELETE: APIRoute = async ({ request, url }) => {
  if (!(await isAuthorizedAdminRequest(request))) {
    return unauthorized();
  }

  const id = url.searchParams.get("id");
  if (!db) {
    return Response.json({ error: "D1 database is not configured." }, { status: 500 });
  }
  if (!id) {
    return badRequest("Missing school id.");
  }

  await ensureSeedData();
  await db.prepare("DELETE FROM schools WHERE id = ?").bind(id).run();

  return Response.json({ success: true, id });
};
