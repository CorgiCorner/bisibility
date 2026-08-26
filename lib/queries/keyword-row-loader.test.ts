import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  defaults: vi.fn(),
  findMany: vi.fn(),
  mapKeyword: vi.fn(),
  metrics: vi.fn(),
  traffic: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { keyword: { findMany: mocks.findMany } } }));
vi.mock("./keyword-metrics-query", () => ({ fetchKeywordMetricsByIds: mocks.metrics }));
vi.mock("./keyword-row", () => ({ mapKeyword: mocks.mapKeyword }));
vi.mock("./keyword-traffic", () => ({ fetchProjectKeywordTraffic: mocks.traffic }));
vi.mock("./workspace-request-data", () => ({ getRequestProjectDefaults: mocks.defaults }));

import { loadKeywordRowsByInternalIds } from "./keyword-row-loader";

describe("keyword row loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.defaults.mockResolvedValue(null);
    mocks.metrics.mockResolvedValue(new Map());
    mocks.traffic.mockResolvedValue(new Map());
  });

  it("orders equal-time rank checks by descending id", async () => {
    await loadKeywordRowsByInternalIds({ domain: "example.com", id: "project_1" }, ["keyword_1"]);

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          rankChecks: expect.objectContaining({
            orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
          }),
        }),
      }),
    );
  });
});
