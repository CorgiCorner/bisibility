import type { EvidenceProjection } from "@/lib/provider-evidence/projection/model";
import { evidenceProjectionResource } from "@/lib/provider-evidence/projection/wire";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rankCheckResources } from "./rank-check-accounting";
import { getProjectRankCheckRun, listProjectRankCheckRuns } from "./rank-check-runs";
import { exportTestContext } from "./rank-history-api-test-fixture";
import type { RankCheckRecord } from "./resources";

const mocks = vi.hoisted(() => ({
  evidence: vi.fn(),
  runsEvidence: vi.fn(),
  readRun: vi.fn(),
  readRuns: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/queries/rank-check-run-reasons", () => ({
  rankRunDeferralReasons: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/provider-evidence/projection/read", () => ({ readCheckEvidence: mocks.evidence }));
vi.mock("@/lib/provider-evidence/projection/read-runs", () => ({
  readRunEvidence: mocks.runsEvidence,
}));
vi.mock("@/lib/queries/rank-check-run-accounting", () => ({
  rankCheckLedgerActuals: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/queries/rank-check-runs", () => ({
  getRankCheckRun: mocks.readRun,
  listRankCheckRuns: mocks.readRuns,
}));
const projection: EvidenceProjection = {
  acceptance: "accepted",
  fulfillment: "partial",
  returnedDepth: 7,
  accounting: "conflict",
  recovery: null,
  result: "partial",
  cost: "conflict",
  originalCheckedAt: "2026-10-23T06:00:00Z",
};
const checkId = "check_aaaaaaaaaaaaaaaaaaaaaaaa",
  runId = "rcr_aaaaaaaaaaaaaaaaaaaaaaaa";
const run = {
  id: runId,
  status: "completed",
  counts: {},
  counts_basis: "run_snapshot",
  finishedAt: null,
  launchedAt: null,
  parentRunId: null,
  usage: null,
  nativeEstimate: null,
};
describe("DM-15 additive REST evidence projections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.evidence.mockResolvedValue(new Map([[checkId, projection]]));
    mocks.runsEvidence.mockResolvedValue(
      new Map([[runId, [{ check_id: checkId, ...evidenceProjectionResource(projection) }]]]),
    );
    mocks.readRun.mockResolvedValue(run);
    mocks.readRuns.mockResolvedValue({ data: [run], nextCursor: null });
  });
  it("includes the projection in a rank-check response independently of accounting totals", async () => {
    const [resource] = await rankCheckResources("project-db", [
      {
        id: "internal-check",
        publicId: checkId,
        provider: "serpapi",
        status: "failed",
        checkedAt: new Date("2026-10-23T06:00:00Z"),
        keyword: { publicId: "kw_aaaaaaaaaaaaaaaaaaaaaaaa" },
        raw: null,
        run: null,
        observationRun: null,
      } as RankCheckRecord,
    ]);
    expect(resource.evidence_projection).toMatchObject({
      result: "partial",
      cost: "conflict",
      returned_depth: 7,
    });
    expect(resource.cost_cents).toBeNull();
  });
  it("includes batched projections in both run list and run detail responses", async () => {
    const ctx = exportTestContext();
    const detail = await (
      await getProjectRankCheckRun(ctx, ctx.auth.project.publicId, runId)
    ).json();
    const list = await (await listProjectRankCheckRuns(ctx, ctx.auth.project.publicId)).json();
    expect(detail.evidence_projections).toEqual([
      { check_id: checkId, ...evidenceProjectionResource(projection) },
    ]);
    expect(list.data[0].evidence_projections).toEqual(detail.evidence_projections);
  });
  it("keeps a legacy rank-check projection null", async () => {
    mocks.evidence.mockResolvedValue(new Map());
    const [resource] = await rankCheckResources("project-db", [
      {
        id: "internal-check",
        publicId: checkId,
        provider: "serpapi",
        status: "failed",
        checkedAt: new Date("2026-10-23T06:00:00Z"),
        keyword: { publicId: "kw_aaaaaaaaaaaaaaaaaaaaaaaa" },
        raw: null,
        run: null,
        observationRun: null,
      } as RankCheckRecord,
    ]);
    expect(resource.evidence_projection).toBeNull();
  });
});
