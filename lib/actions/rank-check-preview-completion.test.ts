import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  consent: vi.fn(),
  surface: vi.fn(),
  track: vi.fn(),
  after: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));

vi.mock("@/lib/db/prisma", () => ({ prisma: { rankCheckRun: { findMany: mocks.findMany } } }));
vi.mock("@/lib/analytics/server", () => ({
  readAnalyticsSurfaceFromHeaders: mocks.surface,
  readConsentFromCookies: mocks.consent,
  trackServerEvent: mocks.track,
}));

import { emitFirstCheckRunCompletion } from "./rank-check-preview-analytics";

const createdAt = new Date("2026-10-16T10:00:00Z");
const finishedAt = new Date("2026-10-16T10:00:20Z");
const input = {
  actorId: "user-fixture",
  projectId: "project-fixture",
  runPublicIds: ["rcr_fixture"],
};
const deferred: Array<() => Promise<void>> = [];
async function flushDelivery() {
  await Promise.all(deferred.splice(0).map((task) => task()));
}

const completed = () => ({
  createdAt,
  publicId: "rcr_fixture",
  items: [
    {
      status: "completed",
      rankCheck: { status: "completed", provider: "serpapi", finishedAt },
    },
  ],
});

describe("first-check completion analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deferred.length = 0;
    mocks.after.mockImplementation((task) => deferred.push(task));
    mocks.surface.mockResolvedValue("onboarding");
    mocks.consent.mockResolvedValue({
      analytics: true,
      replay: false,
      status: "decided",
      decidedAt: 1,
    });
    mocks.findMany.mockResolvedValue([completed()]);
    mocks.track.mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns completed-result reads without waiting for analytics delivery", async () => {
    let resolveDelivery!: () => void;
    const delivery = new Promise<void>((resolve) => {
      resolveDelivery = resolve;
    });
    const returned = vi.fn();
    mocks.track.mockReturnValue(delivery);
    const read = emitFirstCheckRunCompletion(input).then(returned);
    await vi.waitFor(() => expect(returned).toHaveBeenCalledOnce(), { timeout: 1000 });
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.after).toHaveBeenCalledOnce();
    await read;
    const background = flushDelivery();
    expect(mocks.track).toHaveBeenCalledOnce();
    resolveDelivery();
    await background;
  });

  it("captures durable success with stable ingestion identity across repeated observations", async () => {
    await emitFirstCheckRunCompletion(input);
    await emitFirstCheckRunCompletion(input);
    expect(mocks.after).toHaveBeenCalledTimes(2);
    await flushDelivery();
    expect(mocks.track).toHaveBeenCalledTimes(2);
    const [name, event] = mocks.track.mock.calls[0];
    expect(name).toBe("rank_check_preview_completed");
    expect(event).toMatchObject({
      distinctId: "user-fixture",
      timestamp: finishedAt,
      properties: {
        duration_ms: 20_000,
        provider: "serpapi",
        status: "completed",
        surface: "onboarding",
      },
    });
    expect(event.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(mocks.track.mock.calls[1][1].uuid).toBe(event.uuid);
    expect(JSON.stringify(event.properties)).not.toMatch(
      /rcr_fixture|project-fixture|user-fixture/,
    );
  });

  it("limits the authoritative query to the initiating actor and authorized project", async () => {
    mocks.findMany.mockResolvedValue([]);
    await emitFirstCheckRunCompletion(input);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          projectId: "project-fixture",
          requestedById: "user-fixture",
          publicId: { in: ["rcr_fixture"] },
          trigger: "manual",
        }),
      }),
    );
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it.each(["queued", "running", "failed", "cancelled", "deferred"])(
    "does not turn a %s item into activation",
    async (status) => {
      mocks.findMany.mockResolvedValue([
        { ...completed(), items: [{ ...completed().items[0], status }] },
      ]);
      await emitFirstCheckRunCompletion(input);
      expect(mocks.track).not.toHaveBeenCalled();
      expect(mocks.after).not.toHaveBeenCalled();
    },
  );

  it("requires the persisted check to be completed and have a completion timestamp", async () => {
    for (const rankCheck of [
      null,
      { status: "running", provider: "serpapi", finishedAt },
      { status: "completed", provider: "serpapi", finishedAt: null },
    ]) {
      mocks.findMany.mockResolvedValue([
        { ...completed(), items: [{ status: "completed", rankCheck }] },
      ]);
      await emitFirstCheckRunCompletion(input);
    }
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("rechecks current consent before reading analytics data", async () => {
    mocks.consent.mockResolvedValue({
      analytics: false,
      replay: true,
      status: "decided",
      decidedAt: 1,
    });
    await emitFirstCheckRunCompletion(input);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it.each([null, "settings"])("does not activate from surface %s", async (surface) => {
    mocks.surface.mockResolvedValue(surface);
    await emitFirstCheckRunCompletion(input);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("does not backfill a run created before the current consent decision", async () => {
    mocks.consent.mockResolvedValue({
      analytics: true,
      replay: false,
      status: "decided",
      decidedAt: finishedAt.getTime() / 1000 + 1,
    });
    await emitFirstCheckRunCompletion(input);
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("keeps polling usable when analytics storage or delivery fails", async () => {
    mocks.findMany.mockRejectedValueOnce(new Error("unavailable"));
    await expect(emitFirstCheckRunCompletion(input)).resolves.toBeUndefined();
    mocks.track.mockRejectedValueOnce(new Error("offline"));
    await expect(emitFirstCheckRunCompletion(input)).resolves.toBeUndefined();
    await expect(flushDelivery()).resolves.toBeUndefined();
  });
});
