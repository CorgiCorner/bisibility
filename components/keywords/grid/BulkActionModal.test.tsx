import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { KeywordRow } from "@/lib/queries/keywords";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BulkActionModal, type BulkMode } from "./BulkActionModal";

const actions = {
  bulkSetTargetAction: vi.fn(async () => undefined),
  bulkTagAction: vi.fn(async () => undefined),
};

function renderMode(mode: Exclude<BulkMode, null>) {
  render(
    <BulkActionModal
      {...actions}
      actionError={null}
      mode={mode}
      onClose={vi.fn()}
      onDone={vi.fn()}
      onError={vi.fn()}
      onRequestClearTarget={vi.fn()}
      projectId="prj_1"
      selectedRows={[keywordRows[0] as KeywordRow]}
    />,
  );
}

function expectStandardChrome(title: string, submitLabel: string) {
  const dialog = screen.getByRole("dialog", { name: title });
  expect(within(dialog).getByRole("heading", { name: title }).closest("header")).toHaveClass(
    "border-b",
  );
  expect(within(dialog).getByRole("button", { name: "Close modal" })).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Cancel" }).closest("footer")).toHaveClass(
    "border-t",
  );
  expect(
    within(dialog).getByRole("button", { name: submitLabel }).closest("footer"),
  ).not.toBeNull();
  expect(dialog).not.toHaveClass("MuiPaper-elevation24");
}

describe("BulkActionModal", () => {
  it("uses the standard modal chrome for add tag", () => {
    renderMode("tag");
    expectStandardChrome("Add tag", "Apply tag");
    expect(screen.getByText("Applies to 1 selected keyword.")).toBeInTheDocument();
  });

  it("uses the standard modal chrome for change target URL", () => {
    renderMode("target");
    expectStandardChrome("Change target URL", "Change target");
  });
});
