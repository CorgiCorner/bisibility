"use client";

import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { SegmentedControl } from "@/components/ui";
import Checkbox from "@mui/material/Checkbox";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { GridColumnVisibilityModel, GridDensity } from "@mui/x-data-grid";
import {
  DownloadSimpleIcon as DownloadSimple,
  EyeIcon as Eye,
  FunnelIcon as Funnel,
  ListIcon as List,
  ListDashesIcon as ListDashes,
  LockSimpleIcon as LockSimple,
  PlusIcon as Plus,
  RowsIcon as Rows,
  UploadSimpleIcon as UploadSimple,
} from "@phosphor-icons/react";
import { useState } from "react";
import { KeywordsToolbarButton } from "./KeywordsToolbarButton";

const toggleableColumns = [
  ["change", "Change"],
  ["volume", "Volume"],
  ["sparkline", "12-wk trend"],
  ["lastChecked", "Last checked"],
  ["location", "Location"],
  ["targetRanking", "Target and ranking"],
  ["tags", "Tags"],
  ["topic", "Topic"],
  ["intent", "Intent"],
] as const;

const menuRowSx = { alignItems: "center", display: "flex", gap: "10px", minHeight: 36 };

const densities = [
  { value: "compact", label: "Compact", icon: ListDashes },
  { value: "standard", label: "Standard", icon: List },
  { value: "comfortable", label: "Comfortable", icon: Rows },
] satisfies { value: GridDensity; label: string; icon: typeof List }[];

type KeywordsToolbarActionsProps = {
  columnVisibilityModel: GridColumnVisibilityModel;
  density: GridDensity;
  filterCount: number;
  onAddKeyword?: () => void;
  onColumnVisibilityChange: (model: GridColumnVisibilityModel) => void;
  onDensityChange: (density: GridDensity) => void;
  onImportCsv?: () => void;
  onOpenExport: () => void;
  onOpenFilters: () => void;
};

