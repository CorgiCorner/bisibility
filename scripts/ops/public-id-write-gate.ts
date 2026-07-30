#!/usr/bin/env -S node --experimental-transform-types

import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { blockingDataMigrationManifest } from "@/lib/data-migrations/manifest";
import { databaseConnectionConfig } from "@/lib/db/pool-config";
import { assertPublicIdContractPrepared } from "@/lib/public-id-contract/prepare";
import {
  PUBLIC_ID_V3_WRITE_GATE_PHASE,
  readPublicIdV3WriteGate,
  releasePublicIdV3WriteGate,
} from "@/lib/public-id-contract/write-gate";
import type { PublicIdMigrationDatabase } from "@/lib/public-id-migrator/types";
import pg from "pg";

const { Client } = pg;
const RELEASE_PATTERN = /^[0-9a-f]{40}$/;
const WRITE_GATE_POLICY = "operator";

type Command = "release" | "status";

type PublicIdWriteGateState = {
  blocked: boolean;
  phase: string;
  releasePolicy: string;
  releasedAppRelease: string | null;
  releasedAt: unknown | null;
  targetAppRelease: string;
};

export function parsePublicIdWriteGateOptions(args: string[]) {
  const parsed = parseArgs({
    allowPositionals: true,
    args,
    options: {
      "expected-app-release": { type: "string" },
      "health-url": { type: "string" },
    },
    strict: true,
  });
  const command = parsed.positionals[0] as Command | undefined;
  if (
    !command ||
    !["release", "status"].includes(command) ||
    parsed.positionals.length !== 1
  ) {
    throw new Error("Expected exactly one command: status or release.");
  }
  return {
    command,
    expectedAppRelease: parsed.values["expected-app-release"],
    healthUrl: parsed.values["health-url"]?.trim(),
  };
}

export async function verifyLiveApplication(
  expectedAppRelease: string | undefined,
  healthUrl: string | undefined,
) {
  if (!expectedAppRelease || !RELEASE_PATTERN.test(expectedAppRelease)) {
    throw new Error("--expected-app-release must be an exact 40-character lowercase commit SHA.");
  }
  if (!healthUrl) throw new Error("--health-url is required.");
  const url = new URL(healthUrl);
  if (url.protocol !== "https:") throw new Error("--health-url must use HTTPS.");

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 200 && response.status !== 503) {
    throw new Error(`Application health returned HTTP ${response.status}.`);
  }
  const body = (await response.json()) as {
    services?: {
      app?: unknown;
      appRelease?: unknown;
      database?: unknown;
      migrations?: unknown;
    };
  };
  if (
    body.services?.app !== "ok" ||
    body.services.database !== "ok" ||
    body.services.migrations !== "ready" ||
    body.services.appRelease !== expectedAppRelease
  ) {
    throw new Error("Application health does not match the expected ready release.");
  }
  return expectedAppRelease;
}

export function assertPublicIdWriteGateState(
  state: PublicIdWriteGateState,
  expectedAppRelease?: string,
) {
  if (state.phase !== PUBLIC_ID_V3_WRITE_GATE_PHASE) {
    throw new Error(
      `Public ID v3 write gate phase must be ${PUBLIC_ID_V3_WRITE_GATE_PHASE}.`,
    );
  }
  if (state.releasePolicy !== WRITE_GATE_POLICY) {
    throw new Error(`Public ID v3 write gate policy must be ${WRITE_GATE_POLICY}.`);
  }
  if (!RELEASE_PATTERN.test(state.targetAppRelease)) {
    throw new Error("Public ID v3 write gate target release is not an exact commit SHA.");
  }
  if (expectedAppRelease && state.targetAppRelease !== expectedAppRelease) {
    throw new Error("Public ID v3 write gate target release does not match the application.");
  }
  const hasReleasedAt = state.releasedAt != null;
  const hasReleasedAppRelease = state.releasedAppRelease != null;
  if (hasReleasedAt !== hasReleasedAppRelease) {
    throw new Error("Public ID v3 write gate release audit fields are inconsistent.");
  }
  if (state.blocked === hasReleasedAt) {
    throw new Error("Public ID v3 write gate release audit does not match its blocked state.");
  }
  if (
    state.releasedAppRelease != null &&
    !RELEASE_PATTERN.test(state.releasedAppRelease)
  ) {
    throw new Error("Public ID v3 write gate released application is not an exact commit SHA.");
  }
}

