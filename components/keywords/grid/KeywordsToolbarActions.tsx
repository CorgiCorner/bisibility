"use client";

import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button, type ButtonProps, SegmentedControl, Tooltip } from "@/components/ui";
import { sxArray } from "@/lib/ui/mui-sx";
import Checkbox from "@mui/material/Checkbox";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import type { SxProps, Theme } from "@mui/material/styles";
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

const toggleableColumns = [
  ["change", "Change"],
  ["volume", "Volume"],
  ["sparkline", "12-wk trend"],
  ["lastChecked", "Last checked"],
  ["location", "Location"],
  ["targetRanking", "Target & ranking"],
  ["tags", "Tags"],
  ["topic", "Topic"],
  ["intent", "Intent"],
] as const;

const menuRowSx = { alignItems: "center", display: "flex", gap: "10px", minHeight: 36 };

const mobileIconOnlyButtonSx = {
  "@media (max-width:1023px)": {
    minWidth: 40,
    "& .MuiButton-startIcon": {
      marginLeft: 0,
      marginRight: 0,
    },
  },
} satisfies SxProps<Theme>;

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

type ToolbarButtonProps = Omit<ButtonProps, "sx"> & {
  label: string;
  mobileTooltip: boolean;
  sx?: SxProps<Theme>;
};

function ToolbarButton({
  children,
  label,
  mobileTooltip,
  size = "sm",
  sx,
  ...props
}: ToolbarButtonProps) {
  const buttonSx = sxArray(sx);
  const button = (
    <span className="inline-flex shrink-0">
      <Button
        aria-label={label}
        className="shrink-0 whitespace-nowrap"
        size={size}
        sx={[mobileIconOnlyButtonSx, ...buttonSx]}
        {...props}
      >
        <span className="hidden lg:inline">{label}</span>
        {children}
      </Button>
    </span>
  );

  if (props.disabled || !mobileTooltip) return button;
  return (
    <span className="inline-flex shrink-0" data-toolbar-tooltip>
      <Tooltip content={label}>{button}</Tooltip>
    </span>
  );
}

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
        <ToolbarButton
          mobileTooltip={mobileTooltips}
          aria-controls={anchorEl ? "keyword-columns-menu" : undefined}
          aria-expanded={anchorEl ? "true" : undefined}
          aria-haspopup="menu"
          label="Columns"
          onClick={(event) => setAnchorEl(event.currentTarget)}
          startIcon={<Eye size={15} />}
          sx={{ color: "var(--fg-muted)" }}
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
            <LockSimple size={14} />
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
      <ToolbarButton
        mobileTooltip={mobileTooltips}
        label="Filters"
        onClick={onOpenFilters}
        startIcon={<Funnel size={15} />}
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
      </ToolbarButton>
      <span className="hidden lg:inline-flex">
        <SegmentedControl
          activeVariant="neutral"
          ariaLabel="Table density"
          fitContent
          onChange={onDensityChange}
          options={densities.map((item) => {
            const Icon = item.icon;
            const active = item.value === density;
            return {
              ariaLabel: item.label,
              label: <Icon aria-hidden size={13} weight={active ? "fill" : "regular"} />,
              tooltip: item.label,
              value: item.value,
            };
          })}
          size="toolbar"
          value={density}
        />
      </span>
      <span className="inline-flex lg:hidden">
        <ToolbarButton
          mobileTooltip={mobileTooltips}
          aria-controls={transferAnchor ? "keyword-transfer-menu" : undefined}
          aria-expanded={transferAnchor ? "true" : undefined}
          aria-haspopup="menu"
          label="Import or export"
          onClick={(event) => setTransferAnchor(event.currentTarget)}
          startIcon={<UploadSimple size={15} />}
          sx={{ color: "var(--fg-muted)" }}
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
          <UploadSimple aria-hidden size={15} />
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
            <DownloadSimple aria-hidden size={15} />
            Import keywords
          </MenuItem>
        ) : null}
      </Menu>
      <span className="hidden lg:inline-flex">
        <ToolbarButton
          mobileTooltip={mobileTooltips}
          label="Export"
          onClick={onOpenExport}
          startIcon={<UploadSimple size={15} />}
          sx={{ color: "var(--fg-muted)" }}
          variant="secondary"
        />
      </span>
      {onImportCsv ? (
        <span className="hidden lg:inline-flex">
          <ProjectReadOnlyTooltip>
            <ToolbarButton
              mobileTooltip={mobileTooltips}
              disabled={readOnly}
              label="Import"
              onClick={onImportCsv}
              startIcon={<DownloadSimple size={15} />}
              sx={{ color: "var(--fg-muted)" }}
              variant="secondary"
            />
          </ProjectReadOnlyTooltip>
        </span>
      ) : null}
      {onAddKeyword ? (
        <ProjectReadOnlyTooltip>
          <ToolbarButton
            mobileTooltip={mobileTooltips}
            disabled={readOnly}
            label="Add keyword"
            onClick={onAddKeyword}
            startIcon={<Plus size={15} weight="bold" />}
            variant="primary"
          />
        </ProjectReadOnlyTooltip>
      ) : null}
    </div>
  );
}
