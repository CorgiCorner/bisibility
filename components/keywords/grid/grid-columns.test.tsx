import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { KeywordRow } from "@/lib/queries/keywords";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeywordCell, keywordColumns, LocationCell, TagsCell } from "./grid-columns";

const row = keywordRows[0] as KeywordRow;

describe("KeywordCell", () => {
  it("shows the keyword and details action without displaying the ID", () => {
    render(<KeywordCell projectRef="prj_1" row={row} />);

    expect(screen.getByRole("link", { name: "View keyword details" })).toHaveAttribute(
      "href",
      `/app/prj_1/rank-tracker/${row.id}`,
    );
    expect(screen.getByText(row.keyword)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy keyword ID" })).not.toBeInTheDocument();
    expect(screen.queryByText(row.id)).not.toBeInTheDocument();
  });

  it("keeps action clicks from bubbling to the clickable row", () => {
    render(<KeywordCell projectRef="prj_1" row={row} />);
    const detailsClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    detailsClick.preventDefault();
    const detailsStop = vi.spyOn(detailsClick, "stopPropagation");

    fireEvent(screen.getByRole("link", { name: "View keyword details" }), detailsClick);

    expect(detailsStop).toHaveBeenCalled();
  });
});

describe("LocationCell", () => {
  it("shows the location directly without a hover tooltip", () => {
    render(<LocationCell row={row} />);

    const location = screen.getByText(row.location.displayName);
    expect(location.parentElement).toHaveClass("inline-flex");
    expect(location.parentElement).not.toHaveAttribute("aria-label", row.location.displayName);
  });
});

describe("TagsCell", () => {
  it("uses the compact, vertically centered grid badge size", () => {
    render(<TagsCell row={{ ...row, tags: ["Comparison"] }} />);

    expect(screen.getByText("Comparison")).toHaveClass(
      "inline-flex",
      "h-5",
      "self-center",
      "items-center",
      "px-2",
      "text-[9.5px]",
      "leading-none",
    );
  });
});

describe("keywordColumns", () => {
  it("sorts the Change column by the earlier-day baseline", () => {
    const columns = keywordColumns(
      {
        canDeleteKeyword: true,
        canUpdateKeyword: true,
        onDelete: vi.fn(),
        onEdit: vi.fn(),
        onRunCheck: vi.fn(),
      },
      "prj_1",
    );
    const getter = columns.find((column) => column.field === "change")?.valueGetter as
      | ((value: undefined, row: KeywordRow) => unknown)
      | undefined;

    expect(
      getter?.(undefined, { ...row, position: 6, positionBaseline: 4, previousPosition: 6 }),
    ).toBe(-2);
  });
});
