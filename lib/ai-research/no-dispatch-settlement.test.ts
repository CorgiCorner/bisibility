import type { Prisma } from "@/lib/generated/prisma/client";
import { assertProviderAllocationAvailable } from "@/lib/provider-usage/enforcement";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sync: vi.fn(), committed: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/metering/entry-sync", () => ({ syncUsageEntry: mocks.sync }));
vi.mock("@/lib/providers/execution-authority", () => ({
  readDeploymentMeteringPreflightAuthority: vi.fn(async () => "legacy"),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      const result = await run(client);
      mocks.committed = true;
      return result;
    },
  },
}));

import {
  settleLateNoDispatch,
  settleNoDispatch,
  settleNoDispatchInTransaction,
} from "./no-dispatch-settlement";

const base = {
  id: "entry",
  projectId: "project",
  connectionId: "connection",
  provider: "dataforseo",
  feature: "prompt_explorer",
  credentialSource: "own",
  tag: "proven-no-post",
  measurementStatus: "unknown",
  providerRequestId: null,
  costCents: 0,
  usageQuantity: null,
  failed: true,
};
let rows: Record<string, unknown>[] = [];
let proofs: string[] = [];
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) =>
    typeof value === "object" && value !== null && "in" in value
      ? (value.in as unknown[]).includes(row[key])
      : typeof value === "object" && value !== null && "not" in value
        ? row[key] !== value.not
        : row[key] === value,
  );
}
const client = {
  agentReport: {
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: {
          projectId: string;
          kind: string;
          AND: { provenance: { path: string[]; equals?: string; array_contains?: string[] } }[];
        };
      }) => {
        expect(where.projectId).toBe("project");
        expect(where.kind).toBe("prompt_explorer");
        expect(where.AND.slice(0, 3).map((clause) => clause.provenance.equals)).toEqual([
          "provider_actual_cost",
          "refused",
          "connection",
        ]);
        const tag = where.AND[3].provenance.array_contains?.[0];
        return tag && proofs.includes(tag) ? { id: "trusted-producer-report" } : null;
      },
    ),
  },
  providerCostEntry: {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      rows.filter((row) => matches(row, where)),
    ),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: object }) => {
      const selected = rows.filter((row) => matches(row, where));
      selected.forEach((row) => {
        Object.assign(row, data);
      });
      return { count: selected.length };
    }),
  },
};
const scope = { projectId: "project", connectionId: "connection", tags: ["proven-no-post"] };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.committed = false;
  rows = [{ ...base }];
  proofs = [];
});
it("settles only the explicitly proven unknown own AI tag and synchronizes after commit", async () => {
  for (const changed of [
    { projectId: "other" },
    { connectionId: "other" },
    { provider: "other" },
    { feature: "ai_visibility" },
    { credentialSource: "hosted" },
    { tag: "possibly-dispatched" },
    { measurementStatus: "recorded", costCents: 12 },
    { providerRequestId: "paid-task" },
  ])
    rows.push({ ...base, id: `excluded-${rows.length}`, ...changed });
  mocks.sync.mockImplementation(() => {
    expect(mocks.committed).toBe(true);
  });
  await settleNoDispatch(scope);
  expect(rows[0]).toMatchObject({
    measurementStatus: "recorded",
    costCents: 0,
    usageQuantity: 0,
    failed: true,
  });
  expect(rows.slice(1).filter((row) => row.measurementStatus === "unknown")).toHaveLength(7);
  expect(rows.find((row) => row.costCents === 12)?.measurementStatus).toBe("recorded");
  expect(mocks.sync).toHaveBeenCalledExactlyOnceWith("entry");
  await settleNoDispatch(scope);
  expect(mocks.sync).toHaveBeenCalledTimes(1);
});
it("leaves possibly dispatched rows untouched and removes a known-no-POST allocation barrier", async () => {
  const catalog = [
    {
      id: "dataforseo",
      label: "DataForSEO",
      kind: "serp",
      defaultStatus: "ready",
      allocation: {
        kind: "billable",
        billing: "metered",
        allocationUnit: "cents",
        quotaReset: "none",
      },
    },
  ] as const;
  const db = {
    project: {
      findUnique: vi.fn(async () => ({
        budgetCapCents: 50,
        providerAllocationsInitializedAt: new Date(),
      })),
    },
    providerConnection: {
      findFirst: vi.fn(async () => ({
        credentialSource: "own",
        allocationAmountPerMonth: 10,
        allocationUnit: "cents",
      })),
    },
    providerCostEntry: {
      aggregate: vi.fn(async () => ({
        _count: { _all: rows.filter((row) => row.measurementStatus === "recorded").length },
        _sum: { costCents: 0 },
      })),
      count: vi.fn(async () => rows.filter((row) => row.measurementStatus !== "recorded").length),
      groupBy: vi.fn(async () => []),
    },
  };
  const admission = {
    catalog,
    projectId: "project",
    connectionId: "connection",
    provider: "dataforseo",
    surface: "app" as const,
    estimatedCostCents: 1,
  };
  await expect(
    assertProviderAllocationAvailable(
      admission,
      db as unknown as Parameters<typeof assertProviderAllocationAvailable>[1],
    ),
  ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
  await settleNoDispatchInTransaction(client as unknown as Prisma.TransactionClient, scope);
  await expect(
    assertProviderAllocationAvailable(
      admission,
      db as unknown as Parameters<typeof assertProviderAllocationAvailable>[1],
    ),
  ).resolves.toMatchObject({
    remaining: 10,
  });
  rows.push({ ...base, id: "possibly-paid", tag: "possibly-dispatched" });
  await settleNoDispatchInTransaction(client as unknown as Prisma.TransactionClient, scope);
  await expect(
    assertProviderAllocationAvailable(
      admission,
      db as unknown as Parameters<typeof assertProviderAllocationAvailable>[1],
    ),
  ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
});

it("recovers a late unknown row for a new UUID only when scoped producer proof confirms no POST", async () => {
  proofs = ["proven-no-post"];
  rows.push({ ...base, id: "actual-unknown", tag: "possibly-dispatched" });
  const ids = await settleLateNoDispatch(
    client as unknown as Prisma.TransactionClient,
    "project",
    "connection",
  );
  expect(ids).toEqual(["entry"]);
  expect(rows[0]).toMatchObject({ measurementStatus: "recorded", costCents: 0 });
  expect(rows[1].measurementStatus).toBe("unknown");
  expect(client.providerCostEntry.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      take: 10,
      where: expect.objectContaining({
        projectId: "project",
        connectionId: "connection",
        provider: "dataforseo",
        feature: "prompt_explorer",
        credentialSource: "own",
        providerRequestId: null,
      }),
    }),
  );
});
