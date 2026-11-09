import { sweepUndeliveredOpsEvents } from "@/lib/ops/sweep";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deliver: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { opsEvent: { findMany: mocks.findMany } },
}));
vi.mock("@/lib/ops/notify", () => ({ deliverPersistedOpsEvent: mocks.deliver }));

describe("ops outbox sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("OPS_SLACK_WEBHOOK_URL", "https://hooks.slack.com/services/test");
    mocks.findMany.mockResolvedValue([{ id: "one" }, { id: "two" }]);
    mocks.deliver
      .mockResolvedValueOnce({ delivered: true, committed: true })
      .mockResolvedValueOnce({ delivered: false, committed: true });
  });

  it("retries oldest undelivered events within explicit bounds", async () => {
    await expect(sweepUndeliveredOpsEvents({ limit: 12, maxAttempts: 3 })).resolves.toEqual({
      attempted: 2,
      delivered: 1,
      committed: true,
    });
    expect(mocks.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "asc" },
      take: 12,
      where: { attempts: { lt: 3 }, deliveredAt: null },
    });
    expect(mocks.deliver).toHaveBeenCalledTimes(2);
  });

  it("does not query the outbox while disabled", async () => {
    vi.stubEnv("OPS_SLACK_WEBHOOK_URL", "");
    await expect(sweepUndeliveredOpsEvents()).resolves.toEqual({
      attempted: 0,
      delivered: 0,
      committed: false,
    });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
  it("retains earlier commit evidence when a later delivery helper rejects", async () => {
    mocks.deliver
      .mockReset()
      .mockResolvedValueOnce({ delivered: false, committed: true })
      .mockRejectedValueOnce(new Error("later delivery unavailable"));
    await expect(sweepUndeliveredOpsEvents()).resolves.toEqual({
      attempted: 2,
      delivered: 0,
      committed: true,
    });
  });
});
