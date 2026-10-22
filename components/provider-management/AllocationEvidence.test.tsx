import type { AllocationNativeObservation } from "@/components/usagekit/provider-allocation-editor";
import { renderWithUsageSettingsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { NativeAllocationObservation } from "./AllocationEvidence";

const observation: AllocationNativeObservation = {
  identity: {
    id: "row",
    connectionId: "conn",
    fundingSource: "byok",
    surface: "app",
    unit: "units",
    revision: "rev",
  },
  value: { text: "239", unit: "searches", certainty: "measured" },
  observedAt: "2026-10-21T16:52:00.000Z",
};
it("shows a compact native account observation without changing metric-card defaults", () => {
  const { container } = render(
    <NativeAllocationObservation observation={observation} providerName="SerpApi" />,
  );
  expect(screen.getByText(/SerpApi account:/)).toHaveTextContent("239 searches");
  expect(container.querySelector(".text-2xl")).toBeNull();
  expect(screen.getByRole("button", { name: /As of/ })).toBeInTheDocument();
  expect(screen.queryByText("Measured")).toBeNull();
  expect(container.querySelector("time")).toHaveAttribute("dateTime", observation.observedAt);
});
it("keeps unknown provider balance distinct from zero", () => {
  render(<NativeAllocationObservation observation={null} providerName="SerpApi" />);
  expect(screen.getByLabelText("Unknown")).toHaveTextContent("—");
  expect(screen.queryByText(/0 searches|\$0.00/)).toBeNull();
});
it("formats a positive fractional cent in a native USD balance without losing precision", () => {
  render(
    <NativeAllocationObservation
      observation={{ ...observation, value: { text: "0.001", unit: "USD", certainty: "measured" } }}
      providerName="DataForSEO"
    />,
  );
  expect(screen.getByText("< $0.01")).toBeInTheDocument();
  expect(screen.queryByText("0.001 searches")).toBeNull();
});

it("does not relabel an arbitrary native unit as searches", () => {
  render(
    <NativeAllocationObservation
      observation={{ ...observation, value: { text: "5", unit: "tokens", certainty: "measured" } }}
      providerName="Provider"
    />,
  );
  expect(screen.getByText("5 tokens")).toBeInTheDocument();
  expect(screen.queryByText("5 searches")).toBeNull();
});

it("retains estimated balance certainty beside its observation time", () => {
  render(
    <NativeAllocationObservation
      observation={{
        ...observation,
        value: { text: "239", unit: "searches", certainty: "estimated" },
      }}
      providerName="SerpApi"
    />,
  );
  expect(screen.getByRole("button", { name: /Estimated.*As of/ })).toBeInTheDocument();
  expect(screen.queryByText("Measured")).toBeNull();
});
it("does not invent an observation time for an undated measured balance", () => {
  render(
    <NativeAllocationObservation
      observation={{ ...observation, observedAt: undefined }}
      providerName="SerpApi"
    />,
  );
  expect(screen.getByRole("button", { name: "Native provider balance" })).toBeInTheDocument();
  expect(screen.queryByText("As of")).toBeNull();
  expect(document.querySelector("time")).toBeNull();
});
