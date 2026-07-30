import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { KeywordRow } from "@/lib/queries/keywords";
import { FIELD_HELP } from "@/lib/settings/field-help";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BulkFrequencyForm } from "./BulkActionForms";

function renderForm() {
  const action = vi.fn(async () => undefined);
  const selectedRows = [
    {
      ...(keywordRows[0] as KeywordRow),
      schedule: {
        ...(keywordRows[0] as KeywordRow).schedule,
        frequency: "weekly" as const,
        serp_depth: 100 as const,
      },
    },
  ];
  render(
    <BulkFrequencyForm
      action={action}
      onDone={vi.fn()}
      onError={vi.fn()}
      projectId="prj_1"
      providerRate={{ overrideCents: 1, providerId: "dataforseo" }}
      selectedRows={selectedRows}
    />,
  );
  return action;
}

describe("BulkFrequencyForm", () => {
  it("shows help for each schedule field", () => {
    renderForm();

    expect(screen.getByRole("button", { name: FIELD_HELP.frequency })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: FIELD_HELP.timezone })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: FIELD_HELP.jitter })).toBeInTheDocument();
    expect(screen.getByLabelText("Jitter (min)")).toHaveDisplayValue("60");
    expect(screen.getByLabelText("Jitter (min)")).toHaveAttribute("max", "120");

    fireEvent.click(screen.getByRole("button", { name: "Frequency" }));
    fireEvent.click(screen.getByText("Custom cron"));

    expect(screen.getByRole("button", { name: FIELD_HELP.cron })).toBeInTheDocument();
  });

  it("shows the selected keywords' monthly frequency delta", () => {
    renderForm();

    expect(screen.getByText("~ +$0.26/mo for 1 keyword")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Frequency" }));
    fireEvent.click(screen.getByText("Paused"));

    expect(screen.getByText("~ -$0.04/mo for 1 keyword")).toBeInTheDocument();
  });

  it("selects a validated timezone from the searchable catalogue", async () => {
    const user = userEvent.setup();
    const action = renderForm();

    await user.click(screen.getByRole("button", { name: "Timezone" }));
    await user.type(screen.getByRole("textbox", { name: "Search time zones..." }), "warsaw");
    await user.click(screen.getByRole("menuitem", { name: /Europe\/Warsaw/ }));
    await user.click(screen.getByRole("button", { name: "Set frequency" }));

    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({ schedule: expect.objectContaining({ timezone: "Europe/Warsaw" }) }),
    );
  });
});
