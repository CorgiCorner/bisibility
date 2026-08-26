import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  providerSpend: vi.fn(),
  revalidate: vi.fn(),
  requireProject: vi.fn(),
  setAllocation: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.actor,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  revalidateBudgetViews: mocks.revalidate,
  requireProjectScope: mocks.requireProject,
}));
vi.mock("@/lib/provider-allocations/service", () => ({
  setProviderConnectionAllocation: mocks.setAllocation,
}));
vi.mock("@/lib/providers/registry", () => ({
  PROVIDER_CATALOG: [
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
  ],
}));
vi.mock("@/lib/queries/provider-spend", () => ({
  loadProjectProviderSpend: mocks.providerSpend,
}));

import { updateProviderConnectionAllocationAction } from "./provider-allocation";

const project = { id: "project_1", publicId: "prj_abcdefghijklmnopqrstuvwx" };
const actor = { id: "user_1", memberships: [], role: "admin" as const };
const connectionId = "conn_abcdefghijklmnopqrstuvwx";

describe("updateProviderConnectionAllocationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue(actor);
    mocks.requireProject.mockResolvedValue(project);
    mocks.setAllocation.mockResolvedValue(undefined);
    mocks.providerSpend.mockResolvedValue({
      connections: [{ allocation: { amountPerMonth: 2500, unit: "cents" }, connectionId }],
    });
  });

  it("rejects authorization failures before calling the allocation service", async () => {
    mocks.requireProject.mockRejectedValueOnce(new Error("Forbidden"));

    await expect(
      updateProviderConnectionAllocationAction(project.publicId, {
        allocation: { amountDollars: "25.00", unit: "cents" },
        connectionId,
      }),
    ).rejects.toThrow("Forbidden");

    expect(mocks.setAllocation).not.toHaveBeenCalled();
  });

  it("rejects invalid amounts before reading the actor", async () => {
    await expect(
      updateProviderConnectionAllocationAction(project.publicId, {
        allocation: { amount: 0, unit: "units" },
        connectionId,
      }),
    ).rejects.toThrow();

    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.setAllocation).not.toHaveBeenCalled();
  });

  it("passes a null allocation through for no cap", async () => {
    mocks.providerSpend.mockResolvedValue({ connections: [{ allocation: null, connectionId }] });

    await expect(
      updateProviderConnectionAllocationAction(project.publicId, {
        allocation: null,
        connectionId,
      }),
    ).resolves.toEqual({ allocation: null, connectionId });

    expect(mocks.setAllocation).toHaveBeenCalledWith({
      actor,
      allocation: null,
      catalog: expect.arrayContaining([expect.objectContaining({ id: "metered" })]),
      connectionPublicId: connectionId,
      projectPublicId: project.publicId,
    });
  });

  it("converts dollars to cents, uses the registry catalog, and returns the refreshed row", async () => {
    await expect(
      updateProviderConnectionAllocationAction(project.publicId, {
        allocation: { amountDollars: "25.00", unit: "cents" },
        connectionId,
      }),
    ).resolves.toEqual({ allocation: { amountPerMonth: 2500, unit: "cents" }, connectionId });

    expect(mocks.requireProject).toHaveBeenCalledWith(actor, "manage", project.publicId, {
      type: "provider_connection",
    });
    expect(mocks.setAllocation).toHaveBeenCalledWith({
      actor,
      allocation: { amountPerMonth: 2500, unit: "cents" },
      catalog: expect.arrayContaining([expect.objectContaining({ id: "metered" })]),
      connectionPublicId: connectionId,
      projectPublicId: project.publicId,
    });
    expect(mocks.revalidate).toHaveBeenCalledOnce();
    expect(mocks.providerSpend).toHaveBeenCalledWith(
      expect.objectContaining({ catalog: expect.any(Array), projectId: "project_1" }),
    );
  });
});
