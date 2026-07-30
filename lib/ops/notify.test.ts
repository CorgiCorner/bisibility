import { notifyOps, resetOpsNotifyStateForTests } from "@/lib/ops/notify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  del: vi.fn(),
  expire: vi.fn(),
  getRedisClient: vi.fn(),
  hGetAll: vi.fn(),
  hIncrBy: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { opsEvent: { create: mocks.create, update: mocks.update } },
}));
vi.mock("@/lib/redis/redis", () => ({ getRedisClient: mocks.getRedisClient }));

function enableOps() {
  vi.stubEnv("OPS_SLACK_WEBHOOK_URL", "https://hooks.slack.com/services/T/B/secret");
  vi.stubEnv("OPS_EVENTS_ENABLED", "1");
}

describe("notifyOps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetOpsNotifyStateForTests();
    mocks.getRedisClient.mockResolvedValue({
      del: mocks.del,
      expire: mocks.expire,
      hGetAll: mocks.hGetAll,
      hIncrBy: mocks.hIncrBy,
      set: mocks.set,
    });
    mocks.set.mockResolvedValue("OK");
    mocks.create.mockResolvedValue({
      fields: { Project: "example.com" },
      id: "event_1",
      kind: "traffic_sync",
      severity: "error",
      title: "Sync failed",
    });
    mocks.update.mockResolvedValue({});
  });

  it("is zero-cost when disabled and logs only once", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn());

    await notifyOps({ kind: "test", severity: "info", title: "one" });
    await notifyOps({ kind: "test", severity: "info", title: "two" });

    expect(debug).toHaveBeenCalledTimes(1);
    expect(mocks.getRedisClient).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("increments the suppressed counter and creates no outbox row when throttled", async () => {
    enableOps();
    mocks.set.mockResolvedValue(null);
    await notifyOps({
      dedupeKey: "sync:project:gsc",
      kind: "traffic_sync",
      severity: "error",
      title: "failed",
    });

    expect(mocks.set).toHaveBeenCalledWith("ops:throttle:sync:project:gsc", "1", {
      EX: 3600,
      NX: true,
    });
    expect(mocks.hIncrBy).toHaveBeenCalledWith("ops:throttle:suppressed", "sync:project:gsc", 1);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("persists a redacted outbox row before a failed Slack attempt", async () => {
    enableOps();
    const sequence: string[] = [];
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.create.mockImplementation(async () => {
      sequence.push("persist");
      return {
        fields: { Project: "example.com" },
        id: "event_1",
        kind: "traffic_sync",
        severity: "error",
        title: "Sync failed",
      };
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        sequence.push("slack");
        return new Response(null, { status: 502 });
      }),
    );

    await expect(
      notifyOps({
        fields: { Error: "token=do-not-store" },
        kind: "traffic_sync",
        severity: "error",
        title: "Sync failed with xoxb-secret-token",
      }),
    ).resolves.toBeUndefined();

    expect(sequence).toEqual(["persist", "slack"]);
    expect(JSON.stringify(mocks.create.mock.calls[0]?.[0])).not.toMatch(/do-not-store|xoxb/);
    expect(mocks.update).toHaveBeenCalledWith({
      data: {
        attempts: { increment: 1 },
        lastError: "Ops Slack delivery failed with status 502.",
      },
      where: { id: "event_1" },
    });
  });

  it("never throws when Redis or outbox storage fails", async () => {
    enableOps();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getRedisClient.mockRejectedValue(new Error("redis token=secret"));
    mocks.create.mockRejectedValue(new Error("database unavailable"));

    await expect(
      notifyOps({ dedupeKey: "key", kind: "test", severity: "error", title: "failed" }),
    ).resolves.toBeUndefined();
  });
});
