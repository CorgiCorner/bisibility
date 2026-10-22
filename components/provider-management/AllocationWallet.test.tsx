import { connections } from "@/components/settings/usage/__tests__/BudgetEditModal.fixtures";
import {
  integrationsFeatureTestMessages,
  renderWithFeatureMessages,
  usageSettingsFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AllocationEvidence } from "./AllocationEvidence";
import { providerUiRows } from "./provider-ui-fixtures";

vi.mock("./ProviderBalanceEvidence", () => ({ ProviderBalanceEvidence: () => null }));

it("shows the account wallet once across provider connections without summing or changing its authority", () => {
  const rows = providerUiRows(connections, true).map((row) => ({
    ...row,
    ...(row.fundingSource === "platform"
      ? { available: { text: "239", unit: "customer_cents", certainty: "measured" as const } }
      : {}),
  }));
  const original = structuredClone(rows);
  renderWithFeatureMessages(
    <AllocationEvidence rows={rows} connections={connections} asOf="2026-10-21T16:52:00.000Z" />,
    {
      messages: { ...integrationsFeatureTestMessages, ...usageSettingsFeatureTestMessages },
    },
  );
  expect(screen.getAllByText("239")).toHaveLength(1);
  expect(screen.queryByText("Measured")).toBeNull();
  expect(screen.queryByText("478")).toBeNull();
  expect(rows).toEqual(original);
});

it("does not let an unavailable first provider row hide a later verified account wallet", () => {
  const rows = providerUiRows(connections, true).map((row) => ({
    ...row,
    ...(row.connectionId === connections[1].connectionId && row.fundingSource === "platform"
      ? { available: { text: "123", unit: "customer_cents", certainty: "measured" as const } }
      : {}),
  }));
  renderWithFeatureMessages(
    <AllocationEvidence rows={rows} connections={connections} asOf="2026-10-21T16:52:00.000Z" />,
    {
      messages: { ...integrationsFeatureTestMessages, ...usageSettingsFeatureTestMessages },
    },
  );
  expect(screen.getAllByText("123")).toHaveLength(1);
});

it.each([null, "not-a-date"])(
  "does not promote undated wallet evidence (%s) into a visible balance",
  (asOf) => {
    const rows = providerUiRows(connections, true).map((row) => ({
      ...row,
      available: { text: "239", unit: "customer_cents", certainty: "measured" as const },
    }));
    renderWithFeatureMessages(
      <AllocationEvidence rows={rows} connections={connections} asOf={asOf} />,
      {
        messages: { ...integrationsFeatureTestMessages, ...usageSettingsFeatureTestMessages },
      },
    );
    expect(screen.queryByText("239")).toBeNull();
  },
);
