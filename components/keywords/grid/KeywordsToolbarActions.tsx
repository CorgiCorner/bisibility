"use client";

import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { DataTableColumnsMenu } from "@/components/ui/data-table/DataTableColumnsMenu";
import { DataTableDensityMenu } from "@/components/ui/data-table/DataTableDensityMenu";
import type {
  DataTableColumn,
  DataTableDensity,
} from "@/components/ui/data-table/data-table-types";
import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import type { KeywordRow } from "@/lib/queries/keywords";
import { useMediaQuery } from "@/lib/ui/use-media-query";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { FunnelIcon as Funnel } from "@phosphor-icons/react/dist/csr/Funnel";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { useState } from "react";
import { KeywordsToolbarButton, toolbarSecondaryIconClassName } from "./KeywordsToolbarButton";

const menuRowStyle = { alignItems: "center", display: "flex", gap: "10px", minHeight: 36 };

type KeywordsToolbarActionsProps = {
  columnSizing: Record<string, number>;
  columns: readonly DataTableColumn<KeywordRow>[];
  columnVisibility: Record<string, boolean>;
  density: DataTableDensity;
  filterCount: number;
  id: string;
  onAddKeyword?: () => void;
  onColumnSizingChange: (next: Record<string, number>) => void;
  onColumnVisibilityChange: (next: Record<string, boolean>) => void;
  onDensityChange: (density: DataTableDensity) => void;
  onImportCsv?: () => void;
  onOpenExport: () => void;
  onOpenFilters: () => void;
};

export function KeywordsToolbarActions({
  columnSizing,
  columns,
  columnVisibility,
  density,
  filterCount,
  id,
  onAddKeyword,
  onColumnSizingChange,
  onColumnVisibilityChange,
  onDensityChange,
  onImportCsv,
  onOpenExport,
  onOpenFilters,
}: Readonly<KeywordsToolbarActionsProps>) {
  const [transferAnchor, setTransferAnchor] = useState<null | HTMLElement>(null);
  const { readOnly } = useProjectWriteMode();
  const mobileTooltips = useMediaQuery("(max-width:1023px)");
  const hasFilters = filterCount > 0;

  return (
    <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1.5">
      <span className="inline-flex">
        <DataTableColumnsMenu
          columnSizing={columnSizing}
          columns={columns}
          columnVisibility={columnVisibility}
          id={id}
          onColumnSizingChange={onColumnSizingChange}
          onColumnVisibilityChange={onColumnVisibilityChange}
        />
      </span>
      <KeywordsToolbarButton
        showTooltip={mobileTooltips}
        label="Filters"
        onClick={onOpenFilters}
        startIcon={
          <Funnel
            weight="regular"
            size={15}
            className={hasFilters ? "text-current" : toolbarSecondaryIconClassName}
          />
        }
        style={{
          "--control-background-color": hasFilters ? "var(--accent-soft)" : "var(--bg-elev)",
          "--control-color": hasFilters ? "var(--accent)" : "var(--fg-muted)",
        }}
        variant="secondary"
      >
        {hasFilters ? (
          <span className="ml-1 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-accent-solid px-1 font-sans tabular-nums text-[11px] text-accent-on-solid">
            {filterCount}
          </span>
        ) : null}
      </KeywordsToolbarButton>
      <span className="hidden lg:inline-flex">
        <DataTableDensityMenu density={density} onDensityChange={onDensityChange} />
      </span>
      <span className="inline-flex lg:hidden">
        <KeywordsToolbarButton
          showTooltip={mobileTooltips}
          aria-controls={transferAnchor ? "keyword-transfer-menu" : undefined}
          aria-expanded={transferAnchor ? "true" : undefined}
          aria-haspopup="menu"
          label="Import or export"
          onClick={(event) => setTransferAnchor(event.currentTarget)}
          startIcon={
            <UploadSimple weight="regular" size={15} className={toolbarSecondaryIconClassName} />
          }
          variant="secondary"
        />
      </span>
      <Menu
        anchorEl={transferAnchor}
        id="keyword-transfer-menu"
        onClose={() => setTransferAnchor(null)}
        open={Boolean(transferAnchor)}
        contentProps={{ style: { border: "1px solid var(--border)", minWidth: 190 } }}
      >
        <MenuItem
          onClick={() => {
            setTransferAnchor(null);
            onOpenExport();
          }}
          style={menuRowStyle}
        >
          <UploadSimple weight="regular" aria-hidden size={15} />
          Export keywords
        </MenuItem>
        {onImportCsv ? (
          <MenuItem
            disabled={readOnly}
            onClick={() => {
              setTransferAnchor(null);
              onImportCsv();
            }}
            style={menuRowStyle}
          >
            <DownloadSimple weight="regular" aria-hidden size={15} />
            Import keywords
          </MenuItem>
        ) : null}
      </Menu>
      <span className="hidden lg:inline-flex" data-testid="keywords-export-action">
        <KeywordsToolbarButton
          compactBelowXl
          label="Export"
          onClick={onOpenExport}
          showTooltip
          startIcon={
            <UploadSimple
              aria-hidden
              weight="regular"
              size={15}
              className={toolbarSecondaryIconClassName}
            />
          }
          variant="secondary"
        />
      </span>
      {onImportCsv ? (
        <span className="hidden lg:inline-flex" data-testid="keywords-import-action">
          <ProjectReadOnlyTooltip>
            <KeywordsToolbarButton
              compactBelowXl
              disabled={readOnly}
              label="Import"
              onClick={onImportCsv}
              showTooltip
              startIcon={
                <DownloadSimple
                  aria-hidden
                  weight="regular"
                  size={15}
                  className={toolbarSecondaryIconClassName}
                />
              }
              variant="secondary"
            />
          </ProjectReadOnlyTooltip>
        </span>
      ) : null}
      {onAddKeyword ? (
        <ProjectReadOnlyTooltip>
          <KeywordsToolbarButton
            compactBelowXl
            showTooltip
            disabled={readOnly}
            label="Add keyword"
            onClick={onAddKeyword}
            startIcon={<Plus size={15} weight="regular" className="text-current" />}
            variant="primary"
          />
        </ProjectReadOnlyTooltip>
      ) : null}
    </div>
  );
}
