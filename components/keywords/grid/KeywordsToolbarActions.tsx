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
import { trackKeywordAction } from "@/lib/analytics/product-interactions";
import type { KeywordRow } from "@/lib/queries/keywords";
import { useMediaQuery } from "@/lib/ui/use-media-query";
import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { FunnelIcon as Funnel } from "@phosphor-icons/react/dist/csr/Funnel";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { KeywordsToolbarButton, toolbarSecondaryIconClassName } from "./KeywordsToolbarButton";
import "./KeywordsToolbarActions.module.css";

const menuRowStyle = { alignItems: "center", display: "flex", gap: "10px", minHeight: 36 };

type KeywordsToolbarActionsProps = {
  columnOrderControl?: ReactNode;
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
  exportDisabled?: boolean;
  onOpenExport: () => void;
  onOpenFilters: () => void;
  onRefresh: () => void;
  refreshing: boolean;
};

export function KeywordsToolbarActions({
  columnOrderControl,
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
  exportDisabled,
  onOpenExport,
  onOpenFilters,
  onRefresh,
  refreshing,
}: Readonly<KeywordsToolbarActionsProps>) {
  const t = useTranslations("projectRankTracker.list.toolbar");
  const filterT = useTranslations("projectRankTracker.list.filterBar");
  const [transferAnchor, setTransferAnchor] = useState<null | HTMLElement>(null);
  const { readOnly } = useProjectWriteMode();
  const mobileTooltips = useMediaQuery("(max-width:1023px)");
  const hasFilters = filterCount > 0;

  function transfer(action: "add" | "import" | "export", callback?: () => void) {
    trackKeywordAction(action, "rank_tracker_toolbar");
    callback?.();
  }

  return (
    <div
      className="contents lg:ml-auto lg:flex lg:flex-none lg:flex-nowrap lg:items-center lg:gap-1.5"
      data-keywords-toolbar-actions=""
    >
      <span className="keyword-toolbar-columns inline-flex">
        <DataTableColumnsMenu
          footerContent={columnOrderControl}
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
        label={t("filters")}
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
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent-solid px-1 font-sans tabular-nums text-ui-micro text-accent-on-solid lg:static lg:ml-1">
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
          label={t("importOrExport")}
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
          disabled={exportDisabled}
          onClick={() => {
            setTransferAnchor(null);
            transfer("export", onOpenExport);
          }}
          style={menuRowStyle}
        >
          <UploadSimple weight="regular" aria-hidden size={15} />
          {t("exportKeywords")}
        </MenuItem>
        {onImportCsv ? (
          <MenuItem
            disabled={readOnly}
            onClick={() => {
              setTransferAnchor(null);
              transfer("import", onImportCsv);
            }}
            style={menuRowStyle}
          >
            <DownloadSimple weight="regular" aria-hidden size={15} />
            {t("importKeywords")}
          </MenuItem>
        ) : null}
      </Menu>
      <span className="hidden lg:inline-flex" data-testid="keywords-export-action">
        <KeywordsToolbarButton
          iconOnly
          disabled={exportDisabled}
          label={t("export")}
          onClick={() => transfer("export", onOpenExport)}
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
              iconOnly
              disabled={readOnly}
              label={t("import")}
              onClick={() => transfer("import", onImportCsv)}
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
      <span className="ml-auto inline-flex shrink-0 items-center gap-2 lg:ml-0 lg:gap-1.5">
        <KeywordsToolbarButton
          iconOnly
          label={filterT("refreshTable")}
          loading={refreshing}
          onClick={onRefresh}
          showTooltip
          startIcon={
            <ArrowClockwise
              aria-hidden
              size={15}
              weight="regular"
              className={toolbarSecondaryIconClassName}
            />
          }
          variant="secondary"
        />
        {onAddKeyword ? (
          <ProjectReadOnlyTooltip>
            <KeywordsToolbarButton
              labelFrom="always"
              className="keyword-toolbar-add"
              showTooltip
              disabled={readOnly}
              label={t("addKeyword")}
              onClick={() => transfer("add", onAddKeyword)}
              startIcon={<Plus size={15} weight="regular" className="text-current" />}
              variant="primary"
            />
          </ProjectReadOnlyTooltip>
        ) : null}
      </span>
    </div>
  );
}
