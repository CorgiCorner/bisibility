import type { ProviderCatalogEntry } from "@/lib/providers/types";
import { describe, expect, it, vi } from "vitest";
import { readProjectProviderAllocations } from "./repository";

const catalog = [
  {
    allocation: {
      allocationUnit: "cents",
      billing: "metered",
      kind: "billable",
      quotaReset: "none",
    },
    defaultStatus: "ready",
    id: "metered",
    kind: "serp",
    label: "Metered",
  },
] as const satisfies readonly ProviderCatalogEntry[];

describe("provider allocation repository", () => {
  it("reads effective allocations by internal project id", async () => {
    const db = {
      project: {
        findUnique: vi.fn().mockResolvedValue({
          budgetCapCents: 5000,
          providerAllocationsInitializedAt: null,
          providerConnections: [
            {
              allocationAmountPerMonth: null,
              allocationUnit: null,
              enabled: true,
              id: "connection_1",
              priority: 0,
              provider: "metered",
              status: "connected",
            },
          ],
        }),
      },
    };
    await expect(
      readProjectProviderAllocations("project_1", catalog, db as never),
    ).resolves.toEqual([
      {
        allocation: { amountPerMonth: 5000, unit: "cents" },
        internalConnectionId: "connection_1",
        source: "legacy_project",
      },
    ]);
    expect(db.project.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "project_1" } }),
    );
  });
});
