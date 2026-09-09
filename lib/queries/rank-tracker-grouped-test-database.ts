import { Client } from "pg";
import { applyTemporaryKeywordNormalizationMigration } from "./rank-tracker-grouped-contract-helpers";

export type TemporaryGroupedLocation = {
  canonicalKey: string;
  displayName: string;
  hl: string;
  id: string;
  kind: string;
  marketStatus?: "active" | "paused" | "removed";
};
export type TemporaryGroupedRankCheck = {
  checkedAt: string;
  id: string;
  normalizationVersion?: string | null;
  position: number | null;
  previousPosition?: number | null;
  rankingUrl: string | null;
  raw: Record<string, unknown>;
  requestedDepth?: number | null;
  status: string;
};
export type TemporaryGroupedTarget = {
  archivedAt?: string | null;
  createdAt: string;
  device: string;
  intent: string | null;
  internalId: string;
  keyword: string;
  location: TemporaryGroupedLocation;
  marketStatus?: "active" | "paused" | "removed";
  publicId: string;
  rankChecks: readonly TemporaryGroupedRankCheck[];
  tags: readonly string[];
  targetUrl: string | null;
  topic: string | null;
};
type TemporaryDeviceColumn = {
  isEnum: boolean;
  isTemporary: boolean;
  labels: string[];
  name: string;
};

const temporaryRelations = [
  "keywords",
  "keyword_tags",
  "keyword_traffic_snapshots",
  "locations",
  "project_markets",
  "provider_connections",
  "rank_checks",
  "tags",
];

export const groupedFilterPostgresUrl =
  process.env.RANK_TRACKER_GROUPED_POSTGRES_URL?.trim() ||
  process.env.DIRECT_URL?.trim() ||
  process.env.DATABASE_URL?.trim();

export async function withGroupedFilterDatabase<T>(
  projectId: string,
  locations: readonly TemporaryGroupedLocation[],
  targets: readonly TemporaryGroupedTarget[],
  run: (client: Client) => Promise<T>,
) {
  return withTemporaryGroupedDatabase(async (client) => {
    await seedTemporaryGroupedFixture(client, projectId, locations, targets);
    return run(client);
  });
}

