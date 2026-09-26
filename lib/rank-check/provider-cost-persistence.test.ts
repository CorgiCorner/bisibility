import { afterEach, describe, expect, it, vi } from "vitest";
import { writeRankCheckProviderCostEntry } from "./provider-cost-persistence";

vi.mock("server-only", () => ({}));

describe("writeRankCheckProviderCostEntry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["recorded", "unknown"])(
    "does not add an aggregate over an existing %s request receipt",
    async (measurementStatus) => {
      const tx = {
        providerCostEntry: {
          findFirst: vi.fn().mockResolvedValue({ id: "receipt_1", measurementStatus }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      await writeRankCheckProviderCostEntry(tx as never, {
        connectionId: "connection_1",
        projectId: "project_1",
        provider: "dataforseo",
        costCents: 1.25,
        failed: true,
        usage: {
          context: {
            correlationId: "queued_task_1",
            feature: "rank_check",
            projectId: "project_1",
            source: "worker",
            trigger: "scheduled",
          },
          tag: "trusted-tag",
        },
      });
      expect(tx.providerCostEntry.createMany).not.toHaveBeenCalled();
      expect(tx.providerCostEntry.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          connectionId: "connection_1",
          projectId: "project_1",
          feature: "rank_check",
          correlationId: "queued_task_1",
        },
      });
    },
  );

  it("keeps unattributed provider requests idempotent", async () => {
    const rows = new Map<string, unknown>();
    const tx = {
      providerCostEntry: {
        createMany: vi.fn(async ({ data }: { data: Array<{ providerRequestId?: string }> }) => {
          const requestId = data[0]?.providerRequestId;
          if (requestId && rows.has(requestId)) return { count: 0 };
          if (requestId) rows.set(requestId, data[0]);
          return { count: 1 };
        }),
      },
    };
    const input = {
      connectionId: "connection_1",
      costCents: 12,
      failed: false,
      keywordId: "keyword_1",
      projectId: "project_1",
      provider: "dataforseo",
      providerRequestId: "provider_request_1",
      usageQuantity: 3,
    };
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await writeRankCheckProviderCostEntry(tx as never, input);
    await writeRankCheckProviderCostEntry(tx as never, input);

    expect(rows).toHaveLength(1);
    expect(tx.providerCostEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ providerRequestId: "provider_request_1", usageQuantity: 3 }),
      ],
      skipDuplicates: true,
    });
    expect(warning).toHaveBeenCalledTimes(2);
  });
});
