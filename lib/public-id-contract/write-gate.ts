import type { PublicIdMigrationDatabase } from "@/lib/public-id-migrator/types";

export const PUBLIC_ID_V3_WRITE_GATE_PHASE = "public-id-v3-n";
export const PUBLIC_ID_V3_LOCAL_RELEASE = "0000000000000000000000000000000000000000";

const WRITE_GATE_BYPASS = "bisibility.public_id_write_gate_bypass";
const APP_RELEASE = /^[0-9a-f]{40}$/;

export type PublicIdV3WriteGatePolicy = "automatic" | "operator";

export type PublicIdV3WriteGateContext = {
  phase: typeof PUBLIC_ID_V3_WRITE_GATE_PHASE;
  releasePolicy: PublicIdV3WriteGatePolicy;
  targetAppRelease: string;
};

export type PublicIdV3WriteGateState = {
  blocked: boolean;
  installed: boolean;
  phase: string | null;
  releasePolicy: PublicIdV3WriteGatePolicy | null;
  releasedAppRelease: string | null;
  targetAppRelease: string | null;
};

type WriteGateEnvironment = {
  [key: string]: string | undefined;
  APP_VERSION?: string;
  DEPLOYMENT_ENV?: string;
};

function normalizedAppRelease(value: string | undefined) {
  return value && APP_RELEASE.test(value) ? value : null;
}

export function publicIdV3WriteGateContext(
  env: WriteGateEnvironment = process.env,
): PublicIdV3WriteGateContext {
  const deployment = env.DEPLOYMENT_ENV;
  const appRelease = normalizedAppRelease(env.APP_VERSION);

  if (deployment === "production") {
    if (!appRelease) {
      throw new Error(
        "Production public ID v3 migration requires APP_VERSION as an exact lowercase 40-character commit SHA.",
      );
    }
    return {
      phase: PUBLIC_ID_V3_WRITE_GATE_PHASE,
      releasePolicy: "operator",
      targetAppRelease: appRelease,
    };
  }

  if (deployment === "preview" || deployment === "test" || deployment === "development") {
    return {
      phase: PUBLIC_ID_V3_WRITE_GATE_PHASE,
      releasePolicy: "automatic",
      targetAppRelease: appRelease ?? PUBLIC_ID_V3_LOCAL_RELEASE,
    };
  }

  throw new Error(
    "DEPLOYMENT_ENV must be production, preview, test, or development before running public ID v3 migrations.",
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function policyValue(value: unknown): PublicIdV3WriteGatePolicy | null {
  return value === "automatic" || value === "operator" ? value : null;
}

export async function readPublicIdV3WriteGate(
  db: PublicIdMigrationDatabase,
): Promise<PublicIdV3WriteGateState> {
  const relation = await db.query(
    `SELECT to_regclass('public_id_v3_write_gate') IS NOT NULL AS "installed"`,
  );
  if (relation.rows[0]?.installed !== true) {
    return {
      blocked: true,
      installed: false,
      phase: null,
      releasePolicy: null,
      releasedAppRelease: null,
      targetAppRelease: null,
    };
  }

  const result = await db.query(
    `SELECT "phase",
            "releasePolicy",
            "targetAppRelease",
            "writesBlocked" AS "blocked",
            "releasedAppRelease"
       FROM "public_id_v3_write_gate"
      WHERE "id" IS TRUE`,
  );
  const row = result.rows[0];
  if (result.rows.length !== 1 || !row) {
    return {
      blocked: true,
      installed: false,
      phase: null,
      releasePolicy: null,
      releasedAppRelease: null,
      targetAppRelease: null,
    };
  }

  return {
    blocked: row.blocked !== false,
    installed: true,
    phase: stringValue(row.phase),
    releasePolicy: policyValue(row.releasePolicy),
    releasedAppRelease: stringValue(row.releasedAppRelease),
    targetAppRelease: stringValue(row.targetAppRelease),
  };
}

function assertGateMatchesContext(
  gate: PublicIdV3WriteGateState,
  context: PublicIdV3WriteGateContext,
) {
  if (
    !gate.installed ||
    gate.phase !== context.phase ||
    gate.releasePolicy !== context.releasePolicy ||
    gate.targetAppRelease !== context.targetAppRelease
  ) {
    throw new Error("Public ID v3 write gate does not match the deployment context.");
  }
}

export async function retargetPublicIdV3WriteGate(
  db: PublicIdMigrationDatabase,
  context: PublicIdV3WriteGateContext,
) {
  const gate = await readPublicIdV3WriteGate(db);
  if (!gate.installed) {
    throw new Error("Public ID v3 write gate is not installed.");
  }
  if (!gate.blocked) {
    if (
      gate.phase !== context.phase ||
      gate.releasePolicy === null ||
      gate.releasedAppRelease !== gate.targetAppRelease
    ) {
      throw new Error("Released public ID v3 write gate is inconsistent.");
    }
    return gate;
  }
  if (gate.phase !== context.phase) {
    throw new Error("Public ID v3 write gate is in an unexpected phase.");
  }

  const result = await db.query(
    `UPDATE "public_id_v3_write_gate"
        SET "releasePolicy" = $1,
            "targetAppRelease" = $2,
            "updatedAt" = NOW()
      WHERE "id" IS TRUE
        AND "phase" = $3
        AND "writesBlocked" IS TRUE
      RETURNING "phase",
                "releasePolicy",
                "targetAppRelease",
                "writesBlocked" AS "blocked",
                "releasedAppRelease"`,
    [context.releasePolicy, context.targetAppRelease, context.phase],
  );
  if (result.rows.length !== 1) {
    throw new Error("Public ID v3 write gate could not be retargeted.");
  }
  const updated = await readPublicIdV3WriteGate(db);
  assertGateMatchesContext(updated, context);
  return updated;
}

export async function releasePublicIdV3WriteGate(
  db: PublicIdMigrationDatabase,
  context: PublicIdV3WriteGateContext,
) {
  const result = await db.query(
    `UPDATE "public_id_v3_write_gate"
        SET "writesBlocked" = FALSE,
            "releasedAt" = NOW(),
            "releasedAppRelease" = $1,
            "updatedAt" = NOW()
      WHERE "id" IS TRUE
        AND "phase" = $2
        AND "releasePolicy" = $3
        AND "targetAppRelease" = $1
        AND "writesBlocked" IS TRUE
      RETURNING "writesBlocked" AS "blocked"`,
    [context.targetAppRelease, context.phase, context.releasePolicy],
  );
  if (result.rows.length !== 1 || result.rows[0]?.blocked !== false) {
    throw new Error("Public ID v3 write gate could not be released for this deployment.");
  }
}

export async function withPublicIdV3CutoverBypass<T>(
  db: PublicIdMigrationDatabase,
  work: () => Promise<T>,
) {
  const gate = await readPublicIdV3WriteGate(db);
  if (!gate.installed || !gate.blocked || gate.phase !== PUBLIC_ID_V3_WRITE_GATE_PHASE) {
    throw new Error("Public ID v3 cutover bypass requires the active release N write gate.");
  }
  const previous = await db.query(`SELECT current_setting($1, TRUE) AS "value"`, [
    WRITE_GATE_BYPASS,
  ]);
  const previousValue = stringValue(previous.rows[0]?.value) ?? "";
  await db.query(`SELECT set_config($1, $2, FALSE)`, [WRITE_GATE_BYPASS, gate.phase]);
  try {
    return await work();
  } finally {
    await db.query(`SELECT set_config($1, $2, FALSE)`, [WRITE_GATE_BYPASS, previousValue]);
  }
}
