import { prisma } from "@/lib/db/prisma";
import {
  captureRecoveryCandidate,
  markRecoveryAttemptStopped,
} from "@/lib/provider-evidence/recovery/capture";
import { assertRecoveryFixtureUrl } from "@/lib/provider-evidence/recovery/fixture-url.test-support";
import {
  cleanRecoveryFixtures,
  fixtureNamespace,
  recoveryFixture,
} from "@/lib/provider-evidence/recovery/postgres.test-support";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  changeDimensions,
  enqueueIncident,
  incidentFixture,
  incidentRows,
  resolvedDimensions,
} from "./postgres.test-support";
import { refreshOperationIncident } from "./refresh";

const url = process.env.METERING_TEST_DATABASE_URL;
describe.skipIf(!url)("incidents PostgreSQL", () => {
  beforeEach(() => {
    assertRecoveryFixtureUrl(url);
    vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
    vi.stubEnv("PROVIDER_RECOVERY", "on");
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
  });
  afterEach(async () => {
    await cleanRecoveryFixtures();
    vi.unstubAllEnvs();
  });
  afterAll(() => prisma.$disconnect());

  it("IN-1 concurrent enqueues create one incident and two operation links", async () => {
    const a = await incidentFixture(),
      b = await incidentFixture(a.project.id);
    const rows = await Promise.all([enqueueIncident(a), enqueueIncident(b)]);
    expect(rows[0].id).toBe(rows[1].id);
    expect(await prisma.providerIncident.count({ where: { projectId: a.project.id } })).toBe(1);
    expect(
      await prisma.providerIncidentOperation.count({ where: { incidentId: rows[0].id } }),
    ).toBe(2);
    expect(await prisma.providerIncident.findUnique({ where: { id: rows[0].id } })).toMatchObject({
      state: "open",
      openSlot: "open",
      version: 2,
      resultUnderReviewCount: 2,
      costUnderReviewCount: 2,
    });
    const transitions = await prisma.providerIncidentTransition.findMany({
      where: { incidentId: rows[0].id },
      orderBy: { version: "asc" },
    });
    expect(transitions.map((t) => [t.version, t.kind])).toEqual([
      [1, "linked"],
      [2, "linked"],
    ]);
    expect(transitions[1]?.counts).toMatchObject({
      resultUnderReviewCount: 2,
      addedUnresolvedOperation: true,
    });
    await enqueueIncident(a);
    expect(
      await prisma.providerIncidentTransition.count({ where: { incidentId: rows[0].id } }),
    ).toBe(2);
  });
  it.each([
    ["released", true, "workflow_failed"],
    ["dispatch_intended", false, "workflow_failed"],
    ["dispatch_intended", false, "workflow_cancelled"],
  ] as const)(
    "IN-1 excluded %s fenced=%s stop=%s creates no incident",
    async (state, fenced, stop) => {
      const f = await recoveryFixture({ state, fenced });
      await markRecoveryAttemptStopped(f.check.id, stop);
      expect(await prisma.providerIncident.count({ where: { projectId: f.project.id } })).toBe(0);
      expect(
        await prisma.providerIncidentOperation.count({ where: { operationPk: f.operationPk } }),
      ).toBe(0);
    },
  );
  it("IN-1 accounting-only winner never opens, links or changes an existing incident", async () => {
    const a = await incidentFixture();
    await enqueueIncident(a);
    const f = await recoveryFixture({ completed: true });
    await prisma.keyword.update({ where: { id: f.keyword.id }, data: { projectId: a.project.id } });
    const before = await incidentRows();
    await markRecoveryAttemptStopped(f.check.id, "workflow_completed");
    expect(
      await prisma.providerRecoveryIntent.findFirst({ where: { operationPk: f.operationPk } }),
    ).toMatchObject({ accountingOnly: true });
    expect(await incidentRows()).toEqual(before);
    expect(
      await prisma.providerIncidentOperation.count({ where: { operationPk: f.operationPk } }),
    ).toBe(0);
  });
  it("IN-2 IN-3 one of four stays open; all resolve; new unresolved reopens same row", async () => {
    const first = await incidentFixture();
    const f = [first];
    for (let i = 0; i < 3; i++) f.push(await incidentFixture(first.project.id));
    for (const item of f) await enqueueIncident(item);
    const incident = await enqueueIncident(first);
    await changeDimensions(first.operationPk, resolvedDimensions);
    expect(await prisma.providerIncident.findUnique({ where: { id: incident.id } })).toMatchObject({
      state: "open",
      resultRecoveredCount: 1,
      resultUnderReviewCount: 3,
    });
    for (const item of f.slice(1)) await changeDimensions(item.operationPk, resolvedDimensions);
    expect(await prisma.providerIncident.findUnique({ where: { id: incident.id } })).toMatchObject({
      state: "resolved",
      openSlot: null,
      version: 8,
      resultRecoveredCount: 4,
    });
    const next = await incidentFixture(first.project.id);
    expect(await enqueueIncident(next)).toMatchObject({
      id: incident.id,
      state: "open",
      version: 9,
      resolvedAt: null,
    });
    const kinds = await prisma.providerIncidentTransition.findMany({
      where: { incidentId: incident.id },
      orderBy: { version: "asc" },
    });
    expect(kinds.map((t) => t.kind)).toEqual([
      "linked",
      "linked",
      "linked",
      "linked",
      "count_change",
      "count_change",
      "count_change",
      "resolved",
      "reopened",
    ]);
  });
  it("IN-2 IN-3 finally unknown resolves only with exhaustion and reason, even without count changes", async () => {
    const f = await incidentFixture(),
      incident = await enqueueIncident(f);
    await changeDimensions(f.operationPk, {
      ...resolvedDimensions,
      accounting: "unknown",
      exhaustionStatus: "pending",
      exhaustionReason: null,
    });
    expect(await prisma.providerIncident.findUnique({ where: { id: incident.id } })).toMatchObject({
      state: "open",
    });
    await expect(
      changeDimensions(f.operationPk, { exhaustionStatus: "exhausted", exhaustionReason: null }),
    ).rejects.toThrow();
    expect(
      await prisma.providerIncidentTransition.count({ where: { incidentId: incident.id } }),
    ).toBe(2);
    await changeDimensions(f.operationPk, {
      exhaustionStatus: "exhausted",
      exhaustionReason: "retention_expired",
    });
    expect(await prisma.providerIncident.findUnique({ where: { id: incident.id } })).toMatchObject({
      state: "resolved",
      costUnknownCount: 1,
    });
    await changeDimensions(f.operationPk, { acceptance: "unconfirmed" });
    expect(
      await prisma.providerIncidentTransition.findFirst({
        where: { incidentId: incident.id },
        orderBy: { version: "desc" },
      }),
    ).toMatchObject({ kind: "reopened", version: 4 });
    await changeDimensions(f.operationPk, { acceptance: "rejected" });
    expect(
      await prisma.providerIncidentTransition.findFirst({
        where: { incidentId: incident.id },
        orderBy: { version: "desc" },
      }),
    ).toMatchObject({ kind: "resolved", version: 5 });
  });
  it("IN-3 parallel refreshes write one transition for the change and zero for no-op writes", async () => {
    const f = await incidentFixture(),
      incident = await enqueueIncident(f);
    await Promise.all(
      Array.from({ length: 5 }, () => changeDimensions(f.operationPk, resolvedDimensions)),
    );
    await Promise.all(
      Array.from({ length: 5 }, () =>
        prisma.$transaction((tx) => refreshOperationIncident(tx, f.operationPk)),
      ),
    );
    expect(
      await prisma.providerIncidentTransition.count({ where: { incidentId: incident.id } }),
    ).toBe(2);
    expect(await prisma.providerIncident.findUnique({ where: { id: incident.id } })).toMatchObject({
      version: 2,
    });
  });
  it("IN-3 parallel changes to different operations serialize aggregate snapshots", async () => {
    const a = await incidentFixture(),
      b = await incidentFixture(a.project.id);
    const incident = await enqueueIncident(a);
    await enqueueIncident(b);
    let entered = 0;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    await Promise.all(
      [a, b].map((f) =>
        prisma.$transaction(async (tx) => {
          await tx.providerOperationEvidence.update({
            where: { operationPk: f.operationPk },
            data: resolvedDimensions,
          });
          if (++entered === 2) release();
          await ready;
          await refreshOperationIncident(tx, f.operationPk);
        }),
      ),
    );
    expect(await prisma.providerIncident.findUnique({ where: { id: incident.id } })).toMatchObject({
      state: "resolved",
      resultRecoveredCount: 2,
      resultUnderReviewCount: 0,
      version: 4,
    });
    const transitions = await prisma.providerIncidentTransition.findMany({
      where: { incidentId: incident.id },
      orderBy: { version: "asc" },
    });
    expect(transitions.map((row) => row.version)).toEqual([1, 2, 3, 4]);
    expect(transitions[2]?.counts).toMatchObject({ resultRecoveredCount: 1 });
    expect(transitions[3]?.counts).toMatchObject({ resultRecoveredCount: 2 });
  });
  it("IN-1 promoted accounting-only recovery freezes its previous incident contribution", async () => {
    const f = await incidentFixture();
    await enqueueIncident(f);
    const before = await incidentRows();
    await prisma.rankCheck.update({
      where: { id: f.check.id },
      data: { status: "completed", provider: "fallback" },
    });
    await prisma.$transaction((tx) => captureRecoveryCandidate(tx, f.check.id));
    await changeDimensions(f.operationPk, resolvedDimensions);
    expect(await incidentRows()).toEqual(before);
  });
});
