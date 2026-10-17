import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ recordFailure: vi.fn(), publish: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("./command-failure", () => ({
  recordFailure: mocks.recordFailure,
  stopFailedCommand: vi.fn(),
}));
vi.mock("@/lib/worker-intents/realtime", () => ({ publishWorkerIntent: mocks.publish }));
vi.mock("./tokens", () => ({ recoveryInstance: () => "test-instance" }));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => "test" }));

import { processRecoveryCommands } from "./execute";

beforeEach(() => vi.clearAllMocks());
it.each(["P2034", "P2028", "P1001"])(
  "defers a transient %s without consuming its approved item",
  async (code) => {
    const command = {
      namespace: "test",
      commandId: "command",
      actorId: "admin",
      state: "queued",
      leaseId: null,
      result: [],
      input: {
        instance: "test-instance",
        items: [{ token: "opaque", version: "v1", action: "recover_proof" }],
      },
    };
    const save = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(command, data);
      return { count: 1 };
    });
    const tx = {
      $queryRaw: vi.fn(),
      meteringRecoveryCommand: {
        findMany: vi.fn(async () => [command]),
        findUniqueOrThrow: vi.fn(async () => command),
        updateMany: save,
        update: save,
      },
    };
    let calls = 0;
    const db = {
      $transaction: vi.fn(async (work: (value: typeof tx) => Promise<unknown>) => {
        if (calls++ === 1) throw Object.assign(new Error("temporary"), { code });
        return work(tx);
      }),
      meteringRecoveryCommand: {
        findUniqueOrThrow: vi.fn(async () => command),
        updateMany: save,
        count: vi.fn(async () => 1),
      },
    };
    await processRecoveryCommands(db as never, { namespace: "test", limit: 1 });
    expect(mocks.recordFailure).not.toHaveBeenCalled();
    expect(command.result).toEqual([]);
    expect(command).toMatchObject({
      state: "queued",
      leaseId: null,
      input: { retries: { "0": 1 } },
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  },
);
