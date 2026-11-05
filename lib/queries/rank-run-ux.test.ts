import { beforeEach, expect, it } from "vitest";
import { mocks, run, runIds, setupRankRunQueryMocks } from "./rank-check-runs.test-fixture";

const { getRankCheckRun, listRankCheckRunItems } = await import("./rank-check-runs");
beforeEach(setupRankRunQueryMocks);
it("reads newest child links within the authorized project and counts all ranked checks", async () => {
  mocks.runFindFirst.mockResolvedValue({
    ...run(runIds[0], new Date()),
    _count: { items: 2, rankChecks: 1 },
  });
  mocks.runFindMany.mockResolvedValue([{ publicId: runIds[1], parentRelation: "retry_failed" }]);
  const result = await getRankCheckRun("project_1", runIds[0]);
  expect(result).toMatchObject({ rankedCount: 1, childRuns: [{ publicId: runIds[1] }] });
  expect(mocks.runFindMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { projectId: "project_1", parentRunId: `db_${runIds[0]}`, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { publicId: "desc" }],
    }),
  );
});
it("does not return a previous attempt on a queued target", async () => {
  mocks.runFindFirst.mockResolvedValue({
    id: "run",
    publicId: runIds[0],
    projectId: "project_1",
    selectionSpec: {},
    status: "queued",
  });
  mocks.itemFindMany.mockResolvedValue([
    {
      createdAt: new Date(),
      id: "item",
      status: "queued",
      startedAt: null,
      finishedAt: null,
      keyword: {
        text: "example",
        publicId: "kw_example",
        location: "Spain",
        device: "mobile",
        locationRef: null,
      },
      rankCheck: {
        id: "previous",
        publicId: "check_previous",
        provider: "dataforseo",
        position: null,
        errorCode: "provider_transient",
      },
    },
  ]);
  const result = await listRankCheckRunItems(
    "project_1",
    runIds[0],
    new URL("https://example.com/"),
  );
  expect(result.data[0].status).toBe("queued");
  expect(result.data[0].rankCheck).toBeNull();
  expect(result.data[0].actualCostCents).toBeNull();
});
