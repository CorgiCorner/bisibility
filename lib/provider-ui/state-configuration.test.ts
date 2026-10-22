import type { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  budgets: vi.fn(),
  own: vi.fn(),
  evidence: vi.fn(),
}));
vi.mock("@/lib/metering/own-budget-read", () => ({ readOwnConnectionBudgetSnapshot: host.own }));
vi.mock("@/lib/metering/spending-limit-store", () => ({ readSpendingBudgets: host.budgets }));
vi.mock("./allocation-extension", () => ({
  platformAllocationProviders: async () => ["dataforseo"],
  platformAllocationEvidence: host.evidence,
}));

import { loadProviderUiState } from "./state";

const project = {
  id: "project",
  publicId: "prj_abcdefghijklmnopqrstuvwx",
  ownerId: "owner",
  isSample: false,
  writeMode: "active",
  providerUiRevision: 1n,
};
const tx = {
  project: {
    findUnique: async () => ({ id: "project", name: "Project" }),
    findUniqueOrThrow: async () => project,
  },
  $queryRaw: async (parts: TemplateStringsArray) => {
    const text = parts.join("");
    if (text.includes("FROM users")) return [{ role: "owner", deactivatedAt: null }];
    if (text.includes("FROM memberships")) return [{ projectId: "project", role: "owner" }];
    if (text.includes("FROM provider_connections"))
      return [
        {
          id: "connection",
          publicId: "conn_abcdefghijklmnopqrstuvwx",
          provider: "dataforseo",
          credentialSource: "own",
          providerUiRevision: "1",
          status: "connected",
          enabled: true,
          priority: 0,
          updatedAt: new Date(),
          rates: [],
        },
      ];
    if (text.includes("FROM provider_ui_authority")) return [{ instanceId: "authority" }];
    throw new Error("Unexpected configuration query");
  },
} as unknown as Prisma.TransactionClient;

beforeEach(() => {
  vi.resetAllMocks();
  host.budgets.mockResolvedValue([]);
  host.own.mockRejectedValue(new Error("Financial evidence unavailable"));
  host.evidence.mockRejectedValue(new Error("Financial evidence unavailable"));
});

it("loads provider authority without depending on budget or usage reads", async () => {
  host.budgets.mockRejectedValue(new Error("Budget read unavailable"));
  const state = await loadProviderUiState(tx, { id: "owner" }, project.publicId, "binding");
  expect(state.binding.canManage).toBe(true);
  expect(host.budgets).not.toHaveBeenCalled();
  expect(host.own).not.toHaveBeenCalled();
  expect(host.evidence).not.toHaveBeenCalled();
});

it("keeps connection revisions while excluding financial evidence from configuration reads", async () => {
  const state = await loadProviderUiState(tx, { id: "owner" }, project.publicId, "read", {
    financialEvidence: false,
  });
  expect(state.connections).toHaveLength(1);
  expect(host.budgets).toHaveBeenCalledOnce();
  expect(host.own).not.toHaveBeenCalled();
  expect(host.evidence).not.toHaveBeenCalled();
});

it("still refuses an allocation read when financial evidence is unavailable", async () => {
  await expect(loadProviderUiState(tx, { id: "owner" }, project.publicId, "read")).rejects.toThrow(
    "Financial evidence unavailable",
  );
});
