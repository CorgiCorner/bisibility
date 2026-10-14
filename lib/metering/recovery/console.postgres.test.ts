import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id";
import { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { historicalOperation } from "@/lib/metering/history-mapping";
import { source } from "@/lib/metering/history-test-data";
import { reservePaidAttempts } from "@/lib/metering/paid-admission";
import { nativeReceipt, input as paidInput } from "@/lib/metering/paid-attempt-test-fixture";
import { verifyPaidBinding } from "@/lib/metering/paid-binding";
import {
  fencePaidAttemptsInTransaction,
  markPaidAttemptDispatch,
} from "@/lib/metering/paid-dispatch";
import { settlePaidAttempt } from "@/lib/metering/settlement";
import { importHistoricalEvidence } from "@/lib/metering/store/host-history";
import { reconcileProviderUsage } from "@/lib/provider-usage/reconcile";
import {
  readReconciliationHealth,
  retainRecoveryIncident,
  writeReconciliationHealth,
} from "@/lib/provider-usage/reconciliation-health";
import { planRecoveryNotice } from "@/lib/provider-usage/recovery-notification-policy";
import { launchQueuedRankCheckRuns } from "@/lib/rank-check/planner/queued-launch";
import { rankRecoveryContext } from "@/lib/rank-check/recovery-context";
import { retainRankResult } from "@/lib/rank-check/recovery-evidence";
import { maintainRetainedRankResults } from "@/lib/rank-check/recovery-maintenance";
import { restoreRetainedRankResult } from "@/lib/rank-check/recovery-restore";
import {
  assertRunRecoveryAdmission,
  requestOriginalRunResume,
  retainRunRecoveryGrant,
} from "@/lib/rank-check/recovery-run-grant";
import { persistRankCheck } from "@/lib/rank-check/runner-persistence";
import type { RankCheckRunResult } from "@/lib/rank-check/runner-result";
import { dispatchQueuedRankCheckRunIntents } from "@/lib/temporal/rank-run-intent-dispatch";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { commitRecovery } from "./commands";
import { processRecoveryCommands } from "./execute";
import { previewRecovery } from "./preview";
import { readRecoveryPage, recoveryScope } from "./read";
import { openRecoveryPreview, recoveryInstance, sealRecoveryPreview } from "./tokens";
import { updateRecoveryTriage } from "./triage";

const shared = vi.hoisted(() => ({ db: null as unknown as PrismaClient, actor: "" }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
vi.mock("@/lib/auth/instance-admin", () => ({
  requireInstanceAdmin: async () => ({ user: { id: shared.actor } }),
}));
vi.mock("@/lib/worker-intents/realtime", () => ({
  publishWorkerIntent: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/alerts/evaluate", () => ({
  evaluateKeywordAlerts: vi.fn(async () => [{ id: "alert-fixture" }]),
}));
vi.mock("@/lib/notifications/events", () => ({
  notifyRankCheckCompleted: vi.fn(async () => {}),
  notifyRankCheckFailed: vi.fn(async () => {}),
}));
vi.mock("@/lib/notifications/realtime", () => ({ publishOperationChanged: vi.fn(async () => {}) }));
vi.mock("@/lib/signals/emit", () => ({ emitSignal: vi.fn(async () => {}) }));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: vi.fn(async () => {}) }));
const url = new URL(
  process.env.RECOVERY_TEST_DATABASE_URL ?? process.env.METERING_TEST_DATABASE_URL ?? "",
);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.endsWith("_fixture"))
  throw new Error("Recovery tests require a migrated disposable loopback fixture database.");
