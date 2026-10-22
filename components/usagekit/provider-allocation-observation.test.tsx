import type { AllocationNativeObservation } from "@/lib/provider-ui/native-allocation-evidence";
import { act, renderHook } from "@testing-library/react";
import type { ProviderAllocationRow } from "@usagekit/views";
import { allocationLimitFromAvailable } from "@usagekit/views";
import { expect, it, vi } from "vitest";
import { useAllocationObservation } from "./provider-allocation-observation";

const amount = (text: string) => ({ text, unit: "cents", certainty: "measured" as const });
const row: ProviderAllocationRow = {
  id: "row",
  connectionId: "conn",
  revision: "rev",
  label: "DataForSEO",
  fundingSource: "byok",
  surface: "app",
  unit: "cents",
  used: amount("4"),
  reserved: amount("2"),
  remaining: amount("94"),
  limit: amount("100"),
  unlimited: false,
  editable: true,
};
function native(): AllocationNativeObservation {
  return {
    identity: row,
    value: { text: "0.99", unit: "USD", certainty: "measured" },
    observedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
}
it("makes measured native balance available for the existing used-plus-balance suggestion after an explicit refresh", async () => {
  const refresh = vi.fn(async () => native());
  const { result } = renderHook(() =>
    useAllocationObservation({
      evidence: row,
      editable: true,
      onRefreshNative: refresh,
      beginRefresh: () => () => {},
    }),
  );
  await act(() => result.current.refresh());
  expect(result.current.availability?.available).toEqual(amount("99"));
  const evidence = result.current.availability;
  if (!evidence?.available || !evidence.availabilityBasis)
    throw new Error("Missing native evidence");
  const proposal = allocationLimitFromAvailable({
    used: evidence.used,
    reserved: evidence.reserved,
    available: evidence.available,
    availabilityBasis: evidence.availabilityBasis,
  });
  expect(proposal.outcome === "ready" && proposal.limit.text).toBe("103");
  expect(refresh).toHaveBeenCalledOnce();
});
it("uses initial cached native evidence without probing on open", () => {
  const refresh = vi.fn();
  const { result } = renderHook(() =>
    useAllocationObservation({
      evidence: { ...row, nativeObservation: native() } as ProviderAllocationRow,
      editable: true,
      onRefreshNative: refresh,
      beginRefresh: () => () => {},
    }),
  );
  expect(result.current.availability?.available).toEqual(amount("99"));
  expect(refresh).not.toHaveBeenCalled();
});
