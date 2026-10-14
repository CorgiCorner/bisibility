import type { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  legacyAsOf,
  legacyDbCheck,
  legacyKeyword,
  legacyProject,
  legacyReportOptions,
} from "./legacy-dashboard.test-fixture";
import { readLegacyOverviewQuality } from "./legacy-overview-quality";
import { legacyMarketTopThree } from "./project-market-quality";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
const m = { count: vi.fn(), checks: vi.fn(), itemCount: vi.fn() };
const db = {
  rankCheck: { count: m.count, findMany: m.checks },
  observationItem: { count: m.itemCount },
} as unknown as Prisma.TransactionClient;
const scope = { project: legacyProject, actor: { id: "owned-fixture-user" } };
const keywords = [legacyKeyword(0), legacyKeyword(1)];
beforeEach(() => {
  vi.clearAllMocks();
  m.count.mockResolvedValue(2);
  m.itemCount.mockResolvedValue(0);
});
async function read(changes: Parameters<typeof legacyReportOptions>[2] = {}) {
  return readLegacyOverviewQuality(db, scope, keywords, {
    now: legacyAsOf,
    horizon: 3,
    report: legacyReportOptions(legacyAsOf, legacyProject.id, changes),
  });
}
describe("legacy full-cohort Top3 reuses retained report authority", () => {
  it("preserves unweighted Top3 instead of CTR/volume weights, and retains positive versus proved absence", async () => {
    m.checks.mockResolvedValue([
      legacyDbCheck(keywords[0], 1),
      legacyDbCheck(keywords[1], null, 1),
    ]);
    const result = await read();
    expect(
      legacyMarketTopThree(
        keywords.map((row) => row.publicId),
        result.resolutions,
      ),
    ).toEqual({ topThreeCount: 1, currentVisibility: 50 });
    expect(result.policy.metric).toEqual(legacyReportOptions().policyAt(legacyAsOf).metric);
    expect(m.checks.mock.calls[0][0].where.keyword).toEqual({ projectId: legacyProject.id });
  });
  it("retains the current observation after a newer failed execution without making failure a measurement", async () => {
    m.count.mockResolvedValue(3);
    m.checks.mockResolvedValue([
      legacyDbCheck(keywords[0], 1),
      legacyDbCheck(keywords[1], 8, 1),
      legacyDbCheck(keywords[0], null, 2, {
        status: "failed",
        observationRun: null,
        createdAt: new Date("2026-10-12T11:00:00Z"),
        updatedAt: new Date("2026-10-12T11:00:00Z"),
      }),
    ]);
    const result = await read();
    expect(
      legacyMarketTopThree(
        keywords.map((row) => row.publicId),
        result.resolutions,
      ),
    ).toEqual({ topThreeCount: 1, currentVisibility: 50 });
    expect(result.resolutions[0].resolution.latestAttempt?.execution).toBe("failed");
  });
  it.each(["unknown", "old-revision", "stale", "unknown-freshness"])(
    "keeps the full denominator unavailable for %s current proof",
    async (kind) => {
      const check = legacyDbCheck(keywords[1], 2, 1);
      if (!check.observationRun) throw new Error("Expected captured fixture");
      const evidence = check.observationRun.requestPolicy;
      const altered =
        kind === "unknown"
          ? { ...check, observationRun: null }
          : kind === "old-revision"
            ? {
                ...check,
                observationRun: {
                  ...check.observationRun,
                  requestPolicy: {
                    evidence: {
                      version: 1,
                      targetRevision: "old-target",
                      policyRevision: "policy-v1",
                      observedAt: "2026-10-12T10:00:00Z",
                      completeThrough: { organic_result: 100 },
                    },
                  },
                },
              }
            : kind === "stale"
              ? {
                  ...check,
                  observationRun: {
                    ...check.observationRun,
                    requestPolicy: {
                      evidence: {
                        version: 1,
                        targetRevision: "target-v1",
                        policyRevision: "policy-v1",
                        observedAt: "2026-10-01T10:00:00Z",
                        completeThrough: { organic_result: 100 },
                      },
                    },
                  },
                }
              : check;
      m.checks.mockResolvedValue([legacyDbCheck(keywords[0], 1), altered]);
      const result = await read(kind === "unknown-freshness" ? { freshForMs: null } : {});
      expect(
        legacyMarketTopThree(
          keywords.map((row) => row.publicId),
          result.resolutions,
        ),
      ).toEqual({ topThreeCount: null, currentVisibility: null });
      expect(evidence).toBeDefined();
    },
  );
  it("does not rescue a latest incompatible definition with an older qualified baseline", async () => {
    m.count.mockResolvedValue(3);
    const latest = legacyDbCheck(keywords[0], 1);
    if (!latest.observationRun) throw new Error("Expected captured fixture");
    m.checks.mockResolvedValue([
      {
        ...latest,
        observationRun: {
          ...latest.observationRun,
          effectiveScope: { device: "mobile", language: "en", location: "US" },
        },
      },
      legacyDbCheck(keywords[0], 2, 2, {
        observationRun: {
          ...latest.observationRun,
          createdAt: new Date("2026-10-11T10:01:00Z"),
          requestPolicy: {
            evidence: {
              version: 1,
              targetRevision: "target-v1",
              policyRevision: "policy-v1",
              observedAt: "2026-10-11T10:00:00Z",
              completeThrough: { organic_result: 100 },
            },
          },
        },
        createdAt: new Date("2026-10-11T10:00:00Z"),
        updatedAt: new Date("2026-10-11T10:00:00Z"),
      }),
      legacyDbCheck(keywords[1], 8, 1),
    ]);
    const result = await read();
    expect(
      legacyMarketTopThree(
        keywords.map((row) => row.publicId),
        result.resolutions,
      ).currentVisibility,
    ).toBeNull();
  });
  it("refuses a foreign-project retained observation rather than displaying it", async () => {
    const foreign = legacyDbCheck(keywords[1], 1, 1, {}, "other-project");
    m.checks.mockResolvedValue([legacyDbCheck(keywords[0], 1), foreign]);
    await expect(read()).rejects.toThrow();
  });
  it("renews the explicit metadata port for empty membership and refuses oversized cohorts", async () => {
    const report = legacyReportOptions();
    const load = vi.spyOn(report, "loadMetadata");
    m.count.mockResolvedValue(0);
    await readLegacyOverviewQuality(db, scope, [], { now: legacyAsOf, horizon: 3, report });
    expect(load).toHaveBeenCalledWith(db, legacyProject, [], legacyAsOf);
    await expect(
      readLegacyOverviewQuality(db, scope, keywords, {
        now: legacyAsOf,
        horizon: 3,
        report: { ...report, limits: { ...report.limits, maxTargets: 1 } },
      }),
    ).rejects.toThrow();
  });
});
