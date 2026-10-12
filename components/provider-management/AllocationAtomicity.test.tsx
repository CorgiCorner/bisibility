import { providerUiRow } from "@/components/provider-management/provider-ui-fixtures";
import { ProviderAllocationEditor } from "@/components/usagekit/provider-allocation-form";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ProviderAction } from "@usagekit/react";
import { beforeEach, expect, it, vi } from "vitest";

const action = vi.hoisted(() => ({
  state: "idle",
  result: null,
  pending: false,
  ambiguous: false,
  canWrite: true,
  canReconcile: true,
  submittedCommand: null,
  run: vi.fn(),
  reconcile: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("@usagekit/react", () => ({ useProviderAction: () => action }));
beforeEach(() => vi.clearAllMocks());

it.each(["missing", "readonly"])(
  "never saves only part of a draft when a changed row becomes %s",
  (kind) => {
    const rows = ["a", "b"].map((id) => ({
      ...providerUiRow(id, "app"),
      unlimited: false,
      limit: { text: "10", unit: "cents", certainty: "measured" as const },
    }));
    const props = {
      rows,
      revision: "one",
      action: action as ProviderAction,
      rowLabels: (row: { id: string }) => ({ field: row.id }),
    };
    const view = render(<ProviderAllocationEditor {...props} evidenceRows={rows} />);
    for (const row of rows)
      fireEvent.change(screen.getByLabelText(row.id), { target: { value: "20" } });
    view.rerender(
      <ProviderAllocationEditor
        {...props}
        evidenceRows={kind === "missing" ? [rows[0]] : [rows[0], { ...rows[1], editable: false }]}
      />,
    );
    expect(screen.getByRole("button", { name: "Save allocations" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Reload");
    fireEvent.click(screen.getByRole("button", { name: "Save allocations" }));
    expect(action.run).not.toHaveBeenCalled();
  },
);
