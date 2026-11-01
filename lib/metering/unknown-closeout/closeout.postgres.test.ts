import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { assertConnectionRecoveryAdmission } from "@/lib/integrations/provider-recovery/admission";
import { readConnectionRecovery } from "@/lib/integrations/provider-recovery/read";
import { readRecoveryPage } from "@/lib/metering/recovery/read";
import { key } from "@/lib/metering/store/codec";
import { aggregateIncident } from "@/lib/provider-evidence/incidents/dimensions";
import { captureRecoveryCandidate } from "@/lib/provider-evidence/recovery/capture";
import { enqueueWaitingRecovery } from "@/lib/provider-evidence/recovery/enqueue";
import { historicalRecoveryPage } from "@/lib/provider-evidence/recovery/historical-page";
import { claimRecoveryIntent } from "@/lib/provider-evidence/recovery/lease";
import { providerRecoveryScope } from "@/lib/provider-evidence/recovery/scope";
import {
  actionableUnknownAccounting,
  finalReceiptJoin,
  reconciliationHealth,
  unknownAccounting,
} from "@/lib/provider-usage/reconcile-state";
import { closedUnknownOperations } from "@/lib/provider-usage/uncertainty-closeout-state";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { now, unknownFixture } from "./postgres.test-fixture";
import { previewUnknownCloseout } from "./service";

const shared = vi.hoisted(() => ({ db: null as unknown as PrismaClient, namespace: "" }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => shared.namespace }));
let f: Awaited<ReturnType<typeof unknownFixture>>;
beforeAll(async () => {
  vi.stubEnv("PROVIDER_RECOVERY", "on");
  vi.stubEnv("PROVIDER_RECOVERY_DIGEST", "off");
  f = await unknownFixture();
  shared.db = f.db;
  shared.namespace = f.namespace;
}, 60000);
afterAll(async () => {
  if (f) await f.close();
});

