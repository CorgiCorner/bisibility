import type { Prisma } from "@/lib/generated/prisma/client";
import { expect, it, vi } from "vitest";
import { loadRankTrackerReportCandidates } from "./rank-tracker-report-database";

const limits = { maxTargets: 10, maxChecks: 10, maxItems: 10 };
it("intersects a filtered comparison with tenant/current-cohort/asOf predicates rather than overriding them", async () => {
  const tx = {
    keyword: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    projectDefaults: { findUnique: vi.fn() },
    projectMarket: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const at = new Date("2026-10-12T12:00:00Z");
  const selected = {
    locationId: "loc",
    device: "mobile" as const,
    publicId: { notIn: ["excluded"] },
    projectId: "foreign",
  };
  await loadRankTrackerReportCandidates(
    tx as unknown as Prisma.TransactionClient,
    "actual-project",
    limits,
    "include_retained",
    at,
    selected,
  );
  expect(tx.keyword.count.mock.calls[0][0].where).toEqual({
    AND: [
      {
        archivedAt: null,
        projectId: "actual-project",
        createdAt: { lte: at },
        locationRef: {
          projectMarkets: { none: { projectId: "actual-project", status: { not: "active" } } },
        },
      },
      selected,
    ],
  });
  expect(tx.keyword.findMany.mock.calls[0][0].where).toEqual(
    tx.keyword.count.mock.calls[0][0].where,
  );
});
it("fails closed at capacity before retrieving any partial filtered population", async () => {
  const tx = { keyword: { count: vi.fn().mockResolvedValue(11), findMany: vi.fn() } };
  await expect(
    loadRankTrackerReportCandidates(
      tx as unknown as Prisma.TransactionClient,
      "actual-project",
      limits,
      "include_retained",
      new Date(),
      { device: "mobile" },
    ),
  ).rejects.toThrow();
  expect(tx.keyword.findMany).not.toHaveBeenCalled();
});
