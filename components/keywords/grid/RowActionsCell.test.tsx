import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { KeywordRow } from "@/lib/queries/keywords";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RowActionsCell } from "./RowActionsCell";

const mocks = vi.hoisted(() => ({ push: vi.fn(), showToast: vi.fn(), writeText: vi.fn() }));

vi.mock("@/components/ui", () => ({ useToast: () => ({ showToast: mocks.showToast }) }));

const row = keywordRows[0] as KeywordRow;

describe("RowActionsCell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
  });

  it("offers edit, details, copy, check, and delete actions", async () => {
    const onDelete = vi.fn();
    const onEdit = vi.fn();
    const onRunCheck = vi.fn();
    const { rerender } = render(
      <RowActionsCell
        canDeleteKeyword
        canUpdateKeyword
        onDelete={onDelete}
        onEdit={onEdit}
        onRunCheck={onRunCheck}
        projectRef="prj_1"
        row={row}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Keyword actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit keyword" }));
    expect(onEdit).toHaveBeenCalledWith(row);

    rerender(
      <RowActionsCell
        canDeleteKeyword
        canUpdateKeyword
        onDelete={onDelete}
        onEdit={onEdit}
        onRunCheck={onRunCheck}
        projectRef="prj_1"
        row={row}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Keyword actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Run check (Top 100)" }));
    expect(onRunCheck).toHaveBeenCalledWith(row);

    fireEvent.click(screen.getByRole("button", { name: "Keyword actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(row);

    fireEvent.click(screen.getByRole("button", { name: "Keyword actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "View details" }));
    expect(routerMock.push).toHaveBeenCalledWith(`/app/prj_1/rank-tracker/${row.id}`);

    fireEvent.click(screen.getByRole("button", { name: "Keyword actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy keyword ID" }));
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith(row.id));
    expect(mocks.showToast).toHaveBeenCalledWith("Keyword ID copied", { tint: "green" });
  });

  it("reports a clipboard failure instead of showing success", async () => {
    mocks.writeText.mockRejectedValueOnce(new Error("denied"));
    render(
      <RowActionsCell
        canDeleteKeyword
        canUpdateKeyword
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onRunCheck={vi.fn()}
        projectRef="prj_1"
        row={row}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Keyword actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy keyword ID" }));

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith("Could not copy keyword ID", { tint: "red" }),
    );
    expect(mocks.showToast).not.toHaveBeenCalledWith("Keyword ID copied", { tint: "green" });
  });

  it("disables only the run action while the row check is pending", () => {
    render(
      <RowActionsCell
        canDeleteKeyword
        canUpdateKeyword
        checkPending
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onRunCheck={vi.fn()}
        projectRef="prj_1"
        row={row}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Keyword actions" }));

    expect(screen.getByRole("menuitem", { name: "Run check (Top 100)" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: "Edit keyword" })).not.toHaveAttribute(
      "aria-disabled",
    );
    expect(screen.getByRole("menuitem", { name: "Delete" })).not.toHaveAttribute("aria-disabled");
  });

  it("shows the row's effective check depth", () => {
    render(
      <RowActionsCell
        canDeleteKeyword
        canUpdateKeyword
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onRunCheck={vi.fn()}
        projectRef="prj_1"
        row={{ ...row, projectSerpDepth: 50, schedule: { ...row.schedule, serp_depth: 20 } }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Keyword actions" }));

    expect(screen.getByRole("menuitem", { name: "Run check (Top 20)" })).toBeInTheDocument();
  });

  it("keeps read actions while hiding mutations from read-only roles", () => {
    render(
      <RowActionsCell
        canDeleteKeyword={false}
        canUpdateKeyword={false}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onRunCheck={vi.fn()}
        projectRef="prj_1"
        row={row}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Keyword actions" }));

    expect(screen.getByRole("menuitem", { name: "View details" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy keyword ID" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Edit keyword" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Run check/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("allows member edits without exposing admin deletion", () => {
    render(
      <RowActionsCell
        canDeleteKeyword={false}
        canUpdateKeyword
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onRunCheck={vi.fn()}
        projectRef="prj_1"
        row={row}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Keyword actions" }));

    expect(screen.getByRole("menuitem", { name: "Edit keyword" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Run check/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
  });
});