it("closes only attention, preserves raw accounting and budget exposure, audits and replays", async () => {
  const n = await f.native();
  const pk = key(f.namespace, n.id);
  const before = await f.store.getOperation({
    namespace: f.namespace,
    principal: "closeout-owner",
    operationId: n.id,
  });
  const usage = (
    await f.client.query("SELECT * FROM metering_budget_usage ORDER BY namespace,budget_id,epoch")
  ).rows;
  expect(usage.some((row) => Number(row.outstanding_value) > 0)).toBe(true);
  const candidate = await f.db.providerRecoveryCandidate.create({
    data: {
      ...providerRecoveryScope(),
      operationPk: pk,
      attemptId: n.operation.lease!.leaseId,
      rankCheckId: n.check.id,
      queuedTaskId: n.task.id,
    },
  });
  const intent = await f.db.providerRecoveryIntent.create({
    data: { candidateId: candidate.id, operationPk: pk, attemptId: candidate.attemptId },
  });
  await f.db.providerOperationEvidence.create({
    data: {
      operationPk: pk,
      acceptance: "unconfirmed",
      fulfillment: "absent",
      accounting: "unknown",
      recoveryState: "scheduled",
    },
  });
  const incident = await f.db.providerIncident.create({
    data: { projectId: "liveowner", cause: "fixture_native_unconfirmed" },
  });
  await f.db.providerIncidentOperation.create({
    data: { incidentId: incident.id, operationPk: pk },
  });
  const plan = await f.preview(n.manifest);
  expect(plan).toMatchObject({
    count: 1,
    cost: "unknown",
    providerCalls: 0,
    paidReplay: false,
    replayed: false,
  });
  expect(await f.apply(n.manifest, plan.planHash)).toMatchObject({
    closed: 1,
    replayed: false,
    cost: "unknown",
  });
  expect(await f.apply(n.manifest, plan.planHash)).toMatchObject({ closed: 1, replayed: true });
  expect(
    await f.store.getOperation({
      namespace: f.namespace,
      principal: "closeout-owner",
      operationId: n.id,
    }),
  ).toEqual(before);
  expect(
    (await f.client.query("SELECT * FROM metering_budget_usage ORDER BY namespace,budget_id,epoch"))
      .rows,
  ).toEqual(usage);
  const [raw] = await f.db.$queryRaw<
    { raw: boolean; active: boolean }[]
  >`SELECT ${unknownAccounting} AS raw,${actionableUnknownAccounting} AS active FROM metering_operation o ${finalReceiptJoin} WHERE o.operation_pk=${pk}`;
  expect(raw).toEqual({ raw: true, active: false });
  expect(await closedUnknownOperations(f.db, [pk])).toEqual(new Set([pk]));
  expect(await f.db.providerIncident.findUnique({ where: { id: incident.id } })).toMatchObject({
    state: "resolved",
    resultRecoveredCount: 0,
    costMeasuredCount: 0,
    costUnknownCount: 1,
    resultMissingCount: 1,
  });
  expect(await claimRecoveryIntent(intent.id)).toBeNull();
  await f.db.providerRecoveryIntent.update({
    where: { id: intent.id },
    data: { state: "scheduled" },
  });
  expect(await claimRecoveryIntent(intent.id)).toBeNull();
  await f.db.$transaction(async (tx) => {
    await captureRecoveryCandidate(tx, n.check.id, {}, now);
    expect(await enqueueWaitingRecovery(tx, n.check.id, now)).toBe(0);
  });
  expect(
    await f.db.providerOperationEvidence.findUnique({ where: { operationPk: pk } }),
  ).toMatchObject({
    acceptance: "unconfirmed",
    fulfillment: "absent",
    accounting: "unknown",
    exhaustionReason: "operator_closed_cost_unknown",
  });
  const audit = await f.db.auditLog.findFirst({
    where: { action: "instance_admin.metering_cost_unknown_closed" },
    orderBy: { createdAt: "desc" },
  });
  expect(audit?.after).toMatchObject({
    cost: "unknown",
    count: 1,
    planHash: plan.planHash,
    evidenceRef: n.manifest.evidenceRef,
    reason: n.manifest.reason,
  });
  await expect(
    f.client.query("DELETE FROM metering_unknown_closeout WHERE operation_pk=$1", [pk]),
  ).rejects.toThrow(/immutable/);
  expect(
    (await f.db.$transaction((tx) => reconciliationHealth(tx, f.namespace, now))).unconfirmed,
  ).toBe(0);
  expect(
    (await readRecoveryPage("closeout-owner", { category: "closed_unknown" }, now)).rows,
  ).toEqual([
    expect.objectContaining({
      closedUnknown: true,
      accounting: "unknown",
      work: "stopped",
      action: null,
    }),
  ]);
  expect(
    (await readRecoveryPage("closeout-owner", {}, now)).rows.some((r) => r.closedUnknown),
  ).toBe(false);
  const view = await readConnectionRecovery("liveowner", f.connection, now);
  expect(view).toMatchObject({
    paused: true,
    affectedChecks: 0,
    unconfirmedRequests: 0,
    state: "review",
  });
  await expect(
    f.db.$transaction((tx) => assertConnectionRecoveryAdmission(tx, n.request, f.version, now)),
  ).rejects.toThrow();
  await f.db.providerConnectionRecovery.update({
    where: { connectionId: f.connection },
    data: { accountState: "verified", probeId: "fixture-positive-free-check" },
  });
  await expect(
    f.db.$transaction((tx) => assertConnectionRecoveryAdmission(tx, n.request, f.version, now)),
  ).resolves.toBeUndefined();
  expect(await readConnectionRecovery("liveowner", f.connection, now)).toMatchObject({
    state: "ready",
    paused: false,
    unconfirmedRequests: 0,
  });
  const page = await f.db.$transaction((tx) =>
    historicalRecoveryPage(
      tx,
      { version: 1, cutoff: now.toISOString(), complete: false, nextScanAt: null, after: null },
      100,
    ),
  );
  expect(page.some((r) => r.operationPk === pk)).toBe(false);
  const next = await f.native();
  expect(
    (await f.db.$transaction((tx) => reconciliationHealth(tx, f.namespace, now))).unconfirmed,
  ).toBe(1);
  await f.client.query("UPDATE metering_operation SET version=version+1 WHERE operation_pk=$1", [
    pk,
  ]);
  expect(await closedUnknownOperations(f.db, [pk])).toEqual(new Set());
  expect(
    (await f.db.$transaction((tx) => reconciliationHealth(tx, f.namespace, now))).unconfirmed,
  ).toBe(2);
  expect(next.id).not.toBe(n.id);
});