shared.db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString(), max: 8 }),
});
const db = shared.db;
let namespace: string, owner: string, project: string, location: string;
beforeEach(async () => {
  namespace = `recovery-${randomUUID()}`;
  owner = randomUUID();
  project = randomUUID();
  location = randomUUID();
  shared.actor = owner;
  vi.stubEnv("DATABASE_URL", url.toString());
  vi.stubEnv("METERING_NAMESPACE", namespace);
  vi.stubEnv("SITE_URL", "https://app.example.com");
  await db.user.create({
    data: {
      id: owner,
      name: "Operator",
      email: `${owner}@example.com`,
      publicId: makePublicId("usr"),
      isInstanceAdmin: true,
    },
  });
  await db.project.create({
    data: {
      id: project,
      name: "Example",
      domain: "example.org",
      ownerId: owner,
      publicId: makePublicId("prj"),
    },
  });
  await db.location.create({
    data: {
      id: location,
      canonicalKey: location,
      kind: "country",
      displayName: "US",
      countryCode: "US",
      gl: "us",
      hl: "en",
      languageCode: "en",
      languageLabel: "English",
      primaryGeoName: "United States",
      secondaryGeoName: "United States",
    },
  });
});
afterEach(async () => {
  await db.meteringRecoveryCommand.deleteMany({ where: { namespace } });
  await db.meteringRecoveryTriage.deleteMany({ where: { namespace } });
  for (const scopeNamespace of [namespace, `${namespace}-other`]) {
    for (const table of [
      "metering_paid_attempt_context",
      "metering_event",
      "metering_history_import",
    ])
      await db.$executeRaw(
        Prisma.sql`DELETE FROM ${Prisma.raw(table)} WHERE namespace=${scopeNamespace}`,
      );
    await db.$executeRaw`DELETE FROM metering_measurement WHERE receipt_pk IN
    (SELECT r.receipt_pk FROM metering_receipt r JOIN metering_operation o ON o.operation_pk=r.operation_pk WHERE o.namespace=${scopeNamespace})`;
    await db.$executeRaw`DELETE FROM metering_receipt WHERE operation_pk IN (SELECT operation_pk FROM metering_operation WHERE namespace=${scopeNamespace})`;
    await db.$executeRaw`DELETE FROM metering_command WHERE operation_pk IN (SELECT operation_pk FROM metering_operation WHERE namespace=${scopeNamespace})`;
    await db.meteringOperation.deleteMany({ where: { namespace: scopeNamespace } });
    await db.$executeRaw`DELETE FROM metering_metadata WHERE key LIKE ${`%${scopeNamespace}%`}`;
  }
  await db.project.delete({ where: { id: project } });
  await db.location.delete({ where: { id: location } });
  await db.user.delete({ where: { id: owner } });
  vi.unstubAllEnvs();
});
afterAll(() => db.$disconnect());
async function readyResult() {
  const keyword = await db.keyword.create({
    data: {
      projectId: project,
      locationId: location,
      location: "US",
      text: randomUUID(),
      publicId: makePublicId("kw"),
    },
  });
  const check = await db.rankCheck.create({
    data: {
      publicId: makePublicId("check"),
      keywordId: keyword.id,
      provider: "dataforseo",
      requestedDepth: 10,
      status: "failed",
    },
  });
  const contextHash = rankRecoveryContext(
    {
      text: keyword.text,
      device: keyword.device,
      domain: "example.org",
      location: { id: location, languageCode: "en" },
      revision: keyword.updatedAt,
    },
    10,
  );
  const result: RankCheckRunResult = {
    recoveryContextHash: contextHash,
    comparisonAllowed: false,
    rankCheck: {
      keywordId: keyword.id,
      provider: "dataforseo",
      checkedAt: new Date("2026-10-01T10:00:00Z"),
      requestedDepth: 10,
      position: 3,
      previousPosition: null,
      rankingUrl: "https://example.org/page",
      normalizationVersion: "v2",
      organicRanks: [{ domain: "example.org", position: 3 }],
      raw: { secretTest: "retained privately" },
      billingUnits: 1,
      costCents: 1.2345,
      estimatedCostCents: null,
    },
    scheduleUpdate: { lastCheckedAt: new Date(), nextCheckAt: null },
  };
  const target = {
    existingRankCheckId: check.id,
    keywordId: keyword.id,
    keywordPublicId: keyword.publicId,
    projectId: project,
    hasDefaults: false,
    hasSchedule: false,
  };
  expect(await retainRankResult(target, result)).toBe(true);
  await db.rankCheckResultEvidence.update({
    where: { rankCheckId: check.id },
    data: { createdAt: new Date(Date.now() - 3 * 60000) },
  });
  return { keyword, check, target, result };
}
async function plan() {
  const page = await readRecoveryPage(owner, {});
  const preview = await previewRecovery({ caseTokens: page.rows.map((row) => row.token) });
  return { page, preview, commandId: randomUUID() };
}
it("lists imported settled unknown accounting and keeps delivered business results independent", async () => {
  const f = await readyResult();
  await db.rankCheck.update({ where: { id: f.check.id }, data: { status: "completed" } });
  const operation = historicalOperation(
    source({
      id: randomUUID(),
      projectId: project,
      feature: "rank_check",
      correlationId: f.check.id,
      measurementStatus: "unknown",
      usageQuantity: null,
      providerRequestId: "native-only-server",
    }),
    namespace,
    new Date().toISOString(),
    { principal: owner },
  );
  await db.$transaction((tx) =>
    importHistoricalEvidence(tx, {
      migrationId: "20261011021000_accounting_history",
      sourceId: randomUUID(),
      sourceHash: "immutable-source",
      operation,
      cutoverAt: new Date().toISOString(),
    }),
  );
  const page = await readRecoveryPage(owner, { category: "accounting" });
  expect(page.summary).toMatchObject({
    unconfirmed: 1,
    historical: 1,
    blockedScopes: { projects: 1, connections: 1 },
  });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({
    accounting: "unknown",
    work: "completed",
    send: "accepted",
    historical: true,
    spendingBlocked: { project: true, connection: true },
  });
  expect(JSON.stringify(page)).not.toContain("native-only-server");
  expect(JSON.stringify(page.rows)).not.toContain(project);
  const notice = (at: Date) =>
    db.$transaction((tx) => planRecoveryNotice(tx, namespace, "overdue", 1, at));
  expect(await notice(new Date())).toMatchObject({ notice: "new" });
  expect(await notice(new Date())).toMatchObject({ notice: null });
  expect(await notice(new Date(Date.now() + 86400001))).toMatchObject({ notice: "digest" });
});
it("previews without writing and joins duplicate commands across competing workers", async () => {
  const f = await readyResult(),
    before = await db.auditLog.count(),
    p = await plan();
  expect(p.preview).toMatchObject({
    providerCalls: 0,
    newPaidAttempts: 0,
    eligible: [{ action: "restore_result" }],
  });
  expect(await db.auditLog.count()).toBe(before);
  expect(await db.meteringRecoveryCommand.count({ where: { namespace } })).toBe(0);
  const input = { previewToken: p.preview.token, commandId: p.commandId };
  const joined = await Promise.all([commitRecovery(input), commitRecovery(input)]);
  expect(joined.map((row) => row.commandId)).toEqual([p.commandId, p.commandId]);
  await Promise.all([
    processRecoveryCommands(db, { namespace }),
    processRecoveryCommands(db, { namespace }),
  ]);
  const check = await db.rankCheck.findUniqueOrThrow({ where: { id: f.check.id } });
  expect(check).toMatchObject({
    status: "completed",
    position: 3,
    costCents: null,
    billingUnits: null,
    checkedAt: new Date("2026-10-01T10:00:00Z"),
  });
  expect(
    await db.auditLog.count({ where: { action: "rank_check.recovered", projectId: project } }),
  ).toBe(1);
  expect(await db.meteringOperation.count({ where: { namespace } })).toBe(0);
  expect(await db.rankCheckResultEvidence.count({ where: { rankCheckId: f.check.id } })).toBe(0);
});
it("joins a previously accepted command after preview expiry but refuses a new expired command", async () => {
  await readyResult();
  const p = await plan();
  await commitRecovery({ previewToken: p.preview.token, commandId: p.commandId });
  const scope = recoveryScope(owner),
    decoded = openRecoveryPreview(p.preview.token, scope, new Date());
  const expired = sealRecoveryPreview(scope, decoded.items, new Date(Date.now() - 6 * 60000));
  expect(
    await commitRecovery({ previewToken: expired.token, commandId: p.commandId }),
  ).toMatchObject({ state: "queued" });
  await expect(
    commitRecovery({ previewToken: expired.token, commandId: randomUUID() }),
  ).rejects.toThrow("preview expired");
  expect(await db.meteringRecoveryCommand.count({ where: { namespace } })).toBe(1);
});
it("rechecks administrator revocation after the durable command was accepted", async () => {
  const f = await readyResult(),
    p = await plan();
  await commitRecovery({ previewToken: p.preview.token, commandId: p.commandId });
  await db.user.update({ where: { id: owner }, data: { isInstanceAdmin: false } });
  await processRecoveryCommands(db, { namespace });
  expect(await db.rankCheck.findUnique({ where: { id: f.check.id } })).toMatchObject({
    status: "failed",
  });
  expect(await db.meteringRecoveryCommand.findFirst({ where: { namespace } })).toMatchObject({
    state: "failed",
    result: [{ status: "skipped", code: "forbidden" }],
  });
});
it("skips a changed case instead of applying an obsolete operator preview", async () => {
  const f = await readyResult(),
    p = await plan();
  await commitRecovery({ previewToken: p.preview.token, commandId: p.commandId });
  await db.rankCheck.update({ where: { id: f.check.id }, data: { status: "deferred" } });
  await processRecoveryCommands(db, { namespace });
  expect(await db.rankCheck.findUnique({ where: { id: f.check.id } })).toMatchObject({
    status: "deferred",
  });
  expect(await db.meteringRecoveryCommand.findFirst({ where: { namespace } })).toMatchObject({
    result: [{ status: "skipped", code: "case_changed" }],
  });
});
it("rejects changed keyword context and never replays a provider call", async () => {
  const f = await readyResult(),
    http = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Provider call forbidden"));
  await db.keyword.update({ where: { id: f.keyword.id }, data: { text: "changed keyword" } });
  expect(
    await db.$transaction((tx) => restoreRetainedRankResult(tx, f.check.id, owner, new Date())),
  ).toBe(false);
  expect(
    await db.rankCheckResultEvidence.findUnique({ where: { rankCheckId: f.check.id } }),
  ).toMatchObject({ blockedCode: "result_context_changed" });
  expect(http).not.toHaveBeenCalled();
  http.mockRestore();
});
it("triage rejects stale versions and does not change financial truth", async () => {
  await readyResult();
  const p = await plan(),
    row = p.page.rows[0];
  const input = {
    caseToken: row.token,
    expectedVersion: row.version,
    status: "waiting_evidence",
    reason: "missing_proof",
    assignToMe: true,
    snoozedUntil: new Date(Date.now() + 3600000).toISOString(),
  };
  await updateRecoveryTriage(input);
  await expect(updateRecoveryTriage(input)).rejects.toThrow("case changed");
  const fresh = await readRecoveryPage(owner, {});
  expect(fresh.rows[0].triage).toMatchObject({ status: "waiting_evidence", assignedToMe: true });
  expect(await db.meteringOperation.count({ where: { namespace } })).toBe(0);
});
it("retains a result across product rollback and removes it with the original keyword", async () => {
  const f = await readyResult();
  await expect(
    db.$transaction(async (tx) => {
      await restoreRetainedRankResult(tx, f.check.id, null, new Date());
      throw new Error("crash before commit");
    }),
  ).rejects.toThrow("crash before commit");
  expect(await db.rankCheck.findUnique({ where: { id: f.check.id } })).toMatchObject({
    status: "failed",
  });
  expect(
    await db.rankCheckResultEvidence.findUnique({ where: { rankCheckId: f.check.id } }),
  ).not.toBeNull();
  await db.keyword.delete({ where: { id: f.keyword.id } });
  expect(
    await db.rankCheckResultEvidence.findUnique({ where: { rankCheckId: f.check.id } }),
  ).toBeNull();
});