export function KeywordsToolbarActions({
  columnVisibilityModel,
  density,
  filterCount,
  onAddKeyword,
  onColumnVisibilityChange,
  onDensityChange,
  onImportCsv,
  onOpenExport,
  onOpenFilters,
}: Readonly<KeywordsToolbarActionsProps>) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [transferAnchor, setTransferAnchor] = useState<null | HTMLElement>(null);
  const { readOnly } = useProjectWriteMode();
  const mobileTooltips = useMediaQuery("(max-width:1023px)");
  const hasFilters = filterCount > 0;

  function toggleColumn(field: keyof typeof columnVisibilityModel) {
    onColumnVisibilityChange({
      ...columnVisibilityModel,
      [field]: columnVisibilityModel[field] === false,
    });
  }

  return (
    <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1.5">
      <span className="hidden lg:inline-flex">
        <KeywordsToolbarButton
          showTooltip={mobileTooltips}
          aria-controls={anchorEl ? "keyword-columns-menu" : undefined}
          aria-expanded={anchorEl ? "true" : undefined}
          aria-haspopup="menu"
          label="Columns"
          onClick={(event) => setAnchorEl(event.currentTarget)}
          startIcon={<Eye weight="regular" size={15} className="text-current" />}
          variant="secondary"
        />
      </span>
      <Menu
        anchorEl={anchorEl}
        id="keyword-columns-menu"
        onClose={() => setAnchorEl(null)}
        open={Boolean(anchorEl)}
        slotProps={{ paper: { sx: { border: "1px solid var(--border)" } } }}
      >
        <div className="px-4 pb-1 pt-2 font-mono text-[11px] uppercase tracking-[0.6px] text-fg-muted">
          Toggle columns
        </div>
        <MenuItem disabled sx={menuRowSx}>
          <span className="grid w-[18px] place-items-center">
            <LockSimple weight="regular" size={14} />
          </span>
          {"Keyword / Pos "}
        </MenuItem>
        {toggleableColumns.map(([field, label]) => (
          <MenuItem key={field} onClick={() => toggleColumn(field)} sx={menuRowSx}>
            <Checkbox
              checked={columnVisibilityModel[field] !== false}
              size="small"
              sx={{ padding: 0, width: 18 }}
            />
            {label}
          </MenuItem>
        ))}
      </Menu>
      <KeywordsToolbarButton
        showTooltip={mobileTooltips}
        label="Filters"
        onClick={onOpenFilters}
        startIcon={<Funnel weight="regular" size={15} className="text-current" />}
        sx={{
          backgroundColor: hasFilters ? "var(--accent-soft)" : "var(--bg-elev)",
          color: hasFilters ? "var(--accent)" : "var(--fg-muted)",
        }}
        variant="secondary"
      >
        {hasFilters ? (
          <span className="ml-1 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-accent-solid px-1 font-mono text-[11px] text-accent-on-solid">
            {filterCount}
          </span>
        ) : null}
      </KeywordsToolbarButton>
      <span className="hidden lg:inline-flex">
        <SegmentedControl
          activeVariant="neutral"
          ariaLabel="Table density"
          fitContent
          onChange={onDensityChange}
          options={densities.map((item) => {
            const Icon = item.icon;
            return {
              ariaLabel: item.label,
              label: <Icon aria-hidden size={13} weight="regular" />,
              tooltip: item.label,
              value: item.value,
            };
          })}
          size="toolbar"
          value={density}
        />
      </span>
      <span className="inline-flex lg:hidden">
        <KeywordsToolbarButton
          showTooltip={mobileTooltips}
          aria-controls={transferAnchor ? "keyword-transfer-menu" : undefined}
          aria-expanded={transferAnchor ? "true" : undefined}
          aria-haspopup="menu"
          label="Import or export"
          onClick={(event) => setTransferAnchor(event.currentTarget)}
          startIcon={<UploadSimple weight="regular" size={15} className="text-current" />}
          variant="secondary"
        />
      </span>
      <Menu
        anchorEl={transferAnchor}
        id="keyword-transfer-menu"
        onClose={() => setTransferAnchor(null)}
        open={Boolean(transferAnchor)}
        slotProps={{ paper: { sx: { border: "1px solid var(--border)", minWidth: 190 } } }}
      >
        <MenuItem
          onClick={() => {
            setTransferAnchor(null);
            onOpenExport();
          }}
          sx={menuRowSx}
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
            sx={menuRowSx}
          >
            <DownloadSimple weight="regular" aria-hidden size={15} />
            Import keywords
          </MenuItem>
        ) : null}
      </Menu>
      <span
        className="hidden lg:inline-flex xl:hidden"
        data-testid="keywords-export-compact-action"
      >
        <KeywordsToolbarButton
          iconOnly
          label="Export"
          onClick={onOpenExport}
          showTooltip
          startIcon={
            <UploadSimple aria-hidden weight="regular" size={15} className="text-current" />
          }
          variant="secondary"
        />
      </span>
      <span className="hidden xl:inline-flex" data-testid="keywords-export-labeled-action">
        <KeywordsToolbarButton
          label="Export"
          onClick={onOpenExport}
          showTooltip={false}
          startIcon={
            <UploadSimple aria-hidden weight="regular" size={15} className="text-current" />
          }
          variant="secondary"
        />
      </span>
      {onImportCsv ? (
        <>
          <span
            className="hidden lg:inline-flex xl:hidden"
            data-testid="keywords-import-compact-action"
          >
            <ProjectReadOnlyTooltip>
              <KeywordsToolbarButton
                disabled={readOnly}
                iconOnly
                label="Import"
                onClick={onImportCsv}
                showTooltip
                startIcon={
                  <DownloadSimple aria-hidden weight="regular" size={15} className="text-current" />
                }
                variant="secondary"
              />
            </ProjectReadOnlyTooltip>
          </span>
          <span className="hidden xl:inline-flex" data-testid="keywords-import-labeled-action">
            <ProjectReadOnlyTooltip>
              <KeywordsToolbarButton
                disabled={readOnly}
                label="Import"
                onClick={onImportCsv}
                showTooltip={false}
                startIcon={
                  <DownloadSimple aria-hidden weight="regular" size={15} className="text-current" />
                }
                variant="secondary"
              />
            </ProjectReadOnlyTooltip>
          </span>
        </>
      ) : null}
      {onAddKeyword ? (
        <ProjectReadOnlyTooltip>
          <KeywordsToolbarButton
            showTooltip={mobileTooltips}
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
