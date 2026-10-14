import { hostOrganicReportPolicy } from "@/lib/rank-reports/host-policy";
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
const asOf = new Date("2026-10-12T12:00:00Z");
const project = { id: "project", publicId: "prj_aaaaaaaaaaaaaaaaaaaaaaaa" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.candidates.mockResolvedValue({ rows: [] });
  mocks.metadata.mockResolvedValue(new Map());
  mocks.retained.mockResolvedValue([]);
});
it("renews actual caller even with no targets and refuses revocation before reading policies/history", async () => {
  const loadMetadata = vi.fn().mockRejectedValue(new Error("revoked"));
  const options = {
    asOf,
    limits: { maxTargets: 10, maxChecks: 10, maxItems: 10 },
    policyAt: hostOrganicReportPolicy,
    loadMetadata,
  };
  const tx = { location: { findMany: vi.fn() } } as never;
  await expect(
    loadCompetitorCurrentData(tx, { id: "key actor" }, project, options),
  ).rejects.toThrow("revoked");
  expect(loadMetadata).toHaveBeenCalledWith(tx, project, [], asOf);
  expect(mocks.candidates).not.toHaveBeenCalled();
  expect(mocks.retained).not.toHaveBeenCalled();
});
