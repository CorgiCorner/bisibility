"use client";

import { cn } from "@/lib/ui/cn";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { flexRender, type Row } from "@tanstack/react-table";
import type { CSSProperties, ReactNode, SyntheticEvent } from "react";
import { DataTableCell } from "./DataTableCell";
import { DataTableSelectionCheckbox } from "./DataTableSelectionCheckbox";
import { dataTableRowHeight } from "./data-table-density";
import { dataTableRowKind, dataTableRowLabel } from "./data-table-model";
import { DATA_TABLE_ROW_BACKGROUND_VARIABLE } from "./data-table-pinning";
import { dataTableSelectionState, toggleDataTableRowSelection } from "./data-table-selection";
import { DATA_TABLE_WIDTH_VARIABLE } from "./data-table-sizing";
import type { DataTableDensity, DataTableRowBase } from "./data-table-types";
import { DATA_TABLE_SELECTION_COLUMN_ID } from "./use-data-table";

type DataTableRowProps<TRow extends DataTableRowBase> = {
  childDomId?: string;
  columnCount: number;
  density: DataTableDensity;
  firstContentColumnId?: string;
  groupControlsId: (rowId: string) => string;
  isLastRow: boolean;
  onExpandedToggle: (row: TRow) => void;
  onGroupRowClick?: (row: TRow) => void;
  onRowClick?: (row: TRow) => void;
  onSelectionChange?: (next: ReadonlySet<string>) => void;
  row: Row<TRow>;
  rowClassName?: (row: TRow) => string | undefined;
  rowIndex: number;
  renderSection?: (row: TRow) => ReactNode;
  selectable?: (row: TRow) => boolean;
  selection?: ReadonlySet<string>;
  virtualStyle?: CSSProperties;
};

function stopRowClick(event: SyntheticEvent) {
  event.stopPropagation();
}

export function DataTableRow<TRow extends DataTableRowBase>({
  childDomId,
  columnCount,
  density,
  firstContentColumnId,
  groupControlsId,
  isLastRow,
  onExpandedToggle,
  onGroupRowClick,
  onRowClick,
  onSelectionChange,
  row,
  rowClassName,
  rowIndex,
  renderSection,
  selectable,
  selection,
  virtualStyle,
}: Readonly<DataTableRowProps<TRow>>) {
  const original = row.original;
  const kind = dataTableRowKind(original);
  const selectionState = dataTableSelectionState(original, selection ?? new Set(), selectable);
  const isSelected = selectionState.checked;
  const clickable = kind === "group" || (kind === "row" && Boolean(onRowClick));
  const backgroundColor = isSelected
    ? "var(--nav-active)"
    : row.depth === 1
      ? "color-mix(in srgb, var(--bg-sunken) 52%, transparent)"
      : "var(--bg-elev)";
  const style: CSSProperties & Record<typeof DATA_TABLE_ROW_BACKGROUND_VARIABLE, string> = {
    [DATA_TABLE_ROW_BACKGROUND_VARIABLE]: backgroundColor,
    backgroundColor,
    height: dataTableRowHeight(density, kind),
    minWidth: "100%",
    width: `var(${DATA_TABLE_WIDTH_VARIABLE})`,
    ...virtualStyle,
  };

  function handleRowClick() {
    if (kind === "group") {
      if (onGroupRowClick) onGroupRowClick(original);
      else onExpandedToggle(original);
    } else if (kind === "row") onRowClick?.(original);
  }

  if (kind === "section") {
    return (
      // biome-ignore lint/a11y/useSemanticElements: Virtualized rows require a div-based ARIA row.
      <div
        aria-level={1}
        aria-rowindex={rowIndex}
        className={cn(
          "group flex border-b border-border-soft",
          isLastRow && "border-b-0",
          rowClassName?.(original),
        )}
        data-depth={row.depth}
        data-last-row={isLastRow || undefined}
        id={childDomId}
        role="row"
        style={style}
        tabIndex={-1}
      >
        {/* biome-ignore lint/a11y/useSemanticElements: Section content is one div-based spanning ARIA cell. */}
        <div
          aria-colspan={columnCount}
          className="flex min-w-0 flex-1 items-center px-3 text-[12px] font-semibold text-fg-muted"
          role="cell"
        >
          {renderSection?.(original)}
        </div>
      </div>
    );
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: Virtualized rows require a div-based ARIA row.
    <div
      aria-rowindex={rowIndex}
      className={cn("group flex", clickable && "cursor-pointer", rowClassName?.(original))}
      data-depth={row.depth}
      data-last-row={isLastRow || undefined}
      data-selected={isSelected || undefined}
      id={childDomId}
      onClick={clickable ? handleRowClick : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleRowClick();
              }
            }
          : undefined
      }
      role="row"
      style={style}
      tabIndex={clickable ? 0 : -1}
    >
      {row.getVisibleCells().map((cell) => {
        if (cell.column.id === DATA_TABLE_SELECTION_COLUMN_ID) {
          return (
            <DataTableCell
              cell={cell}
              key={cell.id}
              onClick={stopRowClick}
              onKeyDown={stopRowClick}
            >
              <DataTableSelectionCheckbox
                {...selectionState}
                ariaLabel={`Select ${dataTableRowLabel(original)}`}
                onChange={
                  onSelectionChange
                    ? (checked) =>
                        onSelectionChange(
                          toggleDataTableRowSelection(
                            original,
                            selection ?? new Set(),
                            checked,
                            selectable,
                          ),
                        )
                    : undefined
                }
              />
            </DataTableCell>
          );
        }
        const firstContent = cell.column.id === firstContentColumnId;
        const stopActionClick = cell.column.id === "actions";
        return (
          <DataTableCell
            cell={cell}
            key={cell.id}
            onClick={stopActionClick ? stopRowClick : undefined}
            onKeyDown={stopActionClick ? stopRowClick : undefined}
          >
            <div
              className={cn("flex min-w-0 flex-1 items-center", firstContent && "gap-2")}
              style={firstContent && row.depth === 1 ? { paddingLeft: 16 } : undefined}
            >
              {kind === "group" && firstContent ? (
                <button
                  aria-controls={groupControlsId(original.id)}
                  aria-expanded={row.getIsExpanded()}
                  aria-label={`${row.getIsExpanded() ? "Collapse" : "Expand"} ${dataTableRowLabel(original)}`}
                  className="grid size-6 shrink-0 place-items-center rounded-control text-fg-muted hover:bg-bg-sunken hover:text-fg"
                  onClick={(event) => {
                    event.stopPropagation();
                    onExpandedToggle(original);
                  }}
                  type="button"
                >
                  {row.getIsExpanded() ? (
                    <CaretDown aria-hidden size={13} weight="regular" />
                  ) : (
                    <CaretRight aria-hidden size={13} weight="regular" />
                  )}
                </button>
              ) : null}
              <span className="min-w-0 flex-1 overflow-hidden">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </span>
            </div>
          </DataTableCell>
        );
      })}
    </div>
  );
}
