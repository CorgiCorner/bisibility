import { beforeEach, describe, expect, it, vi } from "vitest";
import { comparisonFixture } from "./fixtures.test-support";
import { comparisonHash } from "./model";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  access: vi.fn(),
  quote: vi.fn(),
  start: vi.fn(),
  wake: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("./access", () => ({ assertComparisonAccess: mocks.access }));
vi.mock("./quote", () => ({ quoteComparison: mocks.quote }));
vi.mock("@/lib/temporal/provider-comparison-client", () => ({
  startProviderComparisonWorkflow: mocks.start,
}));
vi.mock("@/lib/worker-intents/realtime", () => ({ publishWorkerIntent: mocks.wake }));

import {
  ComparisonPreviewRejectedError,
  launchProviderComparison,
  previewProviderComparison,
} from "./service";

describe("comparison preview and launch custody", () => {
  const snapshot = comparisonFixture();
  const input = {
    projectId: "project",
    keywordId: "keyword",
    actorId: "actor",
    previewId: "90d6d2c5-a379-4c0d-b71a-814c16bef161",
    previewHash: comparisonHash(snapshot),
    requestKey: "00000000-0000-4000-8000-000000000001",
  };
  const run = {
    id: "8f342b47-bb21-408a-8c03-ed7273ad1775",
    ...input,
    sourceHash: input.previewHash,
    snapshot,
    createdAt: new Date(),
    sides: snapshot.connections.map((connection) => ({
      provider: connection.provider,
      status: "queued",
      costCents: null,
      quantity: null,
      reason: null,
      result: null,
    })),
  };
  let tx: any;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.quote.mockResolvedValue(snapshot);
    mocks.access.mockResolvedValue(undefined);
    mocks.start.mockResolvedValue(undefined);
    mocks.wake.mockResolvedValue(undefined);
    tx = {
      $queryRaw: vi.fn(),
      providerComparisonRun: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(run),
      },
      providerComparisonPreview: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({
          id: input.previewId,
          projectId: "project",
          keywordId: "keyword",
          actorId: "actor",
          sourceHash: input.previewHash,
          snapshot,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    };
    mocks.transaction.mockImplementation((callback: any) => callback(tx));
  });
  it("preview persists a server-authored snapshot without any workflow or provider launch", async () => {
    const preview = await previewProviderComparison(input);
    expect(
      preview.sides.map((side) => [side.provider, side.nativeUnit, side.nativeQuantity]),
    ).toEqual([
      ["dataforseo", "cents", 2],
      ["serpapi", "searches", 2],
    ]);
    expect(tx.providerComparisonPreview.create).toHaveBeenCalledOnce();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.wake).not.toHaveBeenCalled();
  });
  it.each(["expired", "keyword", "price"])(
    "rejects %s before durable run creation",
    async (kind) => {
      if (kind === "expired")
        tx.providerComparisonPreview.findFirst.mockResolvedValue({
          keywordId: "keyword",
          sourceHash: input.previewHash,
          expiresAt: new Date(0),
        });
      if (kind === "keyword")
        tx.providerComparisonPreview.findFirst.mockResolvedValue({
          keywordId: "other",
          sourceHash: input.previewHash,
          expiresAt: new Date(Date.now() + 60_000),
        });
      if (kind === "price") mocks.quote.mockResolvedValue({ ...snapshot, text: "changed" });
      await expect(launchProviderComparison(input)).rejects.toBeInstanceOf(
        ComparisonPreviewRejectedError,
      );
      expect(tx.providerComparisonRun.create).not.toHaveBeenCalled();
      expect(mocks.start).not.toHaveBeenCalled();
    },
  );
  it("returns the durable run when workflow submission is uncertain, and same key reuses it", async () => {
    mocks.start.mockRejectedValue(new Error("network interrupted"));
    expect((await launchProviderComparison(input)).id).toBe(run.id);
    tx.providerComparisonRun.findUnique.mockResolvedValue(run);
    tx.providerComparisonPreview.findFirst.mockRejectedValue(
      new Error("expired read must not run"),
    );
    expect((await launchProviderComparison(input)).id).toBe(run.id);
    expect(tx.providerComparisonRun.create).toHaveBeenCalledOnce();
  });
  it("rejects cross-keyword reuse of an existing request key before wake", async () => {
    tx.providerComparisonRun.findUnique.mockResolvedValue({ ...run, keywordId: "other" });
    await expect(launchProviderComparison(input)).rejects.toThrow(/key conflict/);
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
