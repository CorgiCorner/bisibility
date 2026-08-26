import { afterEach, describe, expect, it, vi } from "vitest";
import { writeRankCheckProviderCostEntry } from "./provider-cost-persistence";

vi.mock("server-only", () => ({}));

describe("writeRankCheckProviderCostEntry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
