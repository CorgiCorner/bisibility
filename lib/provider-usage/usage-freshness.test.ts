import { describe, expect, it, vi } from "vitest";
import {
  PROVIDER_USAGE_OVERDUE_THRESHOLD_MS,
  PROVIDER_USAGE_RECONCILED_AT_SETTING_KEY,
} from "./reconcile";
import { providerUsageFreshness } from "./usage-freshness";

const NOW = new Date("2026-09-22T12:00:00.000Z");

function clientWithValue(value: string | null) {
  return {
    instanceSetting: {
      findUnique: vi.fn(async () => (value === null ? null : { value })),
    },
  };
}

describe("provider usage freshness", () => {
  it("treats an absent watermark as stale without inventing a timestamp", async () => {
    const client = clientWithValue(null);
    await expect(providerUsageFreshness(client as never, { now: NOW })).resolves.toEqual({
      lastReconciledAt: null,
      status: "stale",
    });
    expect(client.instanceSetting.findUnique).toHaveBeenCalledWith({
      select: { value: true },
      where: { key: PROVIDER_USAGE_RECONCILED_AT_SETTING_KEY },
    });
  });

  it("treats a recent watermark as fresh", async () => {
    const client = clientWithValue(new Date(NOW.getTime() - 5 * 60_000).toISOString());
    await expect(providerUsageFreshness(client as never, { now: NOW })).resolves.toEqual({
      lastReconciledAt: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
      status: "fresh",
    });
  });

  it("holds freshness at exactly fifteen minutes", async () => {
    const exactlyStale = new Date(
      NOW.getTime() - PROVIDER_USAGE_OVERDUE_THRESHOLD_MS,
    ).toISOString();
    await expect(
      providerUsageFreshness(clientWithValue(exactlyStale) as never, { now: NOW }),
    ).resolves.toMatchObject({ status: "fresh" });
    const pastStale = new Date(
      NOW.getTime() - PROVIDER_USAGE_OVERDUE_THRESHOLD_MS - 1_000,
    ).toISOString();
    await expect(
      providerUsageFreshness(clientWithValue(pastStale) as never, { now: NOW }),
    ).resolves.toMatchObject({ status: "stale" });
  });

  it("treats an unparseable watermark as stale and never surfaces it as a timestamp", async () => {
    await expect(
      providerUsageFreshness(clientWithValue("not-a-date") as never, { now: NOW }),
    ).resolves.toEqual({ lastReconciledAt: null, status: "stale" });
  });

  it("treats a future watermark as stale and invalid", async () => {
    const future = new Date(NOW.getTime() + 5 * 60_000).toISOString();
    await expect(
      providerUsageFreshness(clientWithValue(future) as never, { now: NOW }),
    ).resolves.toEqual({ lastReconciledAt: null, status: "stale" });
    const farFuture = new Date(NOW.getTime() + 60 * 60_000).toISOString();
    await expect(
      providerUsageFreshness(clientWithValue(farFuture) as never, { now: NOW }),
    ).resolves.toEqual({ lastReconciledAt: null, status: "stale" });
  });
});
