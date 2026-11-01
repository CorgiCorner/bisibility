import { randomUUID } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";
import { reservePaidAttempts } from "@/lib/metering/paid-admission";
import type { PaidAttemptInput } from "@/lib/metering/paid-attempt-types";
import { decode } from "@/lib/metering/store/codec";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { uncertaintyScopeUnknownCount } from "@/lib/provider-usage/uncertainty-gate-state";
import { type closeoutPostgresFixture, liveCredentialEnvelope } from "./postgres.test-fixture";

type Fixture = Awaited<ReturnType<typeof closeoutPostgresFixture>>;

/** Ordinary BYOK paid admission through the real binding, row-lock and Meter path. */
export async function paidInput(f: Fixture, cohort: string, operationId: string = randomUUID()) {
  const connection = `live-${cohort}`;
  const row = (
    await f.client.query(`SELECT "publicId" FROM provider_connections WHERE id=$1`, [connection])
  ).rows[0];
  const version = ownCredentialVersion("dataforseo", connection, liveCredentialEnvelope);
  if (!version) throw new Error("Fixture credential version unavailable");
  const input: PaidAttemptInput = {
    reservation: {
      operationId,
      scope: {
        namespace: f.namespace,
        principal: "closeout-owner",
        group: cohort,
        connection,
        providerCredentialVersion: version,
      },
      fundingSource: "byok",
      costOwner: "closeout-owner",
      surface: "app",
      source: "app",
      provider: "dataforseo",
      operation: "rank_check",
      estimate: [
        { unit: "cents", value: 2n, scale: 0 },
        { unit: "requests", value: 1n, scale: 0 },
      ],
      reservationTtlMs: 60000,
    },
    context: {
      projectId: cohort,
      connectionId: connection,
      publicConnectionId: String(row?.publicId),
      providerCredentialVersion: version,
      correlationId: `correlation:${operationId}`,
      rankCheckRunId: "run",
    },
  };
  return input;
}

export const admit = (tx: Prisma.TransactionClient, input: PaidAttemptInput) =>
  reservePaidAttempts(tx, [input]);

export async function admitPaid(f: Fixture, cohort: string) {
  const input = await paidInput(f, cohort);
  return f.db.$transaction((tx) => admit(tx, input), { timeout: 30000 });
}

export async function gateLimits(f: Fixture, cohort: string) {
  const rows = (
    await f.client.query(
      `SELECT DISTINCT ON (budget_id) scope_key::jsonb->>'kind' AS kind,body FROM metering_budget
       WHERE budget_id LIKE 'unresolved:%' AND (scope_key::jsonb->>'group'=$1 OR scope_key::jsonb->>'connection'=$2)
       ORDER BY budget_id,version DESC`,
      [cohort, `live-${cohort}`],
    )
  ).rows as { kind: string; body: unknown }[];
  const limit = (kind: string) => {
    const body = rows.find((r) => r.kind === kind)?.body;
    return body === undefined ? "missing" : decode<{ limit: unknown }>(body).limit;
  };
  return { group: limit("group"), connection: limit("connection") };
}

export const unknownOnConnection = (f: Fixture, cohort: string) =>
  f.db.$transaction((tx) =>
    uncertaintyScopeUnknownCount(tx, f.namespace, {
      kind: "connection",
      connection: `live-${cohort}`,
    }),
  );

export async function connectionRow(f: Fixture, cohort: string) {
  return (
    await f.client.query(
      `SELECT c.*,COALESCE((SELECT json_agg(r ORDER BY r.id) FROM provider_connection_rates r WHERE r."connectionId"=c.id),'[]') AS rates
       FROM provider_connections c WHERE c.id=$1`,
      [`live-${cohort}`],
    )
  ).rows;
}

export async function operationState(f: Fixture, operationId: string) {
  return (
    await f.client.query(
      `SELECT o.state,o.version,o.updated_at,(SELECT count(*) FROM metering_receipt r WHERE r.operation_pk=o.operation_pk) AS receipts
       FROM metering_operation o WHERE o.namespace=$1 AND o.operation_id=$2`,
      [f.namespace, operationId],
    )
  ).rows;
}

/** Waits until some backend is blocked on a transaction-scoped advisory lock. */
export async function waitForAdvisoryWaiter(f: Fixture) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const rows = (
      await f.client.query(
        `SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype='advisory' AND NOT granted
         AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`,
      )
    ).rows;
    if (rows[0].waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("No advisory lock waiter observed");
}

async function waitFor(f: Fixture, query: string, failure: string) {
  for (let attempt = 0; attempt < 400; attempt++) {
    if ((await f.client.query(query)).rows[0].count > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(failure);
}

/** Waits until an apply transaction sleeps inside its atomic audit insert. */
export const waitForSleep = (f: Fixture) =>
  waitFor(
    f,
    "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event='PgSleep'",
    "Apply did not reach its atomic audit",
  );

/** Waits until some backend is blocked on a row lock in this database. */
export const waitForRowWaiter = (f: Fixture) =>
  waitFor(
    f,
    `SELECT count(*)::int AS count FROM pg_locks WHERE NOT granted AND locktype IN ('transactionid','tuple')
     AND (database IS NULL OR database=(SELECT oid FROM pg_database WHERE datname=current_database()))
     AND pid IN (SELECT pid FROM pg_stat_activity WHERE datname=current_database())`,
    "No row lock waiter observed",
  );
