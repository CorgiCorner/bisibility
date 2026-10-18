import {
  providerUiBinding,
  providerUiRows,
} from "@/components/provider-management/provider-ui-fixtures";
import {
  connections,
  dialogCopy,
  surfaceLabel,
} from "@/components/settings/usage/__tests__/BudgetEditModal.fixtures";
import { BudgetEditModal } from "@/components/settings/usage/BudgetEditModal";
import {
  integrationsFeatureTestMessages,
  renderWithFeatureMessages,
  usageSettingsFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import type { ProviderAllocationRow } from "@usagekit/views";
import { describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  binding: vi.fn(),
  read: vi.fn(),
  execute: vi.fn(),
  native: vi.fn(),
}));
vi.mock("@/lib/actions/provider-ui", () => ({
  getProviderUiBindingAction: host.binding,
  readProviderUiAction: host.read,
  executeProviderUiAction: host.execute,
  reconcileProviderUiAction: vi.fn(),
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "user_1" }, session: { id: "session_1" } },
      isPending: false,
    }),
  },
}));
vi.mock("@/lib/actions/provider-allocation", () => ({
  refreshProviderConnectionBudgetAction: host.native,
}));

function setup(asOf: string | null, available: NonNullable<ProviderAllocationRow["available"]>) {
  vi.clearAllMocks();
  host.binding.mockResolvedValue(providerUiBinding());
  const rows = providerUiRows([connections[1]], true).map((row) =>
    row.id === "conn_data:platform:app"
      ? {
          ...row,
          used: { text: "2500", unit: "customer_cents", certainty: "measured" as const },
          reserved: { text: "500", unit: "customer_cents", certainty: "measured" as const },
          available,
          availabilityBasis: "after_reservations" as const,
        }
      : row,
  );
  host.read.mockImplementation(async (_project, query) => ({
    outcome: "ok",
    value:
      query.kind === "allocations"
        ? {
            kind: "allocations",
            state: "ok",
            rows,
            revision: "snapshot-1",
            asOf,
            problem: null,
          }
        : query.kind === "connections"
          ? {
              kind: "connections",
              state: "ok",
              connections: [],
              providers: [],
              revision: "snapshot-1",
              asOf,
              problem: null,
            }
          : {
              kind: "balance",
              state: "unavailable",
              balance: null,
              revision: "snapshot-1",
              asOf,
              problem: null,
            },
  }));
  renderWithFeatureMessages(
    <BudgetEditModal
      connections={[connections[1]]}
      onClose={() => {}}
      onSaved={() => {}}
      projectId="prj_story"
      projectRef="prj_story"
    />,
    { messages: { ...usageSettingsFeatureTestMessages, ...integrationsFeatureTestMessages } },
  );
}

describe("verified wallet allocation suggestion", () => {
  it("uses the exact wallet snapshot independently of unknown provider balance freshness", async () => {
    setup("2026-10-07T13:30:00.000Z", {
      text: "7000",
      unit: "customer_cents",
      certainty: "measured",
    });
    const field = await screen.findByLabelText(
      surfaceLabel(dialogCopy.creditsAppBudgetField, "DataForSEO"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Use credit balance" }));
    expect(field).toHaveValue("10000");
    expect(screen.getByText("Oct 7, 2026, 1:30 PM")).toHaveAttribute(
      "datetime",
      "2026-10-07T13:30:00.000Z",
    );
    expect(host.native).not.toHaveBeenCalled();
    expect(host.execute).not.toHaveBeenCalled();
  });

  it.each([
    { name: "missing timestamp", asOf: null, text: "7000", certainty: "measured" as const },
    {
      name: "unknown available balance",
      asOf: "2026-10-07T13:30:00.000Z",
      text: "7000",
      certainty: "unknown" as const,
    },
    {
      name: "fractional native capacity",
      asOf: "2026-10-07T13:30:00.000Z",
      text: "7000.0001",
      certainty: "measured" as const,
    },
  ])("refuses $name without guessing or rounding", async ({ asOf, text, certainty }) => {
    setup(asOf, { text, unit: "customer_cents", certainty });
    const field = await screen.findByLabelText(
      surfaceLabel(dialogCopy.creditsAppBudgetField, "DataForSEO"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Use credit balance" }));
    await screen.findAllByText(/Scoped usage and reservations/);
    expect(field).toHaveValue("");
    expect(host.native).not.toHaveBeenCalled();
    expect(host.execute).not.toHaveBeenCalled();
  });
});
