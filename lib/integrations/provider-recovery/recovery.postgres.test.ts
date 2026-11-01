import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  closeoutPostgresFixture,
  liveCredentialEnvelope,
} from "@/lib/metering/history-closeout/postgres.test-fixture";
import { input } from "@/lib/metering/paid-attempt-test-fixture";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { recordConnectionAccountFailure } from "./account-failure";
import { assertConnectionRecoveryAdmission } from "./admission";
import { readAffectedChecks } from "./checks";
import { recordConnectionPaymentFailure } from "./payment-failure";
import { readConnectionRecovery } from "./read";

const shared = vi.hoisted(() => ({ db: null as unknown as PrismaClient, namespace: "default" }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => shared.namespace }));
let f: Awaited<ReturnType<typeof closeoutPostgresFixture>>;
const now = new Date("2026-10-28T14:00:00Z");
const connectionId = "live-liveowner";
const version = ownCredentialVersion("dataforseo", connectionId, liveCredentialEnvelope);
const request = input("next", connectionId).reservation;
request.scope.group = "liveowner";
beforeAll(async () => {
  f = await closeoutPostgresFixture({ live: true, schemaOnly: true });
  shared.db = f.db;
  shared.namespace = f.namespace;
  request.scope.namespace = f.namespace;
  const location = await f.db.location.create({
    data: {
      kind: "country",
      displayName: "US",
      countryCode: "US",
      gl: "us",
      hl: "en",
      languageCode: "en",
      languageLabel: "English",
      primaryGeoName: "United States",
      secondaryGeoName: "US",
      canonicalKey: "recovery-test",
    },
  });
  await f.db.keyword.create({
    data: {
      id: "recovery-keyword",
      publicId: makePublicId("kw"),
      projectId: "liveowner",
      text: "recovery keyword",
      location: "US",
      locationId: location.id,
    },
  });
  await f.db.rankCheck.createMany({
    data: Array.from({ length: 1001 }, (_, i) => ({
      id: `recovery-check-${i}`,
      publicId: makePublicId("check"),
      keywordId: "recovery-keyword",
      checkedAt: new Date(now.getTime() - 3600000 - i),
      provider: "dataforseo",
      status: "deferred",
    })),
  });
  // Synthetic query fixtures, including a very recent still-running operation. No provider transport.
  await f.client.query(
    `INSERT INTO metering_operation
    (operation_pk,namespace,principal,operation_id,state,version,semantic_hash,budget_epochs,reservation_expires_at,created_at,updated_at,input,warnings)
    SELECT jsonb_build_array($1::text,'recovery-op-'||i)::text,$1,'closeout-owner','recovery-op-'||i,'dispatch_intended',2,'query-fixture','[]',
      $2::timestamptz, $2::timestamptz-CASE WHEN i=1000 THEN interval '1 minute' ELSE interval '1 hour' END,$2::timestamptz,
      jsonb_build_object('provider','dataforseo','operation','rank_check','fundingSource','byok','scope',jsonb_build_object('namespace',$1::text,'group','liveowner','connection',$3::text),'correlationId','query-'||i),'[]'
    FROM generate_series(0,1000) i`,
    [f.namespace, now, connectionId],
  );
  await f.client.query(
    `INSERT INTO metering_paid_attempt_context(namespace,operation_id,principal,context)
    SELECT $1,'recovery-op-'||i,'closeout-owner',jsonb_build_object('rankCheckId','recovery-check-'||i) FROM generate_series(0,1000) i`,
    [f.namespace],
  );
}, 60000);
afterAll(async () => {
  if (f) await f.close();
});

it("paginates all 1000 overdue checks, excludes normal in-flight work and keeps foreign projects isolated", async () => {
  const ids = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page = await readAffectedChecks("liveowner", connectionId, cursor, now);
    expect(page.total).toBe(1000);
    expect(page.rows).toHaveLength(50);
    for (const row of page.rows) {
      expect(ids.has(row.id)).toBe(false);
      ids.add(row.id);
    }
    cursor = page.nextCursor;
    pages++;
  } while (cursor && pages < 21);
  expect(pages).toBe(20);
  expect(ids.size).toBe(1000);
  expect(cursor).toBeNull();
  expect(await readAffectedChecks("other-project", connectionId, null, now)).toEqual({
    rows: [],
    total: 0,
    nextCursor: null,
  });
  expect(await readConnectionRecovery("liveowner", connectionId, now)).toMatchObject({
    affectedChecks: 1000,
    unconfirmedRequests: 1000,
    paused: true,
    state: "review",
    accountVerified: false,
  });
}, 20000);

it("blocks overdue uncertainty only for its connection; a successful account check cannot settle it", async () => {
  const guard = (connection: string, at = now) =>
    f.db.$transaction((tx) =>
      assertConnectionRecoveryAdmission(
        tx,
        { ...request, scope: { ...request.scope, connection } },
        version,
        at,
      ),
    );
  await expect(guard(connectionId)).rejects.toThrow("Reconcile the request before retrying");
  await expect(guard(connectionId)).rejects.toMatchObject({
    reason: "accounting_review",
    phase: "admission",
  });
  await expect(guard("unrelated")).resolves.toBeUndefined();
  await expect(guard(connectionId, new Date(now.getTime() - 3600000))).resolves.toBeUndefined();
  await f.db.providerConnectionRecovery.create({
    data: { connectionId, credentialVersion: version ?? "", accountState: "verified" },
  });
  await expect(guard(connectionId)).rejects.toThrow("Reconcile the request before retrying");
  expect(await readConnectionRecovery("liveowner", connectionId, now)).toMatchObject({
    accountVerified: true,
    state: "review",
    paused: true,
  });
});