async function unstartedRun(
  funding: "own" | "hosted" = "own",
  count = 1,
  customerPrice: string | null = "2",
) {
  const keyword = await db.keyword.create({
    data: {
      projectId: project,
      locationId: location,
      location: "US",
      text: randomUUID(),
      publicId: makePublicId("kw"),
    },
  });
  const keywords = [keyword];
  for (let index = 1; index < count; index++)
    keywords.push(
      await db.keyword.create({
        data: {
          projectId: project,
          locationId: location,
          location: "US",
          text: randomUUID(),
          publicId: makePublicId("kw"),
        },
      }),
    );
  const run = await db.rankCheckRun.create({
    data: {
      publicId: makePublicId("rcr"),
      projectId: project,
      requestedById: owner,
      trigger: "manual",
      source: "app",
      selectionKind: "all",
      selectionSpec: {
        depth: 10,
        ...(funding === "hosted" && customerPrice !== null
          ? {
              rankReservationPrices: Object.fromEntries(
                keywords.map((keyword) => [keyword.id, customerPrice]),
              ),
            }
          : {}),
      },
      selectionHash: "original",
      requestedCount: count,
      orchestrationWorkflowId: `original-${randomUUID()}`,
      createdAt: new Date(Date.now() - 16 * 60000),
    },
  });
  await db.rankCheckRunItem.createMany({
    data: keywords.map((keyword) => ({ runId: run.id, keywordId: keyword.id, status: "queued" })),
  });
  const connection = await db.providerConnection.create({
    data: {
      projectId: project,
      publicId: makePublicId("conn"),
      provider: "dataforseo",
      kind: "serp",
      status: "connected",
      enabled: true,
      credentialSource: funding,
      credentialsEncrypted: "synthetic-envelope",
    },
  });
  await db.$transaction((tx) =>
    retainRunRecoveryGrant(tx, {
      runId: run.id,
      projectId: project,
      actorId: owner,
      source: "app",
      trigger: "manual",
      now: new Date(),
      connectionId: connection.id,
      targets: keywords.map((keyword) => ({ keywordId: keyword.id, depth: 10, cost: 2 })),
    }),
  );
  return { run, keyword, keywords, connection };
}
it("resumes only original unstarted work and preserves the existing workflow identity", async () => {
  const f = await unstartedRun(),
    page = await readRecoveryPage(owner, { category: "unfinished" });
  expect(page.rows.find((row) => row.kind === "run")).toMatchObject({
    action: "resume_queued_run",
    send: "not_started",
  });
  const preview = await previewRecovery({
    caseTokens: page.rows.filter((row) => row.kind === "run").map((row) => row.token),
  });
  expect(preview.originalRuns).toBe(1);
  await commitRecovery({ previewToken: preview.token, commandId: randomUUID() });
  await processRecoveryCommands(db, { namespace });
  expect(await db.rankCheckRun.findUnique({ where: { id: f.run.id } })).toMatchObject({
    status: "queued",
    orchestrationWorkflowId: f.run.orchestrationWorkflowId,
  });
  expect(await db.rankCheck.count({ where: { runId: f.run.id } })).toBe(0);
  expect(
    await db.rankCheckRunRecoveryGrant.findUnique({ where: { runId: f.run.id } }),
  ).toMatchObject({ requestedAt: expect.any(Date) });
  const start = vi.fn(async () => ({ alreadyExists: false }));
  const launch = (input: Parameters<typeof launchQueuedRankCheckRuns>[0]) =>
    launchQueuedRankCheckRuns({ ...input, startRun: start }, db);
  expect(await dispatchQueuedRankCheckRunIntents({ launch })).toMatchObject({
    claimed: 1,
    launched: 1,
  });
  expect(start).toHaveBeenCalledWith({
    runId: f.run.id,
    workflowId: f.run.orchestrationWorkflowId,
  });
  expect(await dispatchQueuedRankCheckRunIntents({ launch })).toMatchObject({
    claimed: 0,
    launched: 0,
  });
  expect(start).toHaveBeenCalledTimes(1);
});
it("rejects transferred ownership both at resume and at later normal admission", async () => {
  const f = await unstartedRun();
  expect(await db.$transaction((tx) => requestOriginalRunResume(tx, f.run.id, new Date()))).toBe(
    true,
  );
  const other = await db.user.create({
    data: {
      name: "New owner",
      email: `${randomUUID()}@example.com`,
      publicId: makePublicId("usr"),
    },
  });
  try {
    await db.project.update({ where: { id: project }, data: { ownerId: other.id } });
    expect(await db.$transaction((tx) => requestOriginalRunResume(tx, f.run.id, new Date()))).toBe(
      false,
    );
    await expect(db.$transaction((tx) => assertRunRecoveryAdmission(tx, f.run.id))).rejects.toThrow(
      "authorization changed",
    );
  } finally {
    await db.project.update({ where: { id: project }, data: { ownerId: owner } });
    await db.user.delete({ where: { id: other.id } });
  }
});
it("expires original consent and refuses already started work", async () => {
  const f = await unstartedRun();
  await db.rankCheckRunRecoveryGrant.update({
    where: { runId: f.run.id },
    data: { validUntil: new Date(Date.now() - 1) },
  });
  expect(await db.$transaction((tx) => requestOriginalRunResume(tx, f.run.id, new Date()))).toBe(
    false,
  );
  await db.rankCheckRunRecoveryGrant.update({
    where: { runId: f.run.id },
    data: { validUntil: new Date(Date.now() + 3600000) },
  });
  await db.rankCheckRun.update({ where: { id: f.run.id }, data: { claimedAt: new Date() } });
  expect(await db.$transaction((tx) => requestOriginalRunResume(tx, f.run.id, new Date()))).toBe(
    false,
  );
});
it("restores measured fractional native costs only from the original ledger", async () => {
  const f = await readyResult(),
    now = new Date();
  const operation = historicalOperation(
    source({
      id: randomUUID(),
      projectId: project,
      feature: "rank_check",
      correlationId: f.check.id,
      keywordId: f.keyword.id,
      costCents: "1.2345",
      usageQuantity: "2.000000",
      measurementStatus: "recorded",
    }),
    namespace,
    now.toISOString(),
    { principal: owner },
  );
  await db.$transaction((tx) =>
    importHistoricalEvidence(tx, {
      migrationId: "20261011021000_accounting_history",
      sourceId: randomUUID(),
      sourceHash: "measured-proof",
      operation,
      cutoverAt: now.toISOString(),
    }),
  );
  expect(await db.$transaction((tx) => restoreRetainedRankResult(tx, f.check.id, null, now))).toBe(
    true,
  );
  const check = await db.rankCheck.findUniqueOrThrow({ where: { id: f.check.id } });
  expect(check.costCents?.toFixed(4)).toBe("1.2345");
  expect(check.billingUnits).toBe(2);
});
it("does not restore a result into deleted run history", async () => {
  const f = await readyResult(),
    run = await unstartedRun();
  await db.rankCheck.update({ where: { id: f.check.id }, data: { runId: run.run.id } });
  await db.rankCheckRun.update({ where: { id: run.run.id }, data: { deletedAt: new Date() } });
  expect(
    await db.$transaction((tx) => restoreRetainedRankResult(tx, f.check.id, null, new Date())),
  ).toBe(false);
  expect(await db.rankCheck.findUnique({ where: { id: f.check.id } })).toMatchObject({
    status: "failed",
  });
});
it("never exposes another instance's retained result as an eligible case", async () => {
  await readyResult();
  vi.stubEnv("SITE_URL", "https://demo.example.com");
  expect((await readRecoveryPage(owner, {})).rows).toHaveLength(0);
});
it("surfaces stale business work with no financial linkage without inventing proof of no-send", async () => {
  const f = await readyResult();
  await db.rankCheckResultEvidence.delete({ where: { rankCheckId: f.check.id } });
  await db.rankCheck.update({
    where: { id: f.check.id },
    data: {
      status: "running",
      updatedAt: new Date(Date.now() - 16 * 60000),
    },
  });
  const page = await readRecoveryPage(owner, { category: "unfinished" });
  expect(page.summary.unfinished).toBe(1);
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({
    kind: "check",
    send: "unknown",
    accounting: "not_applicable",
    action: null,
  });
});

