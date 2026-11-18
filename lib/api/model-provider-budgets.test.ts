import { updateProviderConnectionAllocationAction } from "@/lib/actions/provider-allocation";
import { initializeConnectionBudgets } from "@/lib/provider-allocations/initialize";
import {
  setProviderConnectionAllocation,
  setProviderConnectionAllocationInTransaction,
} from "@/lib/provider-allocations/service";
import {
  ProviderBudgetFundingError,
  validateProviderConnectionAllocations,
} from "@/lib/provider-allocations/validation";
import { NATIVE_MODEL_PROVIDERS } from "@/lib/providers/model/types";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";

const f = vi.hoisted(() => ({
  read: vi.fn(async () => []),
  put: vi.fn(),
  audit: vi.fn(),
  db: {
    $queryRaw: vi.fn(async () => []),
    $transaction: vi.fn(),
    project: { findUnique: vi.fn() },
    providerConnection: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
}));
const projectId = "prj_a00000000000000000000000";
const connectionId = "conn_a00000000000000000000000";
const actor = { id: "actor", memberships: [{ projectId: "project", role: "admin" as const }] };
vi.mock("@/lib/db/prisma", () => ({ prisma: f.db }));
vi.mock("@/lib/metering/spending-limit-store", () => ({
  readSpendingBudgets: f.read,
  putSpendingBudget: f.put,
}));
vi.mock("@/lib/auth/audit", async (original) => ({ ...(await original()), writeAudit: f.audit }));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: async () => actor,
  requireProjectScope: async () => ({ id: "project", publicId: projectId, ownerId: "other" }),
  parseActionInput: (schema: { parse: (v: unknown) => unknown }, value: unknown) =>
    schema.parse(value),
  revalidateBudgetViews: vi.fn(),
}));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: vi.fn() }));
vi.mock("@/lib/queries/provider-spend", () => ({ loadProjectProviderSpend: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({
  ApiAuthError: class extends Error {},
  authenticateBearer: async () => ({
    kind: "project_key",
    creatorRole: "owner",
    apiKey: { id: "key", projectId: "project", scopes: ["read", "write"] },
    project: { id: "project", publicId: projectId },
  }),
}));
vi.mock("@/lib/api/ratelimit", () => ({
  checkRateLimit: async () => ({ headers: new Headers(), success: true }),
  rateLimitExceeded: vi.fn(),
}));
const message = "Model providers support own-key budgets only.";
function selectProvider(provider: string) {
  const row = {
    id: "connection",
    publicId: connectionId,
    provider,
    credentialSource: "own",
    enabled: true,
    priority: 0,
    status: "connected",
  };
  f.db.providerConnection.findFirst.mockResolvedValue(row);
  f.db.providerConnection.findUnique.mockResolvedValue(row);
  f.db.project.findUnique.mockResolvedValue({
    id: "project",
    publicId: projectId,
    isSample: false,
    writeMode: "active",
    providerConnections: [row],
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network");
    }),
  );
  f.db.$transaction.mockImplementation((run) => run(f.db));
});

afterEach(() => {
  try {
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it.each(
  NATIVE_MODEL_PROVIDERS.flatMap((provider) =>
    ["action", "service", "transaction", "REST"].map((surface) => ({ provider, surface })),
  ),
)("$provider refuses credits through $surface before budget IO", async ({ provider, surface }) => {
  selectProvider(provider);
  const allocations = { credits: { app: { amountPerMonth: 100, unit: "cents" as const } } };
  const input = {
    actor,
    allocations,
    catalog: PROVIDER_CATALOG,
    connectionPublicId: connectionId,
    projectPublicId: projectId,
  };
  if (surface === "action")
    await expect(
      updateProviderConnectionAllocationAction(projectId, {
        connectionId,
        creditsAllocation: { unit: "cents", amountDollars: "1.00" },
      }),
    ).rejects.toThrow(new ProviderBudgetFundingError());
  if (surface === "service")
    await expect(setProviderConnectionAllocation(input)).rejects.toThrow(
      new ProviderBudgetFundingError(),
    );
  if (surface === "transaction")
    await expect(
      setProviderConnectionAllocationInTransaction(f.db as never, input),
    ).rejects.toThrow(new ProviderBudgetFundingError());
  if (surface === "REST") {
    const path = ["projects", projectId, "providers", provider, "budgets"];
    const response = await handleApiRequest(
      new Request(`https://example.test/api/v1/${path.join("/")}`, {
        method: "PATCH",
        headers: { authorization: "Bearer fixture", "content-type": "application/json" },
        body: JSON.stringify(allocations),
      }),
      path,
    );
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(message);
    expect(f.db.providerConnection.findUnique).not.toHaveBeenCalled();
  }
  expect(f.read).not.toHaveBeenCalled();
  expect(f.put).not.toHaveBeenCalled();
  expect(f.audit).not.toHaveBeenCalled();
});

it.each(NATIVE_MODEL_PROVIDERS)(
  "%s validates both own-key surfaces and rejects every credits shape",
  async (provider) => {
    for (const credits of [
      {},
      { app: null },
      { programmatic: null },
      { programmatic: { amountPerMonth: 5, unit: "cents" as const } },
    ]) {
      expect(() =>
        validateProviderConnectionAllocations(PROVIDER_CATALOG, provider, { credits }),
      ).toThrow(new ProviderBudgetFundingError());
    }
    expect(() =>
      validateProviderConnectionAllocations(PROVIDER_CATALOG, provider, {
        app: { amountPerMonth: 5, unit: "units" },
      }),
    ).toThrow(TypeError);
    selectProvider(provider);
    await setProviderConnectionAllocation({
      actor,
      allocations: {
        app: { amountPerMonth: 200, unit: "cents" },
        programmatic: { amountPerMonth: 300, unit: "cents" },
      },
      catalog: PROVIDER_CATALOG,
      connectionPublicId: connectionId,
      projectPublicId: projectId,
    });
    expect(f.put.mock.calls.map(([, b]) => b.id)).toEqual([
      "own-connection:connection:app",
      "own-connection:connection:programmatic",
    ]);
  },
);

it.each(NATIVE_MODEL_PROVIDERS)(
  "%s refuses credits initialization before budget IO",
  async (id) => {
    const provider = PROVIDER_CATALOG.find((item) => item.id === id);
    if (!provider) throw new Error("Missing model provider fixture");
    await expect(
      initializeConnectionBudgets(
        f.db as never,
        { id: "connection", provider: id },
        provider,
        undefined,
        "platform",
      ),
    ).rejects.toThrow(new ProviderBudgetFundingError());
    expect(f.read).not.toHaveBeenCalled();
    expect(f.put).not.toHaveBeenCalled();
  },
);

it("preserves legacy credits budgets through action and REST", async () => {
  selectProvider("dataforseo");
  await updateProviderConnectionAllocationAction(projectId, {
    connectionId,
    creditsAllocation: { unit: "cents", amountDollars: "1.00" },
  });
  expect(f.put).toHaveBeenCalledTimes(1);
  expect(f.put.mock.calls[0][1].id).toBe("connection:connection:app");
  const path = ["projects", projectId, "providers", "dataforseo", "budgets"];
  const response = await handleApiRequest(
    new Request(`https://example.test/api/v1/${path.join("/")}`, {
      method: "PATCH",
      headers: { authorization: "Bearer fixture", "content-type": "application/json" },
      body: JSON.stringify({ credits: { programmatic: { amount_per_month: 200, unit: "cents" } } }),
    }),
    path,
  );
  expect(response.status).toBe(200);
  expect(f.put).toHaveBeenCalledTimes(2);
});
