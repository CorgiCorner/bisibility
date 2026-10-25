import { checkTimeWhere, parseExactCheckRange } from "@/lib/checks/exact-range";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import {
  cleanRecoveryFixtures,
  recoveryFixture,
} from "@/lib/provider-evidence/recovery/postgres.test-support";
import { checkRunTriggerWhere } from "@/lib/queries/check-run-trigger";
import { deferredGroups, loadCheckRunsSummary } from "@/lib/queries/check-runs-stats";
import { getCheckRunsView } from "@/lib/queries/check-runs-view";
import { afterAll, describe, expect, it, vi } from "vitest";
import { evidenceMatches } from "./model";
import { readCheckEvidence } from "./read";

vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: async (id: string) => ({ project: { id } }),
}));
vi.mock("@/lib/queries/workspace-request-data", () => ({
  getRequestSerpProviderChain: async () => [],
}));

const enabled = !!process.env.PROVIDER_UI_TEST_DATABASE_URL;
describe.skipIf(!enabled)("DM-15/UI-3/UI-4 evidence reads", () => {
  afterAll(async () => {
    await cleanRecoveryFixtures();
    await prisma.$disconnect();
  });
  it("batches evidence, isolates projects, filters and counts without losing a raw deferral", async () => {
    const f = await recoveryFixture();
    await prisma.providerOperationEvidence.create({
      data: {
        operationPk: f.operationPk,
        acceptance: "unconfirmed",
        fulfillment: "partial",
        returnedDepth: 8,
        accounting: "conflict",
        recoveryState: "operator_review",
      },
    });
    await prisma.rankCheck.update({
      where: { id: f.check.id },
      data: { status: "deferred", deferredReason: "future_reason" },
    });
    const values = await readCheckEvidence(f.project.id, { checkIds: [f.check.publicId!] });
    expect(values.get(f.check.publicId!)).toMatchObject({
      result: "partial",
      cost: "conflict",
      returnedDepth: 8,
    });
    expect(evidenceMatches(values.get(f.check.publicId!)!, "partial")).toBe(true);
    expect(await readCheckEvidence("other-project", { checkIds: [f.check.id] })).toEqual(new Map());
    const summary = await loadCheckRunsSummary(
      f.project.id,
      { start: new Date(0), end: f.now },
      Promise.resolve([]),
    );
    expect(summary.evidenceCounts).toMatchObject({ partial: 1, cost_conflict: 1 });
    expect(summary.deferredGroups).toEqual([
      expect.objectContaining({ reason: "other", rawReason: "future_reason", count: 1 }),
    ]);
    const view = await getCheckRunsView(f.project.id, { status: "partial", now: f.now });
    expect(view.rows.map((row) => row.id)).toEqual([f.check.publicId]);
    expect(view.rows[0].evidenceProjection).toMatchObject({ result: "partial", cost: "conflict" });
    expect(view.evidenceCounts?.partial).toBe(1);
    expect(
      (await getCheckRunsView(f.project.id, { status: "recovered", now: f.now })).rows,
    ).toEqual([]);
  });
  it("does not mistake a retained earlier identity for a missing winner", async () => {
    const f = await recoveryFixture();
    await prisma.rankCheck.update({
      where: { id: f.check.id },
      data: {
        status: "completed",
        provider: f.identity.provider,
        attemptCount: 2,
        viaFallback: true,
        position: 4,
      },
    });
    await prisma.providerOperationEvidence.create({
      data: { operationPk: f.operationPk, fulfillment: "complete", accounting: "measured" },
    });
    const evidence = await readCheckEvidence(f.project.id, { checkIds: [f.check.id] });
    expect(evidence.get(f.check.publicId ?? f.check.id)).toMatchObject({
      result: null,
      fulfillment: null,
      cost: "measured",
    });
  });
  it("uses finish time, includes from, excludes to and falls back to checkedAt", async () => {
    const f = await recoveryFixture();
    const start = new Date("2026-10-23T06:00:00Z"),
      end = new Date("2026-10-23T07:00:00Z");
    const where = { AND: [{ keywordId: f.keyword.id }, checkTimeWhere(start, end, true)] };
    await prisma.rankCheck.update({
      where: { id: f.check.id },
      data: { checkedAt: new Date("2026-10-22T06:00:00Z"), finishedAt: start },
    });
    expect(await prisma.rankCheck.count({ where })).toBe(1);
    await prisma.rankCheck.update({ where: { id: f.check.id }, data: { finishedAt: end } });
    expect(await prisma.rankCheck.count({ where })).toBe(0);
    await prisma.rankCheck.update({
      where: { id: f.check.id },
      data: { finishedAt: null, checkedAt: start },
    });
    expect(await prisma.rankCheck.count({ where })).toBe(1);
  });
  it("includes nested retries of api runs and programmatic source runs", async () => {
    const f = await recoveryFixture();
    const parent = await prisma.rankCheckRun.create({
      data: {
        projectId: f.project.id,
        publicId: makePublicId("rcr"),
        trigger: "api",
        source: "app",
        selectionKind: "all",
        selectionHash: "fixture",
        selectionSpec: {},
      },
    });
    const retry = await prisma.rankCheckRun.create({
      data: {
        projectId: f.project.id,
        publicId: makePublicId("rcr"),
        trigger: "retry",
        parentRunId: parent.id,
        selectionKind: "all",
        selectionHash: "fixture",
        selectionSpec: {},
      },
    });
    await prisma.rankCheck.update({
      where: { id: f.check.id },
      data: { runId: retry.id, trigger: "manual" },
    });
    expect(
      await prisma.rankCheck.count({
        where: {
          AND: [
            { keywordId: f.keyword.id },
            await checkRunTriggerWhere(f.project.id, "programmatic"),
          ],
        },
      }),
    ).toBe(1);
    const sdk = await prisma.rankCheckRun.create({
      data: {
        projectId: f.project.id,
        publicId: makePublicId("rcr"),
        trigger: "manual",
        source: "sdk",
        selectionKind: "all",
        selectionHash: "sdk-fixture",
        selectionSpec: {},
      },
    });
    await prisma.rankCheck.update({ where: { id: f.check.id }, data: { runId: sdk.id } });
    expect(
      await prisma.rankCheck.count({
        where: {
          AND: [
            { keywordId: f.keyword.id },
            await checkRunTriggerWhere(f.project.id, "programmatic"),
          ],
        },
      }),
    ).toBe(1);
  });
});
describe("UI-3 range guard", () => {
  it.each([
    [undefined, "bad"],
    ["2026-10-24T00:00:00Z", "2026-10-23T00:00:00Z"],
    ["2026-01-01T00:00:00Z", "2026-10-23T00:00:00Z"],
  ])("rejects invalid/reversed/oversized ranges", (from, to) => {
    expect(parseExactCheckRange(from, to)).toEqual({ range: null, error: "invalidRange" });
  });
  it("keeps every unknown raw reason", () => {
    expect(
      deferredGroups([
        { status: "deferred", deferredReason: "future", checkedAt: new Date(0), keywordId: "k" },
      ]),
    ).toEqual([expect.objectContaining({ reason: "other", rawReason: "future", count: 1 })]);
  });
});
