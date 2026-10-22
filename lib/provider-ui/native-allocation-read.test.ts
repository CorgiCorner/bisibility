import { beforeEach, expect, it, vi } from "vitest";
import type { NativeAllocationRow } from "./native-allocation-evidence";
import type { ProviderUiState } from "./state";

const host = vi.hoisted(() => ({ rows: vi.fn(), cached: vi.fn() }));
vi.mock("./allocations", () => ({ allocationRows: host.rows }));
vi.mock("@/lib/queries/provider-availability", () => ({
  readCachedProviderAvailability: host.cached,
}));

import { loadNativeAllocationRows } from "./native-allocation-read";

const amount = (text: string) => ({ text, unit: "units", certainty: "measured" as const });
const row: NativeAllocationRow = {
  id: "row",
  connectionId: "conn",
  revision: "rev",
  label: "SerpApi",
  fundingSource: "byok",
  surface: "app",
  unit: "units",
  limit: amount("300"),
  unlimited: false,
  used: amount("6"),
  reserved: amount("2"),
  remaining: amount("292"),
  editable: true,
};
const state = (usageReadable = true) =>
  ({
    usageReadable,
    nativeAllocationRows: [],
    connections: [{ publicId: "conn", credentialSource: "own" }],
  }) as unknown as ProviderUiState;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T17:00:00Z"));
  host.rows.mockReturnValue([row]);
  host.cached.mockResolvedValue({
    outcome: "ready",
    value: { text: "239", unit: "searches", certainty: "measured" },
    observedAt: "2026-10-21T16:59:00Z",
    expiresAt: "2026-10-21T17:14:00Z",
  });
});

import { afterEach } from "vitest";

afterEach(() => vi.useRealTimers());
it("hydrates the authorized owner's initial cached native balance in the allocation row unit", async () => {
  const snapshot = state();
  await loadNativeAllocationRows(snapshot, ["conn"]);
  expect(snapshot.nativeAllocationRows[0]).toMatchObject({
    available: amount("239"),
    availabilityBasis: "before_reservations",
    nativeObservation: { identity: { revision: "rev" } },
  });
  expect(host.cached).toHaveBeenCalledOnce();
});
it("keeps an editable non-owner's counters private and explains why without reading cache", async () => {
  const snapshot = state(false);
  await loadNativeAllocationRows(snapshot, ["conn"]);
  expect(snapshot.nativeAllocationRows[0]).toMatchObject({
    editable: true,
    availabilityReason: "owner_only",
  });
  expect(host.cached).not.toHaveBeenCalled();
});
it("retains unknown usage rather than inventing zero for the native proposal", async () => {
  host.rows.mockReturnValue([{ ...row, used: { text: "", unit: "units", certainty: "unknown" } }]);
  const snapshot = state();
  await loadNativeAllocationRows(snapshot, ["conn"]);
  expect(snapshot.nativeAllocationRows[0]).toMatchObject({
    availabilityReason: "usage_unavailable",
  });
  expect(snapshot.nativeAllocationRows[0].available).toBeUndefined();
});
it("does not read unrelated connection caches", async () => {
  const snapshot = state();
  await loadNativeAllocationRows(snapshot, ["foreign"]);
  expect(snapshot.nativeAllocationRows).toEqual([]);
  expect(host.cached).not.toHaveBeenCalled();
});
