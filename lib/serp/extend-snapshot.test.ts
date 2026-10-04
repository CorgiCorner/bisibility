import { beforeEach, describe, expect, it, vi } from "vitest";
import { extendSnapshot } from "./extend-snapshot";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  finish: vi.fn(),
  run: vi.fn(),
  chain: vi.fn(),
  attribution: vi.fn(),
}));
vi.mock("./snapshot-extension-store", () => ({
  claimSnapshotExtension: mocks.claim,
  finishSnapshotExtension: mocks.finish,
}));
vi.mock("@/lib/rank-check/fallback", () => ({ runCheckWithFallback: mocks.run }));
vi.mock("@/lib/rank-check/provider-chain-loader", () => ({ loadSerpProviderChain: mocks.chain }));
vi.mock("@/lib/rank-check/runner", () => ({ fallbackSchedule: () => ({ frequency: "manual" }) }));
vi.mock("@/lib/provider-usage/tag", () => ({
  createProviderRequestAttribution: mocks.attribution,
}));
vi.mock("server-only", () => ({}));
const input = {
  actorId: "actor-1",
  projectId: "project-1",
  checkId: "check_original",
  nextStart: 20,
};
const row = { rank: 1, url: "https://example.com/a", title: null, domain: "example.com" };
const context = {
  version: 1,
  capturedAt: new Date().toISOString(),
  keyword: "sample",
  domain: "example.com",
  device: "desktop",
  connectionId: "connection-1",
  nextStart: 20,
  ended: false,
  location: {
    gl: "us",
    hl: "en",
    primaryGeoCode: null,
    primaryGeoName: "United States",
    secondaryGeoName: "United States",
  },
};
const claim = {
  ok: true,
  check: { id: "internal-check", keywordId: "keyword-1" },
  context,
  raw: { organic_results: [row] },
  state: { version: 1, state: "running", nextStart: 20, ended: false, pages: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claim.mockResolvedValue(claim);
  mocks.finish.mockResolvedValue(undefined);
  mocks.chain.mockResolvedValue([
    { id: "connection-1", credentialSource: "own", provider: "serpapi" },
    { id: "connection-2", credentialSource: "own", provider: "serpapi" },
  ]);
  mocks.attribution.mockResolvedValue({ context: { correlationId: "internal-check" } });
  mocks.run.mockResolvedValue({
    result: {
      usageRecorded: true,
      rankCheck: {
        checkedAt: new Date(),
        raw: {
          snapshotContinuation: { ...context, nextStart: 30 },
          organic_results: [
            { ...row, rank: 21 },
            { ...row, rank: 22, url: "https://example.com/b" },
          ],
        },
      },
    },
  });
});

describe("extend snapshot service", () => {
  it("uses the shared budget, allocation, rate-limit and usage pipeline for one page", async () => {
    expect(await extendSnapshot(input)).toEqual({ ok: true });
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({
        depth: 10,
        stopOnMatch: false,
        connections: [{ id: "connection-1", credentialSource: "own", provider: "serpapi" }],
        projectId: input.projectId,
      }),
    );
    expect(mocks.attribution).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: "internal-check",
        source: "app",
        trigger: "manual",
      }),
    );
    expect(mocks.finish).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          state: "idle",
          nextStart: 30,
          pages: [
            expect.objectContaining({
              skippedDuplicates: 1,
              rows: [expect.objectContaining({ rank: 22 })],
            }),
          ],
        }),
      }),
    );
  });
  it("does not execute anything when claim is rejected", async () => {
    mocks.claim.mockResolvedValue({ ok: false, reason: "expired" });
    expect(await extendSnapshot(input)).toEqual({ ok: false, reason: "expired" });
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("keeps earlier results after provider failure and prohibits blind replay", async () => {
    mocks.run.mockRejectedValue(new Error("provider failed"));
    expect(await extendSnapshot(input)).toEqual({ ok: false, reason: "failed" });
    expect(mocks.finish).toHaveBeenCalledWith(
      expect.objectContaining({ state: { ...claim.state, state: "failed" } }),
    );
    expect(mocks.run).toHaveBeenCalledTimes(1);
  });
  it("does not report success if the paid result cannot be saved", async () => {
    mocks.finish.mockRejectedValueOnce(new Error("database unavailable"));
    expect(await extendSnapshot(input)).toEqual({ ok: false, reason: "failed" });
    expect(mocks.run).toHaveBeenCalledTimes(1);
    expect(mocks.finish.mock.calls.at(-1)?.[0].state.state).toBe("failed");
  });
  it("fails closed if request usage was not recorded", async () => {
    mocks.run.mockResolvedValue({
      result: { usageRecorded: false, rankCheck: { raw: {}, checkedAt: new Date() } },
    });
    expect(await extendSnapshot(input)).toEqual({ ok: false, reason: "failed" });
  });
});
