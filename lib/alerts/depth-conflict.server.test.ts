import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getKeywordDepthDecreaseWarning,
  getProjectDepthDecreaseWarning,
} from "./depth-conflict.server";

const mocks = vi.hoisted(() => ({
  prisma: {
    alertRule: { findMany: vi.fn() },
    keyword: { findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const rules = [
  {
    conditionType: "threshold",
    name: "Top 50",
    targetType: "all",
    targets: [],
    thresholdPosition: 50,
    topN: null,
  },
  {
    conditionType: "enters_top_n",
    name: "Top 10",
    targetType: "all",
    targets: [],
    thresholdPosition: null,
    topN: 10,
  },
];

describe("depth decrease warnings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.alertRule.findMany.mockResolvedValue(rules);
  });

  it("lists alerts affected when the project depth is lowered", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({
      defaults: { serpDepth: 100 },
      keywords: [{ id: "kw_1", schedule: null, tags: [] }],
    });

    await expect(getProjectDepthDecreaseWarning("project_1", 20)).resolves.toBe(
      "keywords ranking below 20 will be reported as not found; alerts deeper than 20 will not fire. Affected alerts: Top 50.",
    );
  });

  it("returns no warning when a keyword keeps or increases its effective depth", async () => {
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      id: "kw_1",
      project: { defaults: { serpDepth: 50 } },
      projectId: "project_1",
      schedule: { serpDepth: 20 },
      tags: [],
    });

    await expect(getKeywordDepthDecreaseWarning("kw_1", 50)).resolves.toBeNull();
    expect(mocks.prisma.alertRule.findMany).not.toHaveBeenCalled();
  });
});
