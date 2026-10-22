import type { ProviderSpendConnection } from "@/lib/queries/provider-spend-types";
import type { ProviderAllocationRow } from "@usagekit/views";
import { beforeEach, expect, it, vi } from "vitest";
import type { ProviderUiState } from "./state";

const host = vi.hoisted(() => ({ rows: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("./state", () => ({ loadProviderUiState: vi.fn() }));
vi.mock("./allocations", () => ({ allocationRows: host.rows }));
vi.mock("@/lib/queries/provider-availability", () => ({
  providerAvailabilityExpiry: () => "2026-10-21T17:14:00Z",
}));

import { refreshBoundNativeAllocation } from "./native-allocation-refresh";

const scope = { actor: { id: "owner" }, projectPublicId: "project" };
const row = {
  id: "row",
  connectionId: "conn",
  fundingSource: "byok",
  surface: "app",
  unit: "units",
  revision: "rev",
  editable: true,
} as ProviderAllocationRow;
const identity = {
  id: row.id,
  connectionId: row.connectionId,
  fundingSource: row.fundingSource,
  surface: row.surface,
  unit: row.unit,
  revision: row.revision,
};
const state = (change = {}) =>
  ({
    usageReadable: true,
    actor: { id: "owner" },
    project: { ownerId: "owner" },
    binding: { canManage: true },
    connections: [
      {
        publicId: "conn",
        provider: "serpapi",
        credentialSource: "own",
        status: "connected",
        hasStoredCredentials: true,
        updatedAt: new Date("2026-10-01Z"),
      },
    ],
    ...change,
  }) as ProviderUiState;
const result = {
  connectionId: "conn",
  credentialSource: "own",
  providerId: "serpapi",
  availableAtProvider: {
    status: "available",
    amount: 239,
    unit: "searches",
    checkedAt: "2026-10-21T16:59:00Z",
  },
} as ProviderSpendConnection;
beforeEach(() => {
  vi.resetAllMocks();
  host.rows.mockReturnValue([row]);
});
it("binds a native measurement to an authorized row between closed read snapshots", async () => {
  const read = vi.fn().mockResolvedValue(state());
  const probe = vi.fn().mockResolvedValue(result);
  await expect(
    refreshBoundNativeAllocation(scope, "conn", identity, probe, read),
  ).resolves.toMatchObject({
    nativeObservation: {
      identity,
      value: { text: "239", unit: "searches", certainty: "measured" },
    },
  });
  expect(read).toHaveBeenCalledTimes(2);
  expect(probe).toHaveBeenCalledOnce();
  expect(read.mock.invocationCallOrder[0]).toBeLessThan(probe.mock.invocationCallOrder[0]);
  expect(read.mock.invocationCallOrder[1]).toBeGreaterThan(probe.mock.invocationCallOrder[0]);
});
it.each([{ usageReadable: false }, { actor: { id: "member" } }, { binding: { canManage: false } }])(
  "rejects unauthorized probes before provider access: %j",
  async (change) => {
    const probe = vi.fn();
    await expect(
      refreshBoundNativeAllocation(
        scope,
        "conn",
        identity,
        probe,
        vi.fn().mockResolvedValue(state(change)),
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(probe).not.toHaveBeenCalled();
  },
);
it("rejects a malformed or foreign requested row before reading credentials", async () => {
  const probe = vi.fn();
  const read = vi.fn();
  await expect(
    refreshBoundNativeAllocation(scope, "conn", { ...identity, injected: true }, probe, read),
  ).rejects.toThrow();
  await expect(
    refreshBoundNativeAllocation(scope, "foreign", identity, probe, read),
  ).rejects.toMatchObject({ code: "forbidden" });
  expect(read).not.toHaveBeenCalled();
  expect(probe).not.toHaveBeenCalled();
});
it.each(["epoch", "revision", "owner"])("rejects a %s change during the probe", async (kind) => {
  const after = state();
  if (kind === "epoch") after.connections[0].updatedAt = new Date("2026-10-02Z");
  if (kind === "owner") after.project.ownerId = "new-owner";
  const read = vi.fn().mockResolvedValueOnce(state()).mockResolvedValueOnce(after);
  if (kind === "revision")
    host.rows.mockReturnValueOnce([row]).mockReturnValueOnce([{ ...row, revision: "new-rev" }]);
  await expect(
    refreshBoundNativeAllocation(scope, "conn", identity, vi.fn().mockResolvedValue(result), read),
  ).rejects.toThrow();
});
it.each([
  { connectionId: "foreign" },
  { credentialSource: "hosted" },
  { providerId: "dataforseo" },
])("never attaches a different returned connection's account evidence: %j", async (change) => {
  await expect(
    refreshBoundNativeAllocation(
      scope,
      "conn",
      identity,
      vi.fn().mockResolvedValue({ ...result, ...change }),
      vi.fn().mockResolvedValue(state()),
    ),
  ).rejects.toThrow("Provider settings changed");
});
