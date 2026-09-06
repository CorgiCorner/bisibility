import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ assertAllocation: vi.fn() }));
const { AllocationExhaustedError } = vi.hoisted(() => ({
  AllocationExhaustedError: class extends Error {},
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/provider-usage/enforcement", () => ({
  assertProviderAllocationAvailable: mocks.assertAllocation,
  ProviderAllocationExhaustedError: AllocationExhaustedError,
}));

import { wrapLegacyRankCheck } from "./legacy-wrap";

const now = new Date("2026-09-04T12:00:00.000Z");
const reservation = {
  allocationConnection: { id: "connection_1", provider: "serpapi" },
  depth: 10 as const,
  estimatedCostCents: 1,
  keywordPublicId: "kw_1",
  projectId: "project_1",
  providerAllocationsInitializedAt: true,
};

describe("legacy scheduled run allocation", () => {
  it("admits only one concurrent legacy scheduled check into one initialized unit", async () => {
    mocks.assertAllocation.mockResolvedValue({ mode: "allocation", remaining: 1, unit: "units" });
    const persisted: Array<{ estimatedCostCents: number; selectionSpec: unknown }> = [];
    let connectionTail = Promise.resolve();
    const wrap = async (rankCheckId: string) => {
      let release!: () => void;
      const tx = {
        $queryRaw: vi.fn(async () => {
          const previous = connectionTail;
          connectionTail = new Promise((done) => {
            release = done;
          });
          await previous;
          return [];
        }),
        rankCheck: { update: vi.fn() },
        rankCheckRun: {
          create: vi.fn(async ({ data }) => {
            persisted.push({
              estimatedCostCents: data.estimatedCostCents,
              selectionSpec: data.selectionSpec,
            });
            return { id: `run_${persisted.length}` };
          }),
          findMany: vi.fn(async () => persisted),
        },
      };
      try {
        await wrapLegacyRankCheck(
          tx as never,
          { keywordId: rankCheckId },
          rankCheckId,
          reservation,
          now,
        );
      } finally {
        release();
      }
    };

    const results = await Promise.allSettled([wrap("keyword_1"), wrap("keyword_2")]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(persisted).toEqual([
      {
        estimatedCostCents: 1,
        selectionSpec: {
          kind: "legacy_schedule",
          keywordId: "kw_1",
          providerAllocationQuantity: 1,
          providerConnectionId: "connection_1",
          v: 1,
        },
      },
    ]);
  });
});