it("rejects changed hash/version, missing admin, hosted funding, changed credential and live task lease atomically", async () => {
  const n = await f.native();
  const plan = await f.preview(n.manifest);
  await expect(f.apply(n.manifest, "0".repeat(64))).rejects.toThrow(/changed/);
  await expect(f.preview({ ...n.manifest, operator: "usr_missing" })).rejects.toThrow(
    /administrator/,
  );
  await expect(
    f.preview({ ...n.manifest, operations: [{ operationId: n.id, expectedVersion: 99 }] }),
  ).rejects.toThrow(/qualify/);
  await f.client.query(
    `UPDATE metering_operation SET input=jsonb_set(input,'{fundingSource}','"platform"') WHERE operation_pk=$1`,
    [key(f.namespace, n.id)],
  );
  await expect(f.preview(n.manifest)).rejects.toThrow(/qualify/);
  await f.client.query(
    `UPDATE metering_operation SET input=jsonb_set(input,'{fundingSource}','"byok"') WHERE operation_pk=$1`,
    [key(f.namespace, n.id)],
  );
  await f.db.queuedRankCheckTask.update({
    where: { id: n.task.id },
    data: { persistenceLeaseExpiresAt: new Date(now.getTime() + 60000) },
  });
  await expect(f.preview(n.manifest)).rejects.toThrow(/qualify/);
  await f.db.queuedRankCheckTask.update({
    where: { id: n.task.id },
    data: { persistenceLeaseExpiresAt: null },
  });
  await f.db.providerConnection.update({
    where: { id: f.connection },
    data: { credentialsEncrypted: "changed-envelope" },
  });
  await expect(f.apply(n.manifest, plan.planHash)).rejects.toThrow(/account changed/);
  expect(await f.db.meteringUnknownCloseout.count({ where: { operationId: n.id } })).toBe(0);
  await f.db.providerConnection.update({
    where: { id: f.connection },
    data: { credentialsEncrypted: "sealed-fixture-envelope" },
  });
  await expect(
    f.db.$transaction((tx) => previewUnknownCloseout(tx, n.manifest, now)),
  ).rejects.toThrow(/read-only/);
});

it("excludes terminal history from unfinished work while preserving genuinely stalled checks", async () => {
  await f.db.rankCheck.createMany({
    data: Array.from({ length: 1000 }, (_, i) => ({
      publicId: makePublicId("check"),
      keywordId: f.keyword.id,
      checkedAt: new Date(now.getTime() - i),
      provider: "dataforseo",
      status: i === 999 ? "running" : i % 2 ? "deferred" : "failed",
      updatedAt: new Date(now.getTime() - 3600000),
    })),
  });
  const page = await readRecoveryPage("closeout-owner", { category: "unfinished" }, now);
  expect(page.summary.unfinished).toBe(1);
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0].work).toBe("unfinished");
});
it("never describes operator closure as a recovered result or measured money", () => {
  expect(
    aggregateIncident([
      {
        acceptance: "unconfirmed",
        fulfillment: "absent",
        accounting: "unknown",
        exhaustionStatus: "exhausted",
        exhaustionReason: "operator_closed_cost_unknown",
        operatorClosedUnknown: true,
      },
    ]),
  ).toMatchObject({
    resolved: true,
    counts: {
      resultMissingCount: 1,
      resultRecoveredCount: 0,
      costUnknownCount: 1,
      costMeasuredCount: 0,
    },
  });
});
