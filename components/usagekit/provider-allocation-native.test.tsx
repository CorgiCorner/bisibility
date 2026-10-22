import { renderWithUsageSettingsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { NativeAllocationRow } from "@/lib/provider-ui/native-allocation-evidence";
import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AllocationRow, providerAllocationLabels } from "./provider-allocation-row";
import { providerFeedbackLabels } from "./provider-feedback";

const amount = (text: string) => ({ text, unit: "cents", certainty: "measured" as const });
const row: NativeAllocationRow = {
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
const probe = vi.fn();
function Harness() {
  const [draft, change] = useState({ limit: "1.00", unlimited: false });
  const nativeObservation = {
    identity: row,
    value: { text: "0.99", unit: "USD", certainty: "measured" as const },
    observedAt: "2026-10-21T16:59:00Z",
    expiresAt: "2026-10-21T17:01:00Z",
  };
  return (
    <AllocationRow
      row={row}
      evidence={{ ...row, nativeObservation } as NativeAllocationRow}
      editable
      fresh
      draft={draft}
      change={change}
      labels={providerAllocationLabels}
      feedback={providerFeedbackLabels}
      inputPolicy={{ denomination: "dollars", blank: "unlimited", precision: 2 }}
      onRefreshNative={probe}
      suggestionEligible={() => true}
    />
  );
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T17:00:00Z"));
  probe.mockReset();
});
afterEach(() => vi.useRealTimers());
it("uses the cached balance only after an explicit click and clears a draft-capacity warning", () => {
  render(<Harness />);
  const field = screen.getByRole("textbox");
  expect(screen.queryByText(providerAllocationLabels.balanceWarning)).toBeNull();
  fireEvent.change(field, { target: { value: "2.00" } });
  expect(screen.getByText(providerAllocationLabels.balanceWarning)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: providerAllocationLabels.available }));
  expect(field).toHaveValue("1.03");
  expect(screen.queryByText(providerAllocationLabels.balanceWarning)).toBeNull();
  expect(probe).not.toHaveBeenCalled();
});
it("invalidates a proof that expires while idle and explains why the draft was not changed", () => {
  render(<Harness />);
  const apply = screen.getByRole("button", { name: providerAllocationLabels.available });
  expect(apply).toBeEnabled();
  vi.setSystemTime(new Date("2026-10-21T17:01:00Z"));
  fireEvent.click(apply);
  expect(screen.getByRole("textbox")).toHaveValue("1.00");
  expect(apply).toBeDisabled();
  expect(
    screen.getByText(providerAllocationLabels.availabilityReasons.balance_stale),
  ).toBeVisible();
  expect(probe).not.toHaveBeenCalled();
});
