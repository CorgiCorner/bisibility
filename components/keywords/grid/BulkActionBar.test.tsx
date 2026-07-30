import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { KeywordRow } from "@/lib/queries/keywords";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BulkActionBar } from "./BulkActionBar";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const actions = {
  bulkClearTargetAction: vi.fn(async () => undefined),
  bulkDeleteAction: vi.fn(async () => undefined),
  bulkSetFrequencyAction: vi.fn(async () => undefined),
  bulkSetTargetAction: vi.fn(async () => undefined),
  bulkTagAction: vi.fn(async () => undefined),
};
const row = keywordRows[0] as KeywordRow;

describe("BulkActionBar", () => {
  it("shows the selected depth and sends an override only from the depth menu", () => {
    const onRunChecks = vi.fn();
    render(
      <BulkActionBar
        {...actions}
        budget={{ capCents: 5000, spentCents: 1250 }}
        canDeleteKeyword
        canUpdateKeyword
        onClear={vi.fn()}
        onRunChecks={onRunChecks}
        projectId="prj_1"
        providerRate={{ overrideCents: 10, providerId: "dataforseo" }}
        selectedRows={[{ ...row, schedule: { ...row.schedule, serp_depth: 50 } }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run check (Top 50)" }));
    expect(onRunChecks).toHaveBeenLastCalledWith([row.id]);

    fireEvent.click(screen.getByRole("button", { name: "Choose check depth" }));
    expect(screen.getByRole("menuitem", { name: "Top 50" }).querySelector("svg")).not.toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Top 20" }));
    expect(onRunChecks).toHaveBeenLastCalledWith([row.id], 20);
    expect(
      screen.getByText("This run ~ $0.10 - $37.50 left of $50.00 this month"),
    ).toBeInTheDocument();
  });

  it("does not highlight a depth for a mixed selection", () => {
    render(
      <BulkActionBar
        {...actions}
        canDeleteKeyword
        canUpdateKeyword
        onClear={vi.fn()}
        onRunChecks={vi.fn()}
        projectId="prj_1"
        selectedRows={[
          { ...row, schedule: { ...row.schedule, serp_depth: 50 } },
          { ...row, id: "kw_2", schedule: { ...row.schedule, serp_depth: 20 } },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose check depth" }));
    expect(
      screen.getAllByRole("menuitem").every((item) => item.querySelector("svg") === null),
    ).toBe(true);
  });
});
