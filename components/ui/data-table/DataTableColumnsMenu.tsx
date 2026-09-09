"use client";

import { Button } from "@/components/ui/Button";
import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import { menuSelectPaperStyle } from "@/components/ui/menu-select-support";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { EyeIcon as Eye } from "@phosphor-icons/react/dist/csr/Eye";
import { useState } from "react";
import { DataTableSelectionCheckbox } from "./DataTableSelectionCheckbox";
import { useDataTableLayout } from "./data-table-layout-store";
import { dataTableColumnId } from "./data-table-model";
import type {
  DataTableColumn,
  DataTableColumnsMenuProps,
  DataTableRowBase,
} from "./data-table-types";

function columnLabel<TRow extends DataTableRowBase>(column: DataTableColumn<TRow>): string {
  if (column.meta?.title) return column.meta.title;
  if (typeof column.header === "string") return column.header;
  return dataTableColumnId(column) ?? "Column";
}

export function DataTableColumnsMenu<TRow extends DataTableRowBase>({
  ariaLabel = "Columns",
  columnSizing,
  columnVisibility,
  columns,
  id,
  onColumnSizingChange,
  onColumnVisibilityChange,
}: Readonly<DataTableColumnsMenuProps<TRow>>) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const layout = useDataTableLayout(id);
  const visibility = columnVisibility ?? layout.columnVisibility;
  const toggleable = columns.flatMap((column) => {
    const columnId = dataTableColumnId(column);
    return columnId && !column.meta?.lockVisible ? [{ column, id: columnId }] : [];
  });

  function setVisibility(next: Record<string, boolean>) {
    if (columnVisibility === undefined) layout.setColumnVisibility(next);
    onColumnVisibilityChange?.(next);
  }

  function reset() {
    layout.reset();
    if (columnVisibility !== undefined) onColumnVisibilityChange?.({});
    if (columnSizing !== undefined) onColumnSizingChange?.({});
    setAnchorEl(null);
  }

  return (
    <>
      <Button
        aria-controls={anchorEl ? `${id}-columns-menu` : undefined}
        aria-expanded={Boolean(anchorEl)}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        size="sm"
        startIcon={<Eye aria-hidden size={15} weight="regular" />}
        style={{ fontWeight: 400 }}
        variant="secondary"
      >
        Columns
      </Button>
      <Menu
        anchorEl={anchorEl}
        id={`${id}-columns-menu`}
        onClose={() => setAnchorEl(null)}
        open={Boolean(anchorEl)}
        listProps={{ "aria-label": ariaLabel, style: { padding: 0 } }}
        contentProps={{ style: { ...menuSelectPaperStyle, minWidth: 210 } }}
      >
        <div className="px-2 py-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
          Toggle columns
        </div>
        {toggleable.map(({ column, id: columnId }) => {
          const label = columnLabel(column);
          const checked = visibility[columnId] !== false;
          return (
            <MenuItem
              key={columnId}
              onClick={() => setVisibility({ ...visibility, [columnId]: !checked })}
              style={{ alignItems: "center", display: "flex", gap: "10px", minHeight: 36 }}
            >
              <DataTableSelectionCheckbox
                ariaLabel={`${checked ? "Hide" : "Show"} ${label} column`}
                checked={checked}
                disabled={false}
                indeterminate={false}
                onChange={() => setVisibility({ ...visibility, [columnId]: !checked })}
              />
              {label}
            </MenuItem>
          );
        })}
        <MenuItem
          onClick={reset}
          style={{
            alignItems: "center",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: "10px",
            marginTop: "6px",
            minHeight: 36,
            paddingTop: "8px",
          }}
        >
          <ArrowCounterClockwise aria-hidden size={15} weight="regular" />
          Reset layout
        </MenuItem>
      </Menu>
    </>
  );
}
