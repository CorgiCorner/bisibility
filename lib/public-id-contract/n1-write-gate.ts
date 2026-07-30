import type { PublicIdMigrationDatabase } from "@/lib/public-id-migrator/types";
import { publicIdContractEntities } from "./definition";
import { readPublicIdContractReadiness } from "./readiness";

export const PUBLIC_ID_V3_N1_WRITE_GATE_PHASE = "public-id-v3-n1";
const RELEASE_N_PHASE = "public-id-v3-n";
const LOCAL_RELEASE = "0000000000000000000000000000000000000000";
const APP_RELEASE = /^[0-9a-f]{40}$/;
const CUTOVER_ID = "20260729213000_public_id_v3_cutover";
const CUTOVER_CHECKSUM = "396deeba223f6d6d9bfacc8f5f15b4972fef65e2c877f82761448fcf65f27f1a";

export type PublicIdV3N1WriteGateContext = {
  phase: typeof PUBLIC_ID_V3_N1_WRITE_GATE_PHASE;
  releasePolicy: "automatic" | "operator";
  targetAppRelease: string;
};

type N1WriteGateEnvironment = {
  [key: string]: string | undefined;
  APP_VERSION?: string;
  DEPLOYMENT_ENV?: string;
};

type GateRow = {
  blocked: boolean;
  phase: string;
  releasePolicy: string;
  releasedAppRelease: string | null;
  releasedAt: unknown | null;
  targetAppRelease: string;
};

function exactRelease(value: string | undefined) {
  return value && APP_RELEASE.test(value) ? value : null;
}

function quotedIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function publicIdV3N1WriteGateContext(
  env: N1WriteGateEnvironment = process.env,
): PublicIdV3N1WriteGateContext {
  const targetAppRelease = exactRelease(env.APP_VERSION);
  if (env.DEPLOYMENT_ENV === "production") {
    if (!targetAppRelease) {
      throw new Error(
        "Production public ID v3 N+1 migration requires APP_VERSION as an exact lowercase 40-character commit SHA.",
      );
    }
    return {
      phase: PUBLIC_ID_V3_N1_WRITE_GATE_PHASE,
      releasePolicy: "operator",
      targetAppRelease,
    };
  }
  if (
    env.DEPLOYMENT_ENV === "development" ||
    env.DEPLOYMENT_ENV === "preview" ||
    env.DEPLOYMENT_ENV === "test"
  ) {
    return {
      phase: PUBLIC_ID_V3_N1_WRITE_GATE_PHASE,
      releasePolicy: "automatic",
      targetAppRelease: targetAppRelease ?? LOCAL_RELEASE,
    };
  }
  throw new Error(
    "DEPLOYMENT_ENV must be production, preview, test, or development before running public ID v3 N+1 migrations.",
  );
}

async function gateInstalled(db: PublicIdMigrationDatabase) {
  const result = await db.query(
    `SELECT CASE
       WHEN current_schema() IS NULL THEN FALSE
       ELSE to_regclass(
         format('%I.public_id_v3_write_gate', current_schema())
       ) IS NOT NULL
     END AS "installed"`,
  );
  return result.rows[0]?.installed === true;
}

async function lockProtectedTables(db: PublicIdMigrationDatabase) {
  const protectedTables = await db.query(
    `SELECT table_meta.schemaname AS "schema", table_meta.tablename AS "table"
       FROM pg_catalog.pg_tables AS table_meta
      WHERE table_meta.schemaname = current_schema()
        AND table_meta.tablename NOT IN (
          '_prisma_migrations',
          'data_migrations',
          'public_id_v3_write_gate'
        )
      ORDER BY table_meta.tablename`,
  );
  for (const row of protectedTables.rows) {
    await db.query(
      `LOCK TABLE ${quotedIdentifier(String(row.schema))}.${quotedIdentifier(
        String(row.table),
      )} IN SHARE ROW EXCLUSIVE MODE`,
    );
  }
  await db.query(`LOCK TABLE "data_migrations" IN SHARE ROW EXCLUSIVE MODE`);
}

async function readLockedGate(db: PublicIdMigrationDatabase): Promise<GateRow> {
  const result = await db.query(
    `SELECT "phase",
            "releasePolicy",
            "targetAppRelease",
            "writesBlocked" AS "blocked",
            "releasedAt",
            "releasedAppRelease"
       FROM "public_id_v3_write_gate"
      WHERE "id" IS TRUE
      FOR UPDATE`,
  );
  const row = result.rows[0];
  if (result.rows.length !== 1 || typeof row?.blocked !== "boolean") {
    throw new Error("Public ID v3 write gate control row is missing or inconsistent.");
  }
  return {
    blocked: row.blocked,
    phase: String(row.phase ?? ""),
    releasePolicy: String(row.releasePolicy ?? ""),
    releasedAppRelease: typeof row.releasedAppRelease === "string" ? row.releasedAppRelease : null,
    releasedAt: row.releasedAt ?? null,
    targetAppRelease: String(row.targetAppRelease ?? ""),
  };
}

function isBlockedN1(row: GateRow, context: PublicIdV3N1WriteGateContext) {
  return (
    row.blocked &&
    row.phase === context.phase &&
    row.releasePolicy === context.releasePolicy &&
    row.targetAppRelease === context.targetAppRelease &&
    row.releasedAt == null &&
    row.releasedAppRelease == null
  );
}