it("retains a payment pause after all previous requests are measured and ignores a foreign credential version", async () => {
  await f.db.providerConnectionRecovery.update({
    where: { connectionId },
    data: { accountState: "payment_required" },
  });
  const early = new Date(now.getTime() - 3600000);
  await expect(
    f.db.$transaction((tx) => assertConnectionRecoveryAdmission(tx, request, version, early)),
  ).rejects.toMatchObject({ reason: "account_blocked", phase: "admission" });
  await expect(
    f.db.$transaction((tx) =>
      assertConnectionRecoveryAdmission(tx, request, "another-version", early),
    ),
  ).resolves.toBeUndefined();
});

it("a real payment refusal immediately blocks transport and cannot pause a replaced credential", async () => {
  await f.db.providerConnectionRecovery.update({
    where: { connectionId },
    data: { accountState: "verified", probeId: "older-account-probe" },
  });
  expect(
    await recordConnectionPaymentFailure({
      connectionId,
      projectId: "liveowner",
      credentialVersion: "foreign-version",
    }),
  ).toBe(false);
  expect(
    (await f.db.providerConnectionRecovery.findUniqueOrThrow({ where: { connectionId } }))
      .accountState,
  ).toBe("verified");
  expect(
    await recordConnectionPaymentFailure({
      connectionId,
      projectId: "liveowner",
      credentialVersion: version,
    }),
  ).toBe(true);
  const account = await f.db.providerConnectionRecovery.findUniqueOrThrow({
    where: { connectionId },
  });
  expect(account).toMatchObject({ accountState: "payment_required", probeId: null });
  const early = new Date(now.getTime() - 3600000);
  await expect(
    f.db.$transaction((tx) => assertConnectionRecoveryAdmission(tx, request, version, early)),
  ).rejects.toThrow("Reconcile");
  const audit = await f.db.auditLog.findFirst({
    where: { action: "provider.payment_required", projectId: "liveowner" },
    select: { after: true },
  });
  expect(audit?.after).toMatchObject({
    httpStatus: 402,
    originalCostConfirmed: false,
    paidTransportPaused: true,
  });
});

it("retains incident history and rejects evidence from a stale credential", async () => {
  const fact = { kind: "failure", code: "provider_billing", scope: { kind: "account" } } as const;
  const record = (credentialVersion: string | null) =>
    recordConnectionAccountFailure({
      connectionId,
      projectId: "liveowner",
      provider: "dataforseo",
      credentialVersion,
      fact,
    });
  expect(await record("stale-credential")).toBe(false);
  expect(await record(version)).toBe(true);
  const first = await f.db.providerConnectionRecovery.findUniqueOrThrow({
    where: { connectionId },
  });
  expect(first.currentIncidentId).not.toBeNull();
  expect(await record(version)).toBe(true);
  const repeated = await f.db.providerConnectionRecovery.findUniqueOrThrow({
    where: { connectionId },
  });
  expect(repeated.currentIncidentId).toBe(first.currentIncidentId);
  await f.db.providerAccountIncident.update({
    where: { id: first.currentIncidentId! },
    data: { resolvedAt: new Date() },
  });
  await f.db.providerConnectionRecovery.update({
    where: { connectionId },
    data: { accountState: "verified" },
  });
  expect(await record(version)).toBe(true);
  const next = await f.db.providerConnectionRecovery.findUniqueOrThrow({ where: { connectionId } });
  expect(next.currentIncidentId).not.toBe(first.currentIncidentId);
  expect(await f.db.providerAccountIncident.count({ where: { connectionId } })).toBe(2);
});

it("deduplicates a refusal identity while keeping checks in the same batch distinct", async () => {
  const recovery = await f.db.providerConnectionRecovery.findUniqueOrThrow({
    where: { connectionId },
  });
  const incidentId = recovery.currentIncidentId;
  expect(incidentId).not.toBeNull();
  if (!incidentId || !version) throw new Error("Missing account incident fixture");
  const attempt = {
    connectionId,
    incidentId,
    refusalKey: incidentId,
    credentialVersion: version,
    reason: "account_blocked",
    transportPhase: "not_sent",
  };
  await f.db.providerBlockedAttempt.createMany({
    data: [
      { ...attempt, rankCheckId: "recovery-check-0" },
      { ...attempt, rankCheckId: "recovery-check-0" },
      { ...attempt, rankCheckId: "recovery-check-1" },
    ],
    skipDuplicates: true,
  });
  expect(await f.db.providerBlockedAttempt.count({ where: { incidentId } })).toBe(2);
});

it("keeps legacy unknown recovery rows blocked without an incident", async () => {
  await f.db.providerConnectionRecovery.update({
    where: { connectionId },
    data: { accountState: "unknown", currentIncidentId: null },
  });
  const early = new Date(now.getTime() - 3600000);
  await expect(
    f.db.$transaction((tx) => assertConnectionRecoveryAdmission(tx, request, version, early)),
  ).rejects.toMatchObject({ reason: "account_blocked", phase: "admission" });
});
