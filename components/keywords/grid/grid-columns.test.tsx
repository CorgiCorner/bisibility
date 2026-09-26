import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { KeywordRow } from "@/lib/queries/keywords";
import messages from "@/messages/core/en/project-rank-tracker-keyword-import.json";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  KeywordCell,
  keywordColumns,
  LocationCell,
  scheduleTargetsForRow,
  TagsCell,
} from "./grid-columns";
import { trafficColumns } from "./grid-columns-traffic";

const columnMessages = messages.projectRankTracker.keywordImport.management.columns;
const keywordColumnLabels = {
  ...columnMessages,
  noRankLabel: () => "No ranking data",
  noTrafficDataLabel: "Connect Search Console to see traffic",
  formatNumber: (value: number) => value.toString(),
  formatPercent: (value: number) => `${value * 100}%`,
  formatPosition: (value: number) => `#${value}`,
  positionTrend: ({ keyword }: { keyword: string }) =>
    columnMessages.positionTrend.replace("{keyword}", keyword),
};

const row = keywordRows[0] as KeywordRow;

describe("KeywordCell", () => {
  it("uses the keyword itself as the details link without displaying the ID", () => {
    render(<KeywordCell projectRef="prj_1" row={row} />);

    expect(screen.getByRole("link", { name: row.keyword })).toHaveAttribute(
      "href",
      `/app/prj_1/rank-tracker/${row.id}`,
    );
    expect(screen.getByText(row.keyword)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: row.keyword })).toHaveClass(
      "font-medium",
      "text-fg",
      "hover:underline",
      "focus-visible:underline",
    );
    expect(screen.getByRole("link", { name: row.keyword }).className).not.toContain("accent");
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
  it("uses the supplied localized no-traffic label in an actual list column", () => {
    const [clicksColumn] = trafficColumns({
      clickThroughRate: "Współczynnik klikalności",
      clicks: "Kliknięcia",
      ctr: "CTR",
      formatNumber: (value) => value.toLocaleString("pl-PL"),
      formatPercent: (value) => `${value * 100}%`,
      impressions: "Wyświetlenia",
      noTrafficDataLabel: "Połącz Search Console, aby zobaczyć ruch",
    });
    if (typeof clicksColumn?.cell !== "function") throw new Error("Expected a cell renderer.");

    render(clicksColumn.cell({ getValue: () => null } as never));

    expect(screen.getByLabelText("Połącz Search Console, aby zobaczyć ruch")).toBeVisible();
  });

  it("passes numeric traffic values to the locale formatter contracts", () => {
    const columns = trafficColumns({
      clickThroughRate: "Współczynnik klikalności",
      clicks: "Kliknięcia",
      ctr: "CTR",
      formatNumber: (value) => `liczba:${value}`,
      formatPercent: (value) => `procent:${value}`,
      impressions: "Wyświetlenia",
      noTrafficDataLabel: "Połącz Search Console, aby zobaczyć ruch",
    });
    const clicksColumn = columns.find((column) => column.id === "clicks");
    const ctrColumn = columns.find((column) => column.id === "ctr");
    if (typeof clicksColumn?.cell !== "function" || typeof ctrColumn?.cell !== "function") {
      throw new Error("Expected traffic cell renderers.");
    }

    render(
      <>
        {clicksColumn.cell({ getValue: () => 1_234 } as never)}
        {ctrColumn.cell({ getValue: () => 0.125 } as never)}
      </>,
    );

    expect(screen.getByText("liczba:1234")).toBeVisible();
    expect(screen.getByText("procent:0.125")).toBeVisible();
  });

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
      undefined,
      keywordColumnLabels,
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
      undefined,
      keywordColumnLabels,
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
      undefined,
      keywordColumnLabels,
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
      undefined,
      keywordColumnLabels,
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
