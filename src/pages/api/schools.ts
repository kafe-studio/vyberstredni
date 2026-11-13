import { env } from "cloudflare:workers";
import { isAuthorizedAdminRequest } from "../../lib/admin";
import { schools as defaultSchools } from "../../data/schools";

const db = env.DB;
const legacySeedIds = Array.from({ length: 21 }, (_, index) => `spg-${index + 1}`);

const isAuthorized = async (request: Request) => {
  return isAuthorizedAdminRequest(request);
};

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
  verifiedNote: String(row.verifiedNote ?? "Ověřeno podle veřejného profilu a typového zaměření školy."),
});

const ensureSeedData = async () => {
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

export async function GET() {
  if (!db) {
    return Response.json(defaultSchools);
  }

  await ensureSeedData();
  const result = await db.prepare("SELECT * FROM schools ORDER BY name ASC").all();

  return Response.json(
    result.results.map((row) => normalizeSchool(row as Record<string, unknown>))
  );
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!db) {
    return Response.json({ error: "D1 database is not configured." }, { status: 500 });
  }

  await ensureSeedData();
  const payload = (await request.json()) as Record<string, unknown>;
  const id = String(payload.id ?? crypto.randomUUID());
  const item = {
    id,
    name: String(payload.name ?? ""),
    region: String(payload.region ?? "Praha"),
    type: String(payload.type ?? "gymnázium"),
    focus: String(payload.focus ?? "technologie"),
    description: String(payload.description ?? ""),
    acceptance: String(payload.acceptance ?? ""),
    capacity: String(payload.capacity ?? ""),
    commute: String(payload.commute ?? ""),
    fee: String(payload.fee ?? ""),
    tags: JSON.stringify(Array.isArray(payload.tags) ? payload.tags : []),
    audience: JSON.stringify(Array.isArray(payload.audience) ? payload.audience : []),
    idealStudent: String(payload.idealStudent ?? ""),
    strengths: JSON.stringify(Array.isArray(payload.strengths) ? payload.strengths : []),
    challenges: JSON.stringify(Array.isArray(payload.challenges) ? payload.challenges : []),
    verifiedNote: String(payload.verifiedNote ?? "Ověřeno podle veřejného profilu a typového zaměření školy."),
  };

  const existing = await db.prepare("SELECT 1 FROM schools WHERE id = ?").bind(id).first();

  if (existing) {
    await db
      .prepare(
        `UPDATE schools
         SET name = ?, region = ?, type = ?, focus = ?, description = ?, acceptance = ?, capacity = ?, commute = ?, fee = ?, tags = ?, audience = ?, idealStudent = ?, strengths = ?, challenges = ?, verifiedNote = ?, updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(
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
        item.verifiedNote,
        id
      )
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO schools (id, name, region, type, focus, description, acceptance, capacity, commute, fee, tags, audience, idealStudent, strengths, challenges, verifiedNote, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
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
  }

  return Response.json({ success: true, id });
}

export async function DELETE(request: Request) {
  if (!(await isAuthorized(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");

  if (!db || !id) {
    return Response.json({ error: "Missing D1 database or school id." }, { status: 400 });
  }

  await ensureSeedData();
  await db.prepare("DELETE FROM schools WHERE id = ?").bind(id).run();

  return Response.json({ success: true, id });
}
