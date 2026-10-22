import { beforeEach, expect, it, vi } from "vitest";
import { loadSnapshotExtensionView } from "./snapshot-extension-view";

const mocks = vi.hoisted(() => ({ lock: vi.fn(), proof: vi.fn(), find: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ rankCheck: { findFirst: mocks.find } }),
  },
}));
vi.mock("@/lib/provider-allocations/project-lock", () => ({
  lockProjectForProviderMutation: mocks.lock,
}));
vi.mock("./snapshot-extension-proof", () => ({ snapshotExtensionWasNotSent: mocks.proof }));
const raw = {
  snapshotContinuation: {
    version: 1,
    capturedAt: "2026-10-21T16:22:06.638Z",
    keyword: "flowtools",
    domain: "example.com",
    device: "desktop",
    connectionId: "connection",
    nextStart: 10,
    ended: false,
    location: {
      gl: "pl",
      hl: "pl",
      primaryGeoCode: null,
      primaryGeoName: "Poland",
      secondaryGeoName: "Poland",
    },
  },
  snapshotExtension: {
    version: 1,
    state: "retryable",
    nextStart: 10,
    ended: false,
    pages: [],
    requestId: "request",
    leaseUntil: "2026-10-21T16:31:49.932Z",
  },
};
const input = { projectId: "project", checkId: "check_public", provider: "serpapi", raw };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.find.mockResolvedValue({ id: "check", keywordId: "keyword", provider: "serpapi", raw });
  mocks.proof.mockResolvedValue(true);
});
it("rechecks fresh durable proof on every not_sent read and keeps the original expired deadline", async () => {
  for (let i = 0; i < 2; i++)
    expect(await loadSnapshotExtensionView(input)).toMatchObject({
      reason: "not_sent",
      expiresAt: "2026-10-21T16:37:06.638Z",
      nextStart: 10,
    });
  expect(mocks.proof).toHaveBeenCalledTimes(2);
  expect(mocks.lock).toHaveBeenCalledTimes(2);
  expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.proof.mock.invocationCallOrder[0],
  );
});
it("never trusts a persisted retryable label without fresh proof", async () => {
  mocks.proof.mockResolvedValue(false);
  expect((await loadSnapshotExtensionView(input)).reason).toBe("failed");
});
it("keeps unknown failures closed if proof lookup fails", async () => {
  mocks.proof.mockRejectedValue(new Error("unavailable"));
  expect((await loadSnapshotExtensionView(input)).reason).toBe("failed");
});
