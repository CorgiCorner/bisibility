import type { Prisma } from "@/lib/generated/prisma/client";
import { recordedMeasurement } from "@/lib/rank-measurements/recorded-check";
import { hostOrganicReportPolicy } from "@/lib/rank-reports/host-policy";
import type { RankReportTarget } from "@/lib/rank-reports/model";
import {
  reportAsOf,
  reportCheck,
  reportKeyword,
  reportProject,
} from "@/lib/rank-reports/report-test-fixture";
import { beforeEach, expect, it, vi } from "vitest";
import { loadCompetitorCurrentData } from "./competitor-current-data";

const mocks = vi.hoisted(() => ({ candidates: vi.fn(), metadata: vi.fn(), retained: vi.fn() }));
vi.mock("./rank-tracker-report-database", () => ({
  loadRankTrackerReportCandidates: mocks.candidates,
}));
vi.mock("./rank-tracker-metadata-batches", () => ({
  loadRankTrackerMetadataBatches: mocks.metadata,
}));
vi.mock("@/lib/rank-reports/database", () => ({ loadRetainedRankReportTargets: mocks.retained }));
const before = new Date("2026-10-05T12:00:00Z");
const currentNotBefore = new Date("2026-10-06T00:00:00Z");
const options = {
  asOf: reportAsOf,
  limits: { maxTargets: 10, maxChecks: 10, maxItems: 10 },
  policyAt: hostOrganicReportPolicy,
  loadMetadata: vi.fn().mockResolvedValue(new Map()),
};
function target(): RankReportTarget {
  const current = reportCheck(2);
  const old = reportCheck(5, {
    id: "check_baseline",
    createdAt: new Date("2026-10-05T11:00:00Z"),
    checkedAt: new Date("2026-10-05T11:00:00Z"),
    observationRun: {
      ...current.observationRun!,
      createdAt: new Date("2026-10-05T11:00:00Z"),
      requestPolicy: {
        evidence: {
          version: 1,
          observedAt: "2026-10-05T11:00:00Z",
          targetRevision: "target-v1",
          policyRevision: "policy-v1",
          completeThrough: { organic_result: 100 },
        },
      },
    },
  });
  return {
    id: reportKeyword,
    volume: 100,
    checks: [current, old],
    expectedScope: recordedMeasurement(current, reportKeyword, reportProject.id).effectiveScope,
    freshForMs: 3 * 3600000,
    baselineWindow: { before, notBefore: new Date("2026-10-05T10:00:00Z") },
  };
}
const tx = {
  location: { findMany: vi.fn().mockResolvedValue([{ id: "loc", regionCode: null }]) },
} as unknown as Prisma.TransactionClient;
const capture = { where: { locationId: "loc", device: "mobile" as const }, currentNotBefore };
const columns = [{ domain: "example.test", kind: "You" as const, label: "You" }];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.metadata.mockResolvedValue(new Map());
  mocks.retained.mockResolvedValue([target()]);
  mocks.candidates.mockResolvedValue({
    rows: [
      {
        id: "keyword-db",
        publicId: reportKeyword,
        text: "keyword",
        device: "mobile",
        locationRef: { id: "loc" },
        tags: [{ tag: { name: "core" } }],
      },
    ],
  });
});
it("retains original current/baseline IDs and uses captured baseline tolerance, not today's freshness", async () => {
  const value = await loadCompetitorCurrentData(
    tx,
    { id: "viewer" },
    reportProject,
    options,
    capture,
  );
  expect(mocks.candidates.mock.calls[0].slice(4)).toEqual([reportAsOf, capture.where]);
  expect(mocks.retained.mock.calls[0][2]).toMatchObject({
    baseline: { mode: "before", before },
    currentNotBefore,
    horizon: 10,
  });
  expect(value.baselineAsOf).toEqual(before);
  expect(value.baselineFor(columns, "loc", "mobile")).toMatchObject({
    comparableIds: [reportKeyword],
    rows: [
      {
        id: reportKeyword,
        volume: 100,
        ranks: { "example.test": 5 },
        quality: { "example.test": { evidence: "positive", freshness: "fresh" } },
      },
    ],
  });
  expect(value.observationsFor(columns, "loc", "mobile")[0].ranks["example.test"]).toBe(2);
});
it("leaves unknown captured baseline tolerance unknown instead of silently using current policy", async () => {
  mocks.retained.mockResolvedValue([{ ...target(), baselineWindow: null }]);
  const value = await loadCompetitorCurrentData(
    tx,
    { id: "viewer" },
    reportProject,
    options,
    capture,
  );
  expect(value.baselineFor(columns, "loc", "mobile")).toMatchObject({
    comparableIds: [],
    rows: [
      {
        ranks: { "example.test": null },
        quality: { "example.test": { evidence: "not_observed" } },
      },
    ],
  });
});
it("rejects a mismatching captured baseline watermark rather than displaying its data under another date", async () => {
  const original = target();
  mocks.retained.mockResolvedValue([
    {
      ...original,
      baselineWindow: {
        ...original.baselineWindow!,
        before: new Date("2026-10-04T12:00:00Z"),
        notBefore: new Date("2026-10-04T10:00:00Z"),
      },
    },
  ]);
  const value = await loadCompetitorCurrentData(
    tx,
    { id: "viewer" },
    reportProject,
    options,
    capture,
  );
  expect(() => value.baselineFor(columns, "loc", "mobile")).toThrow("snapshot");
});
it("preserves current-only policy for all pre-existing consumers", async () => {
  await loadCompetitorCurrentData(tx, { id: "viewer" }, reportProject, options);
  expect(mocks.retained.mock.calls[0][2]).toMatchObject({ baseline: { mode: "none" } });
});
