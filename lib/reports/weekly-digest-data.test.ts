import { beforeEach, describe, expect, it, vi } from "vitest";
import { hostOrganicReportPolicy } from "@/lib/rank-reports/host-policy";
import { collectWeeklyDigestData } from "./weekly-digest-data";
const mocks = vi.hoisted(() => ({ project: vi.fn(), candidates: vi.fn(), metadata: vi.fn(), retained: vi.fn(), scope: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/queries/rank-tracker-report-database", () => ({ loadRankTrackerReportCandidates: mocks.candidates }));
vi.mock("@/lib/queries/rank-tracker-metadata-batches", () => ({ loadRankTrackerMetadataBatches: mocks.metadata }));
vi.mock("@/lib/rank-reports/database", () => ({ loadRetainedRankReportTargets: mocks.retained }));
vi.mock("@/lib/queries/consumer-report-options", () => ({ consumerReportOptions: (_at: Date, scope: unknown) => {
  mocks.scope(scope); return { asOf: _at, limits: {}, policyAt: hostOrganicReportPolicy, loadMetadata: vi.fn() };
} }));
const now = new Date("2026-10-12T12:00:00Z");
const project = { id: "internal", publicId: "public", domain: "example.test", name: "Example" };
describe("weekly digest authority read", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.project.mockResolvedValue(project);
    mocks.transaction.mockImplementation((run) => run({ project: { findFirst: mocks.project } }));
    mocks.candidates.mockResolvedValue({ rows: [{ id: "keyword", publicId: "kw_public", text: "keyword", createdAt: new Date(0) }] });
    mocks.metadata.mockResolvedValue(new Map()); mocks.retained.mockResolvedValue([]);
  });
  it("uses one repeatable-read snapshot, explicit retained pause membership and bounded shared loader", async () => {
    expect(await collectWeeklyDigestData("public", now)).toBeNull();
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead" });
    expect(mocks.candidates).toHaveBeenCalledWith(expect.anything(), "internal", {}, "include_retained");
    expect(mocks.retained).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ project, keywords: expect.any(Array) }), expect.objectContaining({ currentNotBefore: new Date("2026-10-05T12:00:00Z") }), {}, expect.any(Map), false);
  });
  it("renews exact service project identity and refuses disappearance without synthetic actor", async () => {
    await collectWeeklyDigestData("public", now);
    const check = mocks.scope.mock.calls[0][0];
    await expect(check({ project: { findFirst: vi.fn().mockResolvedValue(null) } }, project, [])).rejects.toThrow("unavailable");
    await expect(check({ project: { findFirst: mocks.project } }, { ...project, id: "foreign" }, [])).rejects.toThrow("unavailable");
  });
  it("returns no report for a missing project and performs no history read", async () => {
    mocks.project.mockResolvedValue(null); expect(await collectWeeklyDigestData("public", now)).toBeNull();
    expect(mocks.retained).not.toHaveBeenCalled();
  });
});
