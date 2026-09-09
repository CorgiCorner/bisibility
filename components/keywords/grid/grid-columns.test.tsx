import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { KeywordRow } from "@/lib/queries/keywords";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  KeywordCell,
  keywordColumns,
  LocationCell,
  scheduleTargetsForRow,
  TagsCell,
} from "./grid-columns";

const row = keywordRows[0] as KeywordRow;

describe("KeywordCell", () => {
  it("uses the keyword itself as the details link without displaying the ID", () => {
    render(<KeywordCell projectRef="prj_1" row={row} />);

    expect(screen.getByRole("link", { name: row.keyword })).toHaveAttribute(
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

    fireEvent(screen.getByRole("link", { name: row.keyword }), detailsClick);

    expect(detailsStop).toHaveBeenCalled();
  });
});

describe("LocationCell", () => {
  it("shows the location directly without a hover tooltip", () => {
    render(<LocationCell row={row} />);

    const location = screen.getByText(row.location.displayName);
    expect(location.parentElement?.parentElement).toHaveClass("inline-flex");
    expect(location.parentElement?.parentElement).not.toHaveAttribute(
      "aria-label",
      row.location.displayName,
    );
    expect(screen.getByText(`/ ${row.location.languageLabel ?? row.location.hl}`)).toBeVisible();
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
    const column = columns.find((candidate) => candidate.id === "change");
    const getter = column && "accessorFn" in column ? column.accessorFn : undefined;

    expect(getter?.({ ...row, position: 6, positionBaseline: 4, previousPosition: 6 }, 0)).toBe(-2);
  });

  it("sorts and filters by the target schedule", () => {
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
    const scheduleColumn = columns.find((column) => column.id === "frequency");
    const scheduleRow = {
      ...row,
      checkSchedule: { name: "Daily 06:00", publicId: "sch_daily" },
    } as KeywordRow;
    const getter =
      scheduleColumn && "accessorFn" in scheduleColumn ? scheduleColumn.accessorFn : undefined;

    expect(scheduleColumn).toMatchObject({
      header: "Schedule",
      id: "frequency",
      meta: { title: "Schedule" },
    });
    expect(getter?.(scheduleRow, 0)).toBe("Daily 06:00");
    expect(scheduleTargetsForRow(scheduleRow)).toEqual([
      expect.objectContaining({ schedule: { name: "Daily 06:00", publicId: "sch_daily" } }),
    ]);
  });

  it("pins only the locked keyword and actions columns", () => {
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

    expect(columns.find((column) => column.id === "keyword")?.meta).toMatchObject({
      lockVisible: true,
      pin: "left",
    });
    expect(columns.find((column) => column.id === "actions")?.meta).toMatchObject({
      lockResize: true,
      lockVisible: true,
      pin: "right",
    });
  });

  it("keeps initial widths on the 4px scale and lets Keyword shrink to 160px", () => {
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
    const sizing = Object.fromEntries(
      columns.map((column) => [column.id, { minSize: column.minSize, size: column.size }]),
    );

    expect(sizing).toMatchObject({
      clicks: { minSize: 96, size: 96 },
      ctr: { minSize: 92, size: 92 },
      device: { minSize: 84, size: 84 },
      impressions: { minSize: 96, size: 96 },
      intent: { minSize: 132, size: 132 },
      keyword: { minSize: 160, size: 300 },
      location: { minSize: 152, size: 152 },
      position: { minSize: 172, size: 172 },
      tags: { minSize: 172, size: 172 },
      topic: { minSize: 132, size: 132 },
    });
    expect(
      columns.every(
        (column) =>
          (column.size === undefined || column.size % 4 === 0) &&
          (column.minSize === undefined || column.minSize % 4 === 0),
      ),
    ).toBe(true);
  });
});
