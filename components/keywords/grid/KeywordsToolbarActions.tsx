"use client";

import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button, type ButtonProps } from "@/components/ui";
import { sxArray } from "@/lib/ui/mui-sx";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import type { SxProps, Theme } from "@mui/material/styles";
import Tooltip from "@mui/material/Tooltip";
import type { GridColumnVisibilityModel, GridDensity } from "@mui/x-data-grid";
import {
  ExportIcon as Export,
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
  "@media (max-width:1536px)": {
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
  sx?: SxProps<Theme>;
};

function ToolbarButton({ children, label, size = "sm", sx, ...props }: ToolbarButtonProps) {
  const buttonSx = sxArray(sx);
  const button = (
    <span className="inline-flex">
      <Button aria-label={label} size={size} sx={[mobileIconOnlyButtonSx, ...buttonSx]} {...props}>
        <span className="max-[1536px]:hidden">{label}</span>
        {children}
      </Button>
    </span>
  );

  return props.disabled ? button : <Tooltip title={label}>{button}</Tooltip>;
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
  const { readOnly } = useProjectWriteMode();
  const hasFilters = filterCount > 0;

  function toggleColumn(field: keyof typeof columnVisibilityModel) {
    onColumnVisibilityChange({
      ...columnVisibilityModel,
      [field]: columnVisibilityModel[field] === false,
    });
  }

  return (
    <div className="flex flex-nowrap items-center justify-end gap-1.5">
      <span className="hidden sm:inline-flex">
        <ToolbarButton
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
        <div className="px-4 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.6px] text-fg-muted">
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
          <span className="ml-1 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-accent-solid px-1 font-mono text-[10px] text-primary-contrast">
            {filterCount}
          </span>
        ) : null}
      </ToolbarButton>
      <div className="hidden items-center gap-0.5 rounded-[9px] border border-border-strong bg-bg-elev p-0.5 sm:flex">
        {densities.map((item) => {
          const Icon = item.icon;
          const active = item.value === density;
          return (
            <Tooltip key={item.value} title={item.label}>
              <IconButton
                aria-label={item.label}
                aria-pressed={active}
                onClick={() => onDensityChange(item.value)}
                size="small"
                sx={{
                  "&:hover": {
                    backgroundColor: active ? "var(--accent-soft)" : "var(--bg-sunken)",
                    color: active ? "var(--accent-hover)" : "var(--fg)",
                  },
                  backgroundColor: active ? "var(--bg-sunken)" : "transparent",
                  borderRadius: "7px",
                  boxShadow: active ? "0 0 0 1px var(--border-strong)" : "none",
                  color: active ? "var(--accent)" : "var(--fg-muted)",
                  height: 28,
                  width: 30,
                }}
              >
                <Icon aria-hidden size={15} weight={active ? "bold" : "regular"} />
              </IconButton>
            </Tooltip>
          );
        })}
      </div>
      <span className="hidden sm:inline-flex">
        <ToolbarButton
          label="Export"
          onClick={onOpenExport}
          startIcon={<Export size={15} />}
          sx={{ color: "var(--fg-muted)" }}
          variant="secondary"
        />
      </span>
      {onImportCsv ? (
        <span className="hidden sm:inline-flex">
          <ProjectReadOnlyTooltip>
            <ToolbarButton
              disabled={readOnly}
              label="Import"
              onClick={onImportCsv}
              startIcon={<UploadSimple size={15} />}
              sx={{ color: "var(--fg-muted)" }}
              variant="secondary"
            />
          </ProjectReadOnlyTooltip>
        </span>
      ) : null}
      {onAddKeyword ? (
        <ProjectReadOnlyTooltip>
          <ToolbarButton
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