it.each(["keyword", "depth", "credential"])(
  "refuses resumed work after its original %s changes",
  async (change) => {
    const f = await unstartedRun();
    expect(await db.$transaction((tx) => requestOriginalRunResume(tx, f.run.id, new Date()))).toBe(
      true,
    );
    if (change === "keyword")
      await db.keyword.update({ where: { id: f.keyword.id }, data: { text: "changed" } });
    if (change === "depth")
      await db.rankCheckRun.update({
        where: { id: f.run.id },
        data: { selectionSpec: { depth: 100 } },
      });
    if (change === "credential")
      await db.providerConnection.update({
        where: { id: f.connection.id },
        data: { credentialsEncrypted: "changed-envelope" },
      });
    await expect(db.$transaction((tx) => assertRunRecoveryAdmission(tx, f.run.id))).rejects.toThrow(
      "inputs changed",
    );
  },
);

it("caps possible sends per original check and binds the original provider even through a host port", async () => {
  const f = await unstartedRun();
  await db.$transaction((tx) => requestOriginalRunResume(tx, f.run.id, new Date()));
  const check = await db.rankCheck.create({
    data: {
      publicId: makePublicId("check"),
      keywordId: f.keyword.id,
      runId: f.run.id,
      provider: "dataforseo",
      requestedDepth: 10,
      status: "running",
    },
  });
  const approved = await db.$transaction((tx) =>
    assertRunRecoveryAdmission(tx, f.run.id, check.id),
  );
  expect(approved).toMatchObject({ recoveryMaxCostCents: "2" });
  const request = paidInput();
  const context = {
    ...request.context,
    projectId: project,
    connectionId: f.connection.id,
    rankCheckRunId: f.run.id,
    rankCheckId: check.id,
    keywordId: f.keyword.id,
    recoveryGrantExpiresAt: approved.recoveryGrantExpiresAt,
    recoveryMaxCostCents: "2",
  };
  const host = vi.fn(async () => {});
  await expect(
    db.$transaction((tx) =>
      verifyPaidBinding(tx, { ...request.reservation, provider: "different" }, context, {
        verifyBinding: host,
      }),
    ),
  ).rejects.toThrow("provider authorization changed");
  expect(host).not.toHaveBeenCalled();
  const admit = (operationId: string) =>
    db.$transaction(async (tx) => {
      const [reserved] = await reservePaidAttempts(
        tx,
        [
          {
            context,
            reservation: {
              ...request.reservation,
              operationId,
              costOwner: owner,
              scope: {
                ...request.reservation.scope,
                namespace,
                principal: owner,
                group: project,
                connection: f.connection.id,
              },
            },
          },
        ],
        { verifyBinding: host },
      );
      return markPaidAttemptDispatch(tx, reserved, "original-worker", { verifyBinding: host });
    });
  const admitted = await admit("original-send"),
    competing = await admit("competing-send");
  await expect(
    db.$transaction((tx) =>
      fencePaidAttemptsInTransaction(tx, [admitted, competing], { verifyBinding: host }),
    ),
  ).rejects.toThrow("attempt limit");
  const raced = await Promise.allSettled(
    [admitted, competing].map((grant) =>
      db.$transaction((tx) => fencePaidAttemptsInTransaction(tx, [grant], { verifyBinding: host })),
    ),
  );
  expect(raced.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const winner = raced[0].status === "fulfilled" ? "original-send" : "competing-send";
  await expect(
    db.$transaction((tx) => assertRunRecoveryAdmission(tx, f.run.id, check.id)),
  ).rejects.toThrow("attempt limit");
  expect(
    await db.$transaction((tx) => assertRunRecoveryAdmission(tx, f.run.id, check.id, winner)),
  ).toMatchObject({ recoveryMaxCostCents: "2" });
});

it("gives normal live persistence priority over newly captured result evidence", async () => {
  const f = await readyResult();
  await db.rankCheck.update({ where: { id: f.check.id }, data: { status: "running" } });
  await db.rankCheckResultEvidence.update({
    where: { rankCheckId: f.check.id },
    data: { createdAt: new Date() },
  });
  expect((await readRecoveryPage(owner, {})).summary.retainedResults).toBe(0);
  expect(await maintainRetainedRankResults()).toEqual({ restored: 0 });
  expect(
    await db.$transaction((tx) => restoreRetainedRankResult(tx, f.check.id, null, new Date())),
  ).toBe(false);
  const enqueue = vi.fn(async () => {});
  expect(await persistRankCheck(f.target, f.result, { enqueueDeliveries: enqueue })).toMatchObject({
    status: "completed",
    position: 3,
  });
  expect(enqueue).toHaveBeenCalledWith(["alert-fixture"]);
  expect(
    await db.auditLog.count({ where: { action: "rank_check.recovered", projectId: project } }),
  ).toBe(0);
});

it("terminates an unreadable oldest command and continues with valid queued work", async () => {
  const f = await readyResult(),
    badId = randomUUID();
  await db.meteringRecoveryCommand.create({
    data: {
      namespace,
      commandId: badId,
      identityHash: "unreadable",
      actorId: owner,
      action: "repair",
      createdAt: new Date(Date.now() - 60000),
      input: {
        instance: recoveryInstance(),
        items: [{ token: "unreadable-token", version: "old", action: "recover_proof" }],
      },
    },
  });
  const p = await plan();
  await commitRecovery({ previewToken: p.preview.token, commandId: p.commandId });
  await expect(processRecoveryCommands(db, { namespace })).resolves.toMatchObject({
    hasMore: true,
  });
  expect(
    await db.meteringRecoveryCommand.findUnique({
      where: { namespace_commandId: { namespace, commandId: badId } },
    }),
  ).toMatchObject({
    state: "failed",
    result: [{ status: "failed", code: "original_authority_missing" }],
  });
  await processRecoveryCommands(db, { namespace });
  expect(await db.rankCheck.findUnique({ where: { id: f.check.id } })).toMatchObject({
    status: "completed",
  });
});

it.each(["separate", "batch"])(
  "limits a hosted original target across new check rows and namespaces (%s)",
  async (mode) => {
    const f = await unstartedRun("hosted");
    await db.$transaction((tx) => requestOriginalRunResume(tx, f.run.id, new Date()));
    const checks = await Promise.all(
      [0, 1].map((index) =>
        db.rankCheck.create({
          data: {
            publicId: makePublicId("check"),
            keywordId: f.keyword.id,
            runId: f.run.id,
            provider: "dataforseo",
            checkedAt: new Date(Date.now() + index * 1000),
            requestedDepth: 10,
            status: "running",
          },
        }),
      ),
    );
    const approved = await db.$transaction((tx) =>
      assertRunRecoveryAdmission(tx, f.run.id, checks[0].id),
    );
    const host = async () => {};
    const admit = (index: number) =>
      db.$transaction(async (tx) => {
        const check = checks[index],
          seed = paidInput("same-operation", f.connection.id);
        const [reserved] = await reservePaidAttempts(
          tx,
          [
            {
              reservation: {
                ...seed.reservation,
                fundingSource: "platform",
                scope: {
                  ...seed.reservation.scope,
                  namespace: index ? `${namespace}-other` : namespace,
                  principal: owner,
                  group: project,
                  connection: f.connection.id,
                },
              },
              context: {
                ...seed.context,
                projectId: project,
                connectionId: f.connection.id,
                keywordId: f.keyword.id,
                rankCheckRunId: f.run.id,
                rankCheckId: check.id,
                recoveryGrantExpiresAt: approved.recoveryGrantExpiresAt,
                recoveryMaxCostCents: "2",
              },
              platformQuote: {
                estimate: [
                  { unit: "cents", value: 1n, scale: 0 },
                  { unit: "customer_cents", value: 2n, scale: 0 },
                ],
                estimateSource: "list",
                costOwner: "provider-account",
                creditAccountRef: "original-wallet",
                customerPriceVersion: "original-policy",
                platformPools: ["original-pool"],
              },
            },
          ],
          { verifyBinding: host },
        );
        return markPaidAttemptDispatch(tx, reserved, "original-worker", { verifyBinding: host });
      });
    const grants = [await admit(0), await admit(1)];
    if (mode === "batch") {
      await expect(
        db.$transaction((tx) =>
          fencePaidAttemptsInTransaction(tx, grants, { verifyBinding: host }),
        ),
      ).rejects.toThrow("attempt limit");
      const [row] = await db.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*) AS count FROM metering_paid_attempt_context WHERE context->>'rankCheckRunId'=${f.run.id} AND fenced_at IS NOT NULL`;
      expect(row.count).toBe(0n);
      return;
    }
    const results = await Promise.allSettled(
      grants.map((grant) =>
        db.$transaction((tx) =>
          fencePaidAttemptsInTransaction(tx, [grant], { verifyBinding: host }),
        ),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  },
);

it("keeps an admin platform incident through a BYOK scan and does not invent business work from an unlinked correlation", async () => {
  const now = new Date(),
    operation = historicalOperation(
      source({
        id: randomUUID(),
        projectId: project,
        feature: "rank_check",
        credentialSource: "hosted",
        correlationId: "unlinked-native-reference",
        measurementStatus: "unknown",
        costCents: undefined,
      }),
      namespace,
      now.toISOString(),
      { principal: owner },
    );
  await db.$transaction(async (tx) => {
    await importHistoricalEvidence(tx, {
      migrationId: "20261011021000_accounting_history",
      sourceId: randomUUID(),
      sourceHash: "retained-platform-identity",
      operation,
      cutoverAt: now.toISOString(),
    });
    await retainRecoveryIncident(
      tx,
      `authoritative-reconciliation-error:${JSON.stringify([namespace, `o:${operation.operationId}`])}`,
      {
        namespace,
        origin: "admin",
        kind: "operation",
        id: operation.operationId,
        code: "native_identity_conflict",
        failedAt: now.toISOString(),
        scanCutoff: new Date(now.getTime() - 60000).toISOString(),
      },
    );
  });
  expect(await reconcileProviderUsage(db, { namespace })).toMatchObject({
    failed: 1,
    unconfirmed: 1,
  });
  const page = await readRecoveryPage(owner, { category: "failed" });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({
    work: "unknown",
    failure: { code: "native_identity_conflict" },
  });
  expect(page.summary.unfinished).toBe(0);
});

it("preserves authorization for remaining targets after a normal result saves", async () => {
  const f = await unstartedRun("own", 2);
  await db.$transaction((tx) => requestOriginalRunResume(tx, f.run.id, new Date()));
  const checks = await Promise.all(
    f.keywords.map((keyword, index) =>
      db.rankCheck.create({
        data: {
          publicId: makePublicId("check"),
          keywordId: keyword.id,
          runId: f.run.id,
          provider: "dataforseo",
          checkedAt: new Date(Date.now() + index * 1000),
          requestedDepth: 10,
          status: "running",
        },
      }),
    ),
  );
  await db.rankCheckRunItem.updateMany({
    where: { runId: f.run.id, keywordId: f.keyword.id },
    data: { rankCheckId: checks[0].id, status: "running" },
  });
  expect(
    await db.$transaction((tx) => assertRunRecoveryAdmission(tx, f.run.id, checks[0].id)),
  ).toMatchObject({ recoveryMaxCostCents: "2" });
  const sample = await readyResult();
  await persistRankCheck(
    {
      ...sample.target,
      existingRankCheckId: checks[0].id,
      keywordId: f.keyword.id,
      keywordPublicId: f.keyword.publicId,
      connectionId: f.connection.id,
    },
    {
      ...sample.result,
      recoveryContextHash: undefined,
      rankCheck: { ...sample.result.rankCheck, keywordId: f.keyword.id },
    },
    { enqueueDeliveries: vi.fn(async () => {}) },
  );
  expect(
    await db.$transaction((tx) => assertRunRecoveryAdmission(tx, f.run.id, checks[1].id)),
  ).toMatchObject({ recoveryMaxCostCents: "2" });
});

it("retries a command when recording its failure also hits a transient database error", async () => {
  const f = await readyResult(),
    p = await plan();
  await commitRecovery({ previewToken: p.preview.token, commandId: p.commandId });
  let calls = 0;
  const client = new Proxy(db, {
    get(target, property) {
      if (property === "$transaction")
        return (...args: Parameters<PrismaClient["$transaction"]>) => {
          calls++;
          if (calls === 2 || calls === 3)
            throw Object.assign(new Error("fixture transaction timeout"), { code: "P2028" });
          return Reflect.apply(target.$transaction, target, args);
        };
      return Reflect.get(target, property);
    },
  });
  await processRecoveryCommands(client, { namespace });
  expect(
    await db.meteringRecoveryCommand.findUnique({
      where: { namespace_commandId: { namespace, commandId: p.commandId } },
    }),
  ).toMatchObject({ state: "queued", result: [] });
  await processRecoveryCommands(client, { namespace });
  expect(await db.rankCheck.findUnique({ where: { id: f.check.id } })).toMatchObject({
    status: "completed",
  });
});

it("retires an admin platform incident after normal canonical settlement", async () => {
  const seed = paidInput("resolved-hosted", "fixture-connection");
  const host = async () => {};
  const grant = await db.$transaction(async (tx) => {
    const [reserved] = await reservePaidAttempts(
      tx,
      [
        {
          ...seed,
          reservation: {
            ...seed.reservation,
            fundingSource: "platform",
            scope: { ...seed.reservation.scope, namespace, principal: owner, group: project },
          },
          context: { ...seed.context, projectId: project },
          platformQuote: {
            estimate: [
              { unit: "cents", value: 2n, scale: 0 },
              { unit: "customer_cents", value: 3n, scale: 0 },
            ],
            estimateSource: "list",
            costOwner: "provider-account",
            creditAccountRef: "original-wallet",
            customerPriceVersion: "original-policy",
            platformPools: ["original-pool"],
          },
        },
      ],
      { verifyBinding: host },
    );
    const admitted = await markPaidAttemptDispatch(tx, reserved, "original-worker", {
      verifyBinding: host,
    });
    await fencePaidAttemptsInTransaction(tx, [admitted], { verifyBinding: host });
    await retainRecoveryIncident(
      tx,
      `authoritative-reconciliation-error:${JSON.stringify([namespace, `o:${admitted.operation.operationId}`])}`,
      {
        namespace,
        origin: "admin",
        kind: "operation",
        id: admitted.operation.operationId,
        code: "transaction_timeout",
        failedAt: new Date().toISOString(),
        scanCutoff: new Date().toISOString(),
      },
    );
    return admitted;
  });
  expect(await reconcileProviderUsage(db, { namespace })).toMatchObject({
    failed: 1,
    unconfirmed: 1,
  });
  const receipt = {
    ...nativeReceipt(),
    occurredAt: new Date().toISOString(),
    recordedAt: new Date().toISOString(),
  };
  await db.$transaction((tx) =>
    settlePaidAttempt(
      tx,
      {
        namespace,
        principal: owner,
        operationId: grant.operation.operationId,
        expectedVersion: grant.operation.version,
        commandId: "normal-proof",
        authority: { kind: "lease", leaseId: grant.lease.leaseId },
        receipt,
      },
      {
        acknowledgeCharge: async () => ({
          debitId: "original-debit",
          customerCents: { unit: "customer_cents", value: 3n, scale: 0 },
        }),
      },
    ),
  );
  await db.$transaction(async (tx) => {
    await tx.meteringUsageEvidence.create({
      data: {
        id: grant.operation.operationId,
        namespace,
        principal: owner,
        projectId: project,
        connectionId: "fixture-connection",
        provider: "dataforseo",
        feature: "rank_check",
        source: "app",
        correlationId: "original",
        unit: "cents",
        estimate: { cents: "2", units: "1" },
        createdAt: new Date(),
        receiptId: receipt.id,
      },
    });
    await retainRecoveryIncident(
      tx,
      `authoritative-reconciliation-error:${JSON.stringify([namespace, `e:${grant.operation.operationId}`])}`,
      {
        namespace,
        origin: "admin",
        kind: "evidence",
        id: grant.operation.operationId,
        code: "transaction_timeout",
        failedAt: new Date().toISOString(),
        scanCutoff: new Date().toISOString(),
      },
    );
  });
  expect(await reconcileProviderUsage(db, { namespace })).toMatchObject({
    failed: 0,
    unconfirmed: 0,
    lastReconciledAt: expect.any(String),
  });
  const history = await db.$queryRaw<
    { count: bigint }[]
  >`SELECT count(*) AS count FROM metering_metadata WHERE key LIKE 'authoritative-reconciliation-last-error:%' AND value::jsonb->>'namespace'=${namespace}`;
  expect(history[0].count).toBe(2n);
});

it("does not refresh progress when a planned page fails before cursor advancement", async () => {
  const before = new Date(Date.now() - 3600000).toISOString(),
    seed = paidInput("stalled-own", "fixture-connection");
  await db.$transaction(async (tx) => {
    await reservePaidAttempts(
      tx,
      [
        {
          ...seed,
          reservation: {
            ...seed.reservation,
            scope: { ...seed.reservation.scope, namespace, principal: owner, group: project },
          },
          context: { ...seed.context, projectId: project },
        },
      ],
      { verifyBinding: async () => {} },
    );
    await writeReconciliationHealth(tx, namespace, { lastActivityAt: before });
  });
  let calls = 0;
  const client = {
    $transaction: (...args: Parameters<PrismaClient["$transaction"]>) => {
      calls++;
      if (calls > 1)
        throw Object.assign(new Error("fixture transaction timeout"), { code: "P2028" });
      return Reflect.apply(db.$transaction, db, args);
    },
  };
  await expect(reconcileProviderUsage(client as PrismaClient, { namespace })).rejects.toThrow(
    "fixture transaction timeout",
  );
  expect(await db.$transaction((tx) => readReconciliationHealth(tx, namespace))).toMatchObject({
    lastActivityAt: before,
  });
});

it("preserves the frozen hosted customer price rather than the provider estimate", async () => {
  const f = await unstartedRun("hosted", 1, "2.6000");
  await db.$transaction((tx) => requestOriginalRunResume(tx, f.run.id, new Date()));
  const check = await db.rankCheck.create({
    data: {
      publicId: makePublicId("check"),
      keywordId: f.keyword.id,
      runId: f.run.id,
      provider: "dataforseo",
      checkedAt: new Date(),
      requestedDepth: 10,
      status: "running",
    },
  });
  const approved = await db.$transaction((tx) =>
    assertRunRecoveryAdmission(tx, f.run.id, check.id),
  );
  expect(approved.recoveryMaxCostCents).toBe("2.6");
  const seed = paidInput("priced-hosted", f.connection.id);
  const request = {
    reservation: {
      ...seed.reservation,
      fundingSource: "platform" as const,
      scope: {
        ...seed.reservation.scope,
        namespace,
        principal: owner,
        group: project,
        connection: f.connection.id,
      },
    },
    context: {
      ...seed.context,
      projectId: project,
      keywordId: f.keyword.id,
      rankCheckRunId: f.run.id,
      rankCheckId: check.id,
      recoveryGrantExpiresAt: approved.recoveryGrantExpiresAt,
      recoveryMaxCostCents: approved.recoveryMaxCostCents,
    },
    platformQuote: {
      estimate: [
        { unit: "cents", value: 2n, scale: 0 },
        { unit: "customer_cents", value: 26000n, scale: 4 },
      ],
      estimateSource: "list" as const,
      costOwner: "provider-account",
      creditAccountRef: "original-wallet",
      customerPriceVersion: "original-policy",
      platformPools: ["original-pool"],
    },
  };
  await expect(
    db.$transaction((tx) => reservePaidAttempts(tx, [request], { verifyBinding: async () => {} })),
  ).resolves.toHaveLength(1);
});

it("does not preserve hosted recovery consent without the original customer price", async () => {
  const f = await unstartedRun("hosted", 1, null);
  expect(await db.rankCheckRunRecoveryGrant.findUnique({ where: { runId: f.run.id } })).toBeNull();
});
