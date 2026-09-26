import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiContext } from "./context";
import { listProviderBudgets, updateProviderBudgets } from "./provider-budgets";

const mocks = vi.hoisted(() => ({
  findConnection: vi.fn(),
  findProject: vi.fn(),
  setAllocation: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.findProject },
    providerConnection: { findUnique: mocks.findConnection },
  },
}));
vi.mock("@/lib/provider-allocations/service", () => ({
  setProviderConnectionAllocation: mocks.setAllocation,
}));

const CONNECTION_ID = "conn_abcdefghijklmnopqrstuvwx";

function context(body?: unknown, method: "GET" | "PATCH" = "PATCH", actorId: string | null = null) {
  const url = new URL("https://example.test/api/v1/projects/prj_1/provider-budgets");
  return {
    actor: { id: "key_actor", memberships: [{ projectId: "project_1", role: "admin" }] },
    actorId,
    auth: { project: { id: "project_1", publicId: "prj_1" } },
    headers: new Headers(),
    instance: "urn:test",
    method,
    path: [],
    req:
      method === "GET"
        ? new Request(url, { method })
        : new Request(url, { body: JSON.stringify(body), method }),
    url,
  } as unknown as ApiContext;
}

function hostedConnection() {
  return {
    allocationAmountPerMonth: 3000,
    allocationUnit: "cents",
    credentialSource: "hosted",
    creditsAllocationAmountPerMonth: 1200,
    creditsProgrammaticAllocationAmountPerMonth: 500,
    enabled: true,
    id: "internal_conn",
    priority: 0,
    programmaticAllocationAmountPerMonth: null,
    provider: "dataforseo",
    publicId: CONNECTION_ID,
    status: "connected",
  };
}

describe("provider budgets REST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findProject.mockResolvedValue({
      budgetCapCents: 5000,
      providerAllocationsInitializedAt: new Date("2026-09-01T00:00:00Z"),
      providerConnections: [hostedConnection()],
    });
    mocks.findConnection.mockResolvedValue({ publicId: CONNECTION_ID });
    mocks.setAllocation.mockResolvedValue(undefined);
  });

  it("lists own-keys and credits budgets side by side", async () => {
    const response = await listProviderBudgets(context(undefined, "GET"), "prj_1");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [
        {
          connection_id: CONNECTION_ID,
          credential_source: "hosted",
          credits: {
            app: { amount_per_month: 1200, unit: "cents" },
            programmatic: { amount_per_month: 500, unit: "cents" },
          },
          own: { app: { amount_per_month: 3000, unit: "cents" }, programmatic: null },
          provider: "dataforseo",
          source: "connection",
        },
      ],
    });
  });

  it("refuses a project outside the credential scope", async () => {
    const response = await listProviderBudgets(context(undefined, "GET"), "prj_other");
    expect(response.status).toBe(403);
    expect(mocks.findProject).not.toHaveBeenCalled();
  });

  it("updates only the budgets present in the patch, through the allocation service", async () => {
    const response = await updateProviderBudgets(
      context({
        credits: { app: { amount_per_month: 2500, unit: "cents" } },
        own: { programmatic: null },
      }),
      "prj_1",
      "dataforseo",
    );

    expect(response.status).toBe(200);
    expect(mocks.setAllocation).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ id: "key_actor" }),
        allocations: {
          credits: { app: { amountPerMonth: 2500, unit: "cents" } },
          programmatic: null,
        },
        auditActorId: null,
        connectionPublicId: CONNECTION_ID,
        projectPublicId: "prj_1",
      }),
    );
  });

  it("rejects a credits budget that is not money", async () => {
    await expect(
      updateProviderBudgets(
        context({ credits: { app: { amount_per_month: 10, unit: "units" } } }),
        "prj_1",
        "dataforseo",
      ),
    ).rejects.toThrow();
    expect(mocks.setAllocation).not.toHaveBeenCalled();
  });

  it("reports a missing connection as not found", async () => {
    mocks.findConnection.mockResolvedValue(null);
    await expect(
      updateProviderBudgets(context({ own: { app: null } }), "prj_1", "dataforseo"),
    ).rejects.toThrow(/not found/i);
    expect(mocks.setAllocation).not.toHaveBeenCalled();
  });
});
