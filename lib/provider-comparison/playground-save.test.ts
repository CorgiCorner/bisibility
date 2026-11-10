import { beforeEach, expect, it, vi } from "vitest";
import { comparisonFixture } from "./fixtures.test-support";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), access: vi.fn(), persist: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("./access", () => ({ assertComparisonHistoryWrite: mocks.access }));
vi.mock("@/lib/observation/persist", () => ({ persistRankCheckObservation: mocks.persist }));

import { previewPlaygroundSave, savePlaygroundResult } from "./playground-save";

let tx: any, side: any, target: any, snapshot: any;
const input = {
  projectId: "p",
  actorId: "a",
  runId: "90d6d2c5-a379-4c0d-b71a-814c16bef161",
  provider: "dataforseo" as const,
};
beforeEach(() => {
  vi.clearAllMocks();
  snapshot = {
    ...comparisonFixture(),
    version: 2,
    keywordId: null,
    trackedTarget: {
      id: "k",
      publicId: "kw_x",
      targetUrl: "/",
      targetEpoch: "1",
      policyEpoch: "2",
    },
  };
  target = {
    id: "k",
    publicId: "kw_x",
    text: snapshot.text,
    targetUrl: "/",
    measurementTargetEpoch: 1n,
    measurementPolicyEpoch: 2n,
    locationRef: snapshot.location,
    project: { domain: snapshot.domain },
  };
  side = {
    id: "side",
    provider: "dataforseo",
    status: "completed",
    result: {
      position: 3,
      rankingUrl: "https://example.com/",
      recordedAt: "2026-11-03T10:00:00Z",
      observedAt: null,
      normalizationVersion: "v1",
      _capture: {
        checkedAt: "2026-11-03T10:00:00Z",
        raw: { organic_results: [] },
        observation: null,
      },
    },
  };
  tx = {
    $queryRaw: vi.fn(),
    providerComparisonRun: {
      findFirst: vi.fn(async () => ({ id: input.runId, snapshot, sides: [side] })),
    },
    keyword: { findFirst: vi.fn(async () => target) },
    rankCheck: {
      findFirst: vi.fn(),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "check", publicId: "check_public" })),
    },
    providerComparisonSide: {
      update: vi.fn(async ({ data }: any) => {
        side.result = data.result;
      }),
    },
  };
  mocks.transaction.mockImplementation((fn: any) => fn(tx));
});
it("previews the exact target without writing a check", async () => {
  expect(await previewPlaygroundSave(input)).toMatchObject({
    keywordRef: "kw_x",
    device: snapshot.device,
    provider: "dataforseo",
  });
  expect(tx.rankCheck.create).not.toHaveBeenCalled();
});
it("saves once with the original timestamp and without creating any provider request", async () => {
  expect(await savePlaygroundResult(input)).toEqual({
    checkRef: "check_public",
    keywordRef: "kw_x",
  });
  expect(await savePlaygroundResult(input)).toEqual({
    checkRef: "check_public",
    keywordRef: "kw_x",
  });
  expect(tx.rankCheck.create).toHaveBeenCalledTimes(1);
  expect(tx.rankCheck.create.mock.calls[0][0].data).toMatchObject({
    checkedAt: new Date("2026-11-03T10:00:00Z"),
    costCents: null,
    comparisonAllowed: false,
  });
});
it.each(["target", "location", "provider", "pending"])(
  "rejects changed %s before adding history",
  async (kind) => {
    if (kind === "target") target.measurementTargetEpoch = 2n;
    if (kind === "location") target.locationRef = { ...snapshot.location, hl: "en" };
    if (kind === "provider") side.provider = "serpapi";
    if (kind === "pending") side.status = "claimed";
    await expect(savePlaygroundResult(input)).rejects.toThrow();
    expect(tx.rankCheck.create).not.toHaveBeenCalled();
  },
);
it("links an imported original check without cloning it", async () => {
  side.result._sourceCheckId = "original";
  tx.rankCheck.findFirst.mockResolvedValue({ publicId: "check_original" });
  expect(await savePlaygroundResult(input)).toMatchObject({ checkRef: "check_original" });
  expect(tx.rankCheck.create).not.toHaveBeenCalled();
});

it("carries URL enrichment into imported history while preserving the original raw response", async () => {
  const url = "https://google.com/goto?url=one";
  side.result._urlRepair = {
    version: 1,
    workflowId: "job",
    runId: "run",
    status: "completed",
    updatedAt: "2026-11-09T10:00:00Z",
    mappings: { [url]: "https://destination.test/" },
    resolved: 1,
    unresolved: 0,
  };
  side.result._capture.raw = {
    organic_results: [{ rank: 3, url }],
    provider_response: { native: true },
  };
  await savePlaygroundResult(input);
  expect(tx.rankCheck.create.mock.calls[0][0].data.raw).toMatchObject({
    organic_results: [{ rank: 3, url }],
    provider_response: { native: true },
    _urlRepair: side.result._urlRepair,
  });
});
