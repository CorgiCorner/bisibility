import {
  renderWithFeatureMessages,
  sharedControlTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataTable } from "./DataTable";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: {
    count: number;
    estimateSize: (index: number) => number;
    scrollMargin: number;
  }) => {
    let start = options.scrollMargin;
    const items = Array.from({ length: options.count }, (_, index) => {
      const item = { index, key: index, start };
      start += options.estimateSize(index);
      return item;
    });
    return { getVirtualItems: () => items, getTotalSize: () => start - options.scrollMargin };
  },
}));

describe.each(["auto", "fill"] as const)("per-row table height in %s layout", (layout) => {
  it("keeps tall content and the following row's virtual offset aligned while preserving normal density", () => {
    renderWithFeatureMessages(
      <DataTable
        id={`height-${layout}`}
        ariaLabel="Result rows"
        columns={[{ id: "label", header: "Result", accessorKey: "label" }]}
        rows={[
          { id: "evidence", label: "Tall evidence" },
          { id: "legacy", label: "Legacy result" },
        ]}
        rowHeight={(row) => (row.id === "evidence" ? 112 : undefined)}
        layout={layout}
        density="compact"
        sorting={null}
        onSortingChange={() => {}}
      />,
      { messages: sharedControlTestMessages },
    );
    const tall = screen.getByText("Tall evidence").closest('[role="row"]');
    const legacy = screen.getByText("Legacy result").closest('[role="row"]');
    expect(tall).toHaveStyle({ height: "112px" });
    expect(legacy).toHaveStyle({ height: "56px" });
    if (layout === "fill") expect(legacy).toHaveStyle({ transform: "translateY(112px)" });
  });
});
