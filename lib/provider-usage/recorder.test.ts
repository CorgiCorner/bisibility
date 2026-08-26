import { describe, expect, it, vi } from "vitest";
import { recordProviderUsage } from "./recorder";

const attribution = {
  context: {
    correlationId: "request-1",
    feature: "keyword_metrics" as const,
    projectId: "project_1",
    source: "sdk" as const,
    trigger: "manual" as const,
  },
  tag: "app=bisibility;stage=dev;src=sdk;trg=manual;f=keyword_metrics;p=project_1;c=request-1",
};
function client(count = 1) {
  return { providerCostEntry: { createMany: vi.fn().mockResolvedValue({ count }) } };
}

describe("provider usage recorder", () => {
  it("records cost, native quantity, and trusted request identity", async () => {
    const db = client();
    await expect(
      recordProviderUsage(db, {
        attribution,
        connectionId: "connection_1",
        costCents: 2.5,
        failed: false,
        provider: "provider-a",
        providerRequestId: "native-1",
        usageQuantity: 3,
      }),
    ).resolves.toEqual({ status: "recorded" });
    expect(db.providerCostEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          connectionId: "connection_1",
          costCents: 2.5,
          providerRequestId: "native-1",
          usageQuantity: 3,
        }),
      ],
      skipDuplicates: true,
    });
  });
  it("returns duplicate deterministically for a repeated native request id", async () => {
    const db = client(0);
    await expect(
      recordProviderUsage(db, {
        attribution,
        connectionId: "connection_1",
        costCents: 2.5,
        failed: false,
        provider: "provider-a",
        providerRequestId: "native-1",
        usageQuantity: 1,
      }),
    ).resolves.toEqual({ status: "duplicate" });
  });
  it("records zero-cost quota usage when native quantity is positive", async () => {
    const db = client();
    await expect(
      recordProviderUsage(db, {
        attribution,
        connectionId: "connection_1",
        costCents: 0,
        failed: false,
        provider: "provider-a",
        usageQuantity: 2,
      }),
    ).resolves.toEqual({ status: "recorded" });
    expect(db.providerCostEntry.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ costCents: 0, usageQuantity: 2 })],
      skipDuplicates: true,
    });
  });
  it("skips requests with neither monetary cost nor native usage", async () => {
    const values = { costCents: 0, failed: false, usageQuantity: null };
    const db = client();
    await expect(
      recordProviderUsage(db, {
        attribution,
        connectionId: "connection_1",
        provider: "provider-a",
        providerRequestId: "native-1",
        ...values,
      }),
    ).resolves.toEqual({ status: "skipped" });
    expect(db.providerCostEntry.createMany).not.toHaveBeenCalled();
  });
  it("rejects attribution for another project", async () => {
    const db = client();
    await expect(
      recordProviderUsage(db, {
        attribution,
        connectionId: "connection_1",
        costCents: 1,
        failed: false,
        projectId: "project_2",
        provider: "provider-a",
      }),
    ).rejects.toThrow("project identity");
  });
});