function assertReleasedN(row: GateRow, context: PublicIdV3N1WriteGateContext) {
  if (
    row.blocked ||
    row.phase !== RELEASE_N_PHASE ||
    row.releasePolicy !== context.releasePolicy ||
    row.releasedAt == null ||
    row.releasedAppRelease !== row.targetAppRelease ||
    !APP_RELEASE.test(row.targetAppRelease)
  ) {
    throw new Error("Public ID v3 N+1 requires a consistently released release N write gate.");
  }
}

async function assertFreshFinalContract(db: PublicIdMigrationDatabase) {
  const ready = await readPublicIdContractReadiness({
    $queryRawUnsafe: async <T>(query: string) => {
      const result = await db.query(query);
      return result.rows as T;
    },
  });
  if (!ready) {
    throw new Error("Fresh public ID v3 N+1 transition requires the final catalog contract.");
  }
  await assertFreshDatabaseEmpty(db);
}

async function assertFreshDatabaseEmpty(db: PublicIdMigrationDatabase) {
  const rowCount = await db.query(
    `SELECT (${publicIdContractEntities
      .map(({ table }) => `(SELECT COUNT(*) FROM ${quotedIdentifier(table)})`)
      .join(" + ")})::bigint AS "count"`,
  );
  if (BigInt(String(rowCount.rows[0]?.count ?? "-1")) !== 0n) {
    throw new Error("A blocked release N gate can enter N+1 only on an empty fresh database.");
  }
}

async function assertFinishedReleaseN(db: PublicIdMigrationDatabase) {
  const result = await db.query(
    `SELECT 1 AS "ready"
       FROM "data_migrations"
      WHERE "id" = $1
        AND "checksum" = $2
        AND "finishedAt" IS NOT NULL`,
    [CUTOVER_ID, CUTOVER_CHECKSUM],
  );
  if (result.rows.length !== 1) {
    throw new Error("Public ID v3 release N data migration audit is incomplete or mismatched.");
  }
}

export async function reblockPublicIdV3N1WriteGate(
  db: PublicIdMigrationDatabase,
  context: PublicIdV3N1WriteGateContext,
  options: { allowFreshBlockedN?: boolean } = {},
) {
  if (!(await gateInstalled(db))) return { installed: false, transitioned: false };

  await db.query("BEGIN");
  try {
    await db.query(`SET LOCAL lock_timeout = '30s'`);
    await lockProtectedTables(db);
    const gate = await readLockedGate(db);
    if (isBlockedN1(gate, context)) {
      await db.query("COMMIT");
      return { installed: true, transitioned: false };
    }

    if (
      gate.blocked &&
      gate.phase === context.phase &&
      options.allowFreshBlockedN === true &&
      gate.releasePolicy === "automatic" &&
      gate.targetAppRelease === LOCAL_RELEASE &&
      gate.releasedAt == null &&
      gate.releasedAppRelease == null
    ) {
      await assertFreshFinalContract(db);
      const updated = await db.query(
        `UPDATE "public_id_v3_write_gate"
            SET "releasePolicy" = $1,
                "targetAppRelease" = $2,
                "updatedAt" = NOW()
          WHERE "id" IS TRUE
            AND "phase" = $3
            AND "writesBlocked" IS TRUE
            AND "releasedAt" IS NULL
            AND "releasedAppRelease" IS NULL
          RETURNING "phase"`,
        [context.releasePolicy, context.targetAppRelease, context.phase],
      );
      if (updated.rows.length !== 1 || updated.rows[0]?.phase !== context.phase) {
        throw new Error("Fresh public ID v3 N+1 write gate could not be retargeted.");
      }
      await db.query("COMMIT");
      return { installed: true, transitioned: true };
    }

    if (gate.phase === RELEASE_N_PHASE && gate.blocked) {
      if (!options.allowFreshBlockedN) {
        throw new Error(
          "Public ID v3 release N is still blocked; release and verify N before N+1.",
        );
      }
      if (
        gate.releasePolicy !== "automatic" ||
        gate.targetAppRelease !== LOCAL_RELEASE ||
        gate.releasedAt != null ||
        gate.releasedAppRelease != null
      ) {
        throw new Error("Blocked public ID v3 release N is not an initial fresh-install gate.");
      }
      await assertFreshDatabaseEmpty(db);
      await db.query("COMMIT");
      return { installed: true, transitioned: false };
    } else {
      assertReleasedN(gate, context);
      await assertFinishedReleaseN(db);
    }

    const updated = await db.query(
      `UPDATE "public_id_v3_write_gate"
          SET "phase" = $1,
              "releasePolicy" = $2,
              "targetAppRelease" = $3,
              "writesBlocked" = TRUE,
              "releasedAt" = NULL,
              "releasedAppRelease" = NULL,
              "updatedAt" = NOW()
        WHERE "id" IS TRUE
          AND "phase" = $4
          AND "releasePolicy" = $5
          AND "targetAppRelease" = $6
          AND "writesBlocked" IS FALSE
          AND "releasedAt" IS NOT NULL
          AND "releasedAppRelease" = $6
        RETURNING "phase"`,
      [
        context.phase,
        context.releasePolicy,
        context.targetAppRelease,
        RELEASE_N_PHASE,
        gate.releasePolicy,
        gate.targetAppRelease,
      ],
    );
    if (updated.rows.length !== 1 || updated.rows[0]?.phase !== context.phase) {
      throw new Error("Public ID v3 write gate could not enter release N+1.");
    }
    await db.query("COMMIT");
    return { installed: true, transitioned: true };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
