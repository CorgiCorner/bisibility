import type { Prisma } from "@/lib/generated/prisma/client";
import type { Budget, BudgetStatus } from "@usagekit/core";
import { describe, expect, it, vi } from "vitest";
import { allocationRows } from "./allocations";
import { loadProviderUiState, type ProviderUiState } from "./state";

const host = vi.hoisted(() => ({ own: vi.fn(async () => null) }));
vi.mock("@/lib/metering/own-budget-read", () => ({ readOwnConnectionBudgetSnapshot: host.own }));
vi.mock("@/lib/metering/spending-limit-store", () => ({ readSpendingBudgets: async () => [] }));
vi.mock("./allocation-extension", () => ({
  platformAllocationProviders: async () => [],
  platformAllocationEvidence: async () => [],
}));

const budget: Budget = {
  id: "own-connection:internal:app",
  version: 1,
  scope: { kind: "tag", namespace: "n", tag: "trusted" },
  surface: "app",
  unit: "units",
  limit: { unit: "units", scale: 6, value: 137000000n },
  window: { kind: "calendar_month", timezone: "UTC" },
  onExceed: "block",
};
const zero = { unit: "units", scale: 0, value: 0n };
const status: BudgetStatus = {
  budget,
  used: zero,
  reserved: zero,
  remaining: budget.limit,
  epoch: {
    epoch: "2026-10",
    startsAt: "2026-10-01T00:00:00.000Z",
    endsAt: "2026-11-01T00:00:00.000Z",
  },
};
function state(known = true, change = {}) {
  return {
    actor: { id: "owner" },
    project: {
      id: "project",
      ownerId: "owner",
      publicId: "prj_abcdefghijklmnopqrstuvwx",
      providerUiRevision: 1n,
    },
    projectLabel: "webscraping",
    binding: { scopeKey: "trusted", canManage: true },
    revision: "revision",
    budgets: [budget],
    platforms: [],
    platformEvidence: [],
    connections: [
      {
        id: "internal",
        publicId: "conn_abcdefghijklmnopqrstuvwx",
        provider: "serpapi",
        credentialSource: "own",
        providerUiRevision: "1",
      },
    ],
    ownEvidence: [
      {
        binding: {
          namespace: "n",
          principal: "owner",
          group: "project",
          connection: "internal",
          publicConnection: "conn_abcdefghijklmnopqrstuvwx",
          provider: "serpapi",
          credentialVersion: "version",
          tag: "trusted",
          unit: "units",
          ...change,
        },
        budgets: [{ status, figuresKnown: known }],
      },
    ],
  } as unknown as ProviderUiState;
}
describe("internal allocation counter projection", () => {
  it("shows local cap/zero/reservations and useful context separately from provider balance", () => {
    const row = allocationRows(state())[0];
    expect(row).toMatchObject({
      limit: { text: "137" },
      used: { text: "0", certainty: "measured" },
      reserved: { text: "0", certainty: "measured" },
      remaining: { text: "137", certainty: "measured" },
    });
    expect(row.label).toContain("SerpApi");
    expect(row.label).toContain("webscraping");
    expect(row.label).not.toContain("conn_");
  });
  it.each([
    { principal: "foreign" },
    { provider: "foreign" },
    { publicConnection: "conn_foreign" },
    { connection: "other" },
  ])("keeps missing/unproven/foreign evidence unknown %#", (change) => {
    const row = allocationRows(state(true, change))[0];
    expect(row.used).toMatchObject({ certainty: "unknown" });
    expect(row.reserved).toMatchObject({ certainty: "unknown" });
    expect(row.remaining).toMatchObject({ certainty: "unknown" });
  });
  it("keeps unverified local counters unknown", () => {
    expect(allocationRows(state(false))[0].used).toMatchObject({ certainty: "unknown" });
  });
});

it("does not read own counters for a downgraded billing membership despite owner identity", async () => {
  host.own.mockClear();
  const tx = {
    project: {
      findUnique: async () => ({ id: "project", name: "webscraping" }),
      findUniqueOrThrow: async () => ({
        id: "project",
        publicId: "prj_abcdefghijklmnopqrstuvwx",
        ownerId: "owner",
        isSample: false,
        writeMode: "active",
        providerUiRevision: 1n,
      }),
    },
    $queryRaw: async (parts: TemplateStringsArray) => {
      const text = parts.join("");
      if (text.includes("FROM users")) return [{ role: "owner", deactivatedAt: null }];
      if (text.includes("FROM memberships")) return [{ projectId: "project", role: "viewer" }];
      if (text.includes("FROM provider_connections"))
        return [
          {
            id: "internal",
            publicId: "conn_abcdefghijklmnopqrstuvwx",
            provider: "serpapi",
            status: "connected",
            enabled: true,
            priority: 0,
            credentialSource: "own",
            hasStoredCredentials: true,
            providerUiRevision: "1",
            updatedAt: new Date(),
            rates: [],
          },
        ];
      if (text.includes("FROM provider_ui_authority")) return [{ instanceId: "authority" }];
      throw new Error("Unexpected scope fixture read");
    },
  } as unknown as Prisma.TransactionClient;
  const result = await loadProviderUiState(
    tx,
    { id: "owner" },
    "prj_abcdefghijklmnopqrstuvwx",
    "read",
  );
  expect(result.binding.canManage).toBe(false);
  expect(host.own).not.toHaveBeenCalled();
});