async function readOperatorWriteGate(
  db: PublicIdMigrationDatabase,
): Promise<PublicIdWriteGateState> {
  const installed = await readPublicIdV3WriteGate(db);
  if (!installed.installed) {
    throw new Error("Public ID v3 write gate is not installed.");
  }
  const result = await db.query(
    `SELECT "phase",
            "releasePolicy",
            "targetAppRelease",
            "writesBlocked" AS "blocked",
            "releasedAt",
            "releasedAppRelease"
       FROM "public_id_v3_write_gate"
      WHERE "id" IS TRUE`,
  );
  if (result.rows.length !== 1) {
    throw new Error("Public ID v3 write gate control row is missing or inconsistent.");
  }
  const row = result.rows[0] ?? {};
  if (typeof row.blocked !== "boolean") {
    throw new Error("Public ID v3 write gate blocked state is invalid.");
  }
  const state = {
    blocked: row.blocked,
    phase: String(row.phase ?? ""),
    releasePolicy: String(row.releasePolicy ?? ""),
    releasedAppRelease:
      typeof row.releasedAppRelease === "string" ? row.releasedAppRelease : null,
    releasedAt: row.releasedAt ?? null,
    targetAppRelease: String(row.targetAppRelease ?? ""),
  };
  assertPublicIdWriteGateState(state);
  return state;
}

export async function releasePublicIdWriteGate(
  db: PublicIdMigrationDatabase,
  expectedAppRelease: string,
) {
  return releasePublicIdV3WriteGate(db, {
    phase: PUBLIC_ID_V3_WRITE_GATE_PHASE,
    releasePolicy: WRITE_GATE_POLICY,
    targetAppRelease: expectedAppRelease,
  });
}

function assertReleasedState(state: PublicIdWriteGateState, expectedAppRelease: string) {
  if (
    state.blocked ||
    state.releasedAt == null ||
    state.releasedAppRelease !== expectedAppRelease
  ) {
    throw new Error("Public ID v3 write gate release audit verification failed.");
  }
}

async function assertBlockingMigrationReady(db: PublicIdMigrationDatabase) {
  const blocking = blockingDataMigrationManifest();
  const result = await db.query(
    `SELECT "id", "checksum", "finishedAt"
       FROM "data_migrations"
      WHERE "id" = ANY($1::text[])`,
    [blocking.map((migration) => migration.id)],
  );
  const completed = new Map(result.rows.map((row) => [String(row.id), row]));
  const ready = blocking.every((migration) => {
    const row = completed.get(migration.id);
    return row?.finishedAt != null && row.checksum === migration.checksum;
  });
  if (!ready) throw new Error("Blocking public ID data migration is not ready.");
}

export async function runPublicIdWriteGateCommand(args = process.argv.slice(2)) {
  const commandOptions = parsePublicIdWriteGateOptions(args);
  const databaseUrl = (process.env.DIRECT_URL ?? process.env.DATABASE_URL)?.trim();
  if (!databaseUrl) throw new Error("DIRECT_URL or DATABASE_URL is required.");

  let verifiedRelease: string | null = null;
  if (commandOptions.command !== "status") {
    verifiedRelease = await verifyLiveApplication(
      commandOptions.expectedAppRelease,
      commandOptions.healthUrl,
    );
  }

  const db = new Client({
    connectionString: databaseUrl,
    ...databaseConnectionConfig(databaseUrl),
  });
  await db.connect();
  try {
    const migrationDb = db as unknown as PublicIdMigrationDatabase;
    const before = await readOperatorWriteGate(migrationDb);

    if (commandOptions.command === "status") {
      return {
        appReleaseVerified: false,
        blocked: before.blocked,
        command: commandOptions.command,
        installed: true,
        phase: before.phase,
        releasePolicy: before.releasePolicy,
        releasedAppRelease: before.releasedAppRelease,
        releasedAt: before.releasedAt,
        targetAppRelease: before.targetAppRelease,
      };
    }

    const expectedRelease = verifiedRelease;
    if (!expectedRelease) {
      throw new Error("Application release verification did not return a commit SHA.");
    }
    assertPublicIdWriteGateState(before, expectedRelease);
    await assertBlockingMigrationReady(migrationDb);
    await assertPublicIdContractPrepared(migrationDb);
    if (before.blocked) {
      await releasePublicIdWriteGate(migrationDb, expectedRelease);
    }
    const after = await readOperatorWriteGate(migrationDb);
    assertPublicIdWriteGateState(after, expectedRelease);
    assertReleasedState(after, expectedRelease);

    return {
      appRelease: verifiedRelease,
      appReleaseVerified: true,
      blocked: after.blocked,
      command: commandOptions.command,
      installed: true,
      migrationReady: true,
      phase: after.phase,
      releasePolicy: after.releasePolicy,
      releasedAppRelease: after.releasedAppRelease,
      releasedAt: after.releasedAt,
      targetAppRelease: after.targetAppRelease,
    };
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPublicIdWriteGateCommand()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    })
    .catch((error) => {
      process.stderr.write(
        `${JSON.stringify({
          command: "public-id-write-gate",
          error: error instanceof Error ? error.message : String(error),
          ok: false,
        })}\n`,
      );
      process.exitCode = 1;
    });
}