export async function withTemporaryGroupedDatabase<T>(run: (client: Client) => Promise<T>) {
  if (!groupedFilterPostgresUrl)
    throw new Error("A PostgreSQL URL is required for this contract test.");
  const client = new Client({ connectionString: groupedFilterPostgresUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await createTemporarySchema(client);
    await assertTemporaryRelations(client);
    await assertTemporaryDeviceEnum(client);
    await applyTemporaryKeywordNormalizationMigration(client);
    return await run(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}

async function createTemporarySchema(client: Client) {
  await client.query(`
    CREATE TYPE pg_temp."Device" AS ENUM ('desktop', 'mobile');
    CREATE TEMP TABLE locations (
      id text PRIMARY KEY, "canonicalKey" text NOT NULL, "displayName" text NOT NULL,
      hl text NOT NULL, kind text NOT NULL
    ) ON COMMIT DROP;
    CREATE TEMP TABLE keywords (
      id text PRIMARY KEY, "publicId" text NOT NULL, "projectId" text NOT NULL,
      text text NOT NULL, "locationId" text NOT NULL, device pg_temp."Device" NOT NULL,
      "createdAt" timestamptz NOT NULL, "archivedAt" timestamptz, "targetUrl" text, topic text, intent text
    ) ON COMMIT DROP;
    CREATE TEMP TABLE project_markets (
      "projectId" text NOT NULL, "locationId" text NOT NULL, status text NOT NULL
    ) ON COMMIT DROP;
    CREATE TEMP TABLE rank_checks (
      id text PRIMARY KEY, "keywordId" text NOT NULL, status text NOT NULL,
      "checkedAt" timestamptz NOT NULL, "normalizationVersion" text, "requestedDepth" integer,
      "rankingUrl" text, position integer, "previousPosition" integer, raw jsonb
    ) ON COMMIT DROP;
    CREATE TEMP TABLE keyword_tags ("keywordId" text NOT NULL, "tagId" text NOT NULL) ON COMMIT DROP;
    CREATE TEMP TABLE tags (id text PRIMARY KEY, name text NOT NULL) ON COMMIT DROP;
    CREATE TEMP TABLE keyword_traffic_snapshots (
      "keywordId" text NOT NULL, provider text NOT NULL, date date NOT NULL,
      clicks integer NOT NULL, impressions integer NOT NULL, ctr double precision NOT NULL
    ) ON COMMIT DROP;
    CREATE TEMP TABLE provider_connections (
      "projectId" text NOT NULL, provider text NOT NULL, kind text NOT NULL,
      enabled boolean NOT NULL, status text NOT NULL, priority integer
    ) ON COMMIT DROP;
  `);
}

export async function assertTemporaryDeviceEnum(client: Client) {
  const result = await client.query<TemporaryDeviceColumn>(`
    SELECT type.typtype = 'e' AS "isEnum", type.typnamespace = pg_my_temp_schema() AS "isTemporary",
      type.typname AS name, array_agg(label.enumlabel::text ORDER BY label.enumsortorder) AS labels
    FROM pg_attribute attribute
    JOIN pg_type type ON type.oid = attribute.atttypid
    LEFT JOIN pg_enum label ON label.enumtypid = type.oid
    WHERE attribute.attrelid = 'keywords'::regclass AND attribute.attname = 'device'
      AND NOT attribute.attisdropped
    GROUP BY type.typtype, type.typnamespace, type.typname
  `);
  const column = result.rows[0];
  if (!column?.isEnum) {
    throw new Error("Expected keywords.device to use the temporary Device enum.");
  }
  if (
    !column.isTemporary ||
    column.name !== "Device" ||
    column.labels.join(",") !== "desktop,mobile"
  ) {
    throw new Error("Expected keywords.device to use the temporary Device enum.");
  }
  return column;
}

async function assertTemporaryRelations(client: Client) {
  const result = await client.query<{ name: string; temporary: boolean }>(
    `SELECT requested.name, relation.relpersistence = 't' AS temporary
     FROM unnest($1::text[]) AS requested(name)
     LEFT JOIN pg_class relation ON relation.oid = to_regclass(requested.name)`,
    [temporaryRelations],
  );
  const unsafe = result.rows.filter((row) => row.temporary !== true).map((row) => row.name);
  if (unsafe.length) throw new Error(`Expected TEMP test relations only: ${unsafe.join(", ")}.`);
}

export async function seedTemporaryGroupedFixture(
  client: Client,
  projectId: string,
  locations: readonly TemporaryGroupedLocation[],
  targets: readonly TemporaryGroupedTarget[],
) {
  for (const location of locations) {
    await client.query(
      `INSERT INTO locations (id, "canonicalKey", "displayName", hl, kind)
       VALUES ($1, $2, $3, $4, $5)`,
      [location.id, location.canonicalKey, location.displayName, location.hl, location.kind],
    );
    await client.query(
      'INSERT INTO project_markets ("projectId", "locationId", status) VALUES ($1, $2, $3)',
      [
        projectId,
        location.id,
        location.marketStatus ??
          targets.find((target) => target.location.id === location.id)?.marketStatus ??
          "active",
      ],
    );
  }
  for (const target of targets) await insertTarget(client, projectId, target);
}

async function insertTarget(client: Client, projectId: string, target: TemporaryGroupedTarget) {
  await client.query(
    `INSERT INTO keywords (id, "publicId", "projectId", text, "locationId", device, "createdAt", "archivedAt", "targetUrl", topic, intent)
     VALUES ($1, $2, $3, $4, $5, $6::pg_temp."Device", $7, $8, $9, $10, $11)`,
    [
      target.internalId,
      target.publicId,
      projectId,
      target.keyword,
      target.location.id,
      target.device.toLowerCase(),
      target.createdAt,
      target.archivedAt ?? null,
      target.targetUrl,
      target.topic,
      target.intent,
    ],
  );
  for (const check of target.rankChecks) {
    await client.query(
      `INSERT INTO rank_checks (id, "keywordId", status, "checkedAt", "normalizationVersion", "requestedDepth", "rankingUrl", position, "previousPosition", raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        check.id,
        target.internalId,
        check.status,
        check.checkedAt,
        check.normalizationVersion ?? "v1",
        check.requestedDepth ?? 100,
        check.rankingUrl,
        check.position,
        check.previousPosition ?? null,
        JSON.stringify(check.raw),
      ],
    );
  }
  for (const name of target.tags) {
    const id = `tag_${name.toLowerCase()}`;
    await client.query("INSERT INTO tags (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING", [
      id,
      name,
    ]);
    await client.query('INSERT INTO keyword_tags ("keywordId", "tagId") VALUES ($1, $2)', [
      target.internalId,
      id,
    ]);
  }
}
