import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  fetchKeywordMetrics: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  getRequestProjectDefaults: vi.fn(),
  mapKeyword: vi.fn(),
  requireReadableProject: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { keyword: { findFirst: mocks.findFirst, findMany: mocks.findMany } },
}));
vi.mock("@/lib/queries/keyword-row", () => ({ mapKeyword: mocks.mapKeyword }));
vi.mock("@/lib/queries/keyword-metrics-query", () => ({
  fetchKeywordMetrics: mocks.fetchKeywordMetrics,
}));
vi.mock("@/lib/queries/workspace-request-data", () => ({
  getRequestProjectDefaults: mocks.getRequestProjectDefaults,
}));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

import { getKeywordMarketTargets } from "./keyword-market-targets";

describe("getKeywordMarketTargets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({
      project: { domain: "example.com", id: "project_internal" },
    });
    mocks.getRequestProjectDefaults.mockResolvedValue(null);
    mocks.fetchKeywordMetrics.mockResolvedValue({
      cpc: null,
      difficulty: null,
      serpFeatures: [],
      volume: null,
    });
    mocks.mapKeyword.mockReturnValue(keywordRows[0]);
  });

  it("rejects a non-public keyword ID before authorization or data access", async () => {
    await expect(getKeywordMarketTargets("prj_test", "internal-id")).resolves.toEqual([]);
    expect(mocks.requireReadableProject).not.toHaveBeenCalled();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("loads only same-text targets inside the authorized project with 90-check metrics", async () => {
    mocks.findFirst.mockResolvedValue({ text: "rank tracker" });
    mocks.findMany.mockResolvedValue([{ id: "keyword_internal", publicId: "kw_target" }]);

    await expect(
      getKeywordMarketTargets("prj_test", "kw_a00000000000000000000000"),
    ).resolves.toEqual([keywordRows[0]]);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "project_internal", text: "rank tracker" },
      }),
    );
    expect(mocks.fetchKeywordMetrics).toHaveBeenCalledWith("keyword_internal", 90);
  });
});
