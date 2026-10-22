import { expect, it, vi } from "vitest";
import { collectedQueuedDefinition } from "./worker-collection";
import { nativeBindingFixture } from "./worker-native.fixtures";

const mocks = vi.hoisted(() => ({ read: vi.fn(), lease: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: async (fn: (tx: object) => unknown) => fn({}) },
}));
vi.mock("@/lib/rank-check/queued-persistence-lease", () => ({
  assertQueuedPersistenceLease: mocks.lease,
}));
vi.mock("./storage", () => ({ readDefinitionBinding: mocks.read }));

it("collects already-submitted Top20 results using the original retained early-stop policy", async () => {
  const base = nativeBindingFixture("dataforseo");
  const { compilerVersion: _version, ...legacyRequest } = base.request as typeof base.request & {
    compilerVersion?: 2;
  };
  const binding = {
    ...base,
    owner: { ...base.owner, queuedTaskId: "task" },
    request: { ...legacyRequest, stopOnMatch: true, findTargetsIn: "with_subdomains" },
  };
  mocks.read.mockResolvedValue(binding);
  const task = {
    id: "task",
    keyword: { projectId: binding.projectId },
    keywordId: binding.keywordId,
    rankCheckId: binding.owner.rankCheckId,
  } as Parameters<typeof collectedQueuedDefinition>[0];
  const lease = { owner: "lease" } as Parameters<typeof collectedQueuedDefinition>[1];
  await expect(collectedQueuedDefinition(task, lease)).resolves.toBe(binding);
  expect(binding.request.stopOnMatch).toBe(true);
  expect(mocks.lease).toHaveBeenCalledOnce();
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith(
    {},
    binding.projectId,
    binding.keywordId,
    "queued-definition:task",
    binding.owner.rankCheckId,
  );
});
