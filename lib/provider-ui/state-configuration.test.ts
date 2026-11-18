import type { Prisma, Role } from "@/lib/generated/prisma/client";
import { ProviderBudgetFundingError } from "@/lib/provider-allocations/validation";
import { NATIVE_MODEL_PROVIDERS } from "@/lib/providers/model/types";
import { beforeEach, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  budgets: vi.fn(),
  put: vi.fn(),
  mutate: vi.fn(),
  role: "owner" as Role,
  provider: "dataforseo" as string,
  retained: vi.fn(),
  retain: vi.fn(),
  own: vi.fn(),
  evidence: vi.fn(),
}));
vi.mock("@/lib/metering/own-budget-read", () => ({ readOwnConnectionBudgetSnapshot: host.own }));
vi.mock("@/lib/metering/spending-limit-store", () => ({
  readSpendingBudgets: host.budgets,
  putSpendingBudget: host.put,
}));
vi.mock("./allocation-extension", () => ({
  platformAllocationProviders: async () => ["dataforseo"],
  platformAllocationEvidence: host.evidence,
}));

vi.mock("@/lib/provider-allocations/project-lock", () => ({
  lockProjectForProviderMutation: vi.fn(),
}));
vi.mock("./mutate", () => ({ mutateProviderUi: host.mutate }));
vi.mock("./journal", () => ({ retainedCommand: host.retained, retainCommand: host.retain }));

import { createProviderUiService } from "./service";
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
    if (text.includes("FROM users")) return [{ role: host.role, deactivatedAt: null }];
    if (text.includes("FROM memberships")) return [{ projectId: "project", role: host.role }];
    if (text.includes("FROM provider_connections"))
      return [
        {
          id: "connection",
          publicId: "conn_abcdefghijklmnopqrstuvwx",
          provider: host.provider,
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
  host.provider = "dataforseo";
  host.role = "owner";
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

it.each(
  NATIVE_MODEL_PROVIDERS.flatMap((provider) =>
    ["app", "programmatic"].flatMap((surface) =>
      [undefined, null, "100"].flatMap((limit) =>
        ["owner", "viewer"].map((role) => ({ provider, surface, limit, role: role as Role })),
      ),
    ),
  ),
)(
  "$provider bulk credits $surface=$limit for $role refuses before budget IO",
  async ({ provider, surface, limit, role }) => {
    host.role = role;
    host.provider = provider;
    const service = createProviderUiService({
      $transaction: async (run: (client: typeof tx) => unknown) => run(tx),
    } as never);
    const command = {
      kind: "allocations",
      commandId: "fixture-bulk-command",
      expectedRevision: "a".repeat(64),
      changes: [
        {
          rowId: `conn_abcdefghijklmnopqrstuvwx:platform:${surface}`,
          expectedRevision: "b".repeat(64),
          limit,
        },
      ],
    };
    expect(
      await service.execute({ actor: { id: "owner" }, projectPublicId: project.publicId }, command),
    ).toEqual(
      role === "owner"
        ? {
            commandId: command.commandId,
            outcome: "invalid",
            field: "command",
            reason: "Model providers support own-key budgets only.",
          }
        : { commandId: command.commandId, outcome: "forbidden" },
    );
    if (role === "owner")
      await expect(
        loadProviderUiState(tx, { id: "owner" }, project.publicId, "mutation", {
          allocationChanges: command.changes,
        }),
      ).rejects.toThrow(new ProviderBudgetFundingError());
    expect(host.budgets).not.toHaveBeenCalled();
    expect(host.put).not.toHaveBeenCalled();
    expect(host.mutate).not.toHaveBeenCalled();
    expect(host.evidence).not.toHaveBeenCalled();
    expect(host.retained).not.toHaveBeenCalled();
    expect(host.retain).not.toHaveBeenCalled();
  },
);

it("retains own-key bulk reads for model connections", async () => {
  host.provider = "openai";
  await loadProviderUiState(tx, { id: "owner" }, project.publicId, "mutation", {
    financialEvidence: false,
    allocationChanges: [
      {
        rowId: "conn_abcdefghijklmnopqrstuvwx:byok:app",
        expectedRevision: "a".repeat(64),
        limit: "100",
      },
    ],
  });
  expect(host.budgets).toHaveBeenCalledOnce();
});

it("keeps legacy bulk platform changes on the budget-read path", async () => {
  await loadProviderUiState(tx, { id: "owner" }, project.publicId, "mutation", {
    financialEvidence: false,
    allocationChanges: [
      {
        rowId: "conn_abcdefghijklmnopqrstuvwx:platform:app",
        expectedRevision: "a".repeat(64),
        limit: "100",
      },
    ],
  });
  expect(host.budgets).toHaveBeenCalledOnce();
});
