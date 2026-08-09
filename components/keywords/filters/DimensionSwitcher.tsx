"use client";

import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import {
  DEFAULT_SERP_DEPTH,
  SERP_ENGINE,
  serpDeviceOptions,
  serpMarketOptions,
} from "@/lib/serp/markets";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import {
  ArrowUpRightIcon as ArrowUpRight,
  CaretDownIcon as CaretDown,
} from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";

export type DimensionKind = "device" | "engine" | "location";

type SerpLocaleLocation = {
  countryCode: string;
  gl: string;
  hl: string;
};

export function localeForLocation(location: SerpLocaleLocation) {
  return {
    code: location.countryCode || location.gl.toUpperCase(),
    gl: location.gl,
    hl: location.hl,
  };
}

export function buildGoogleSerpUrl(keyword: string, location: SerpLocaleLocation) {
  const { gl, hl } = localeForLocation(location);
  return `https://www.google.com/search?q=${encodeURIComponent(keyword)}&gl=${gl}&hl=${hl}&num=${DEFAULT_SERP_DEPTH}`;
}

// Device values mirror the keyword `deviceSchema` enum so a tracked dimension always
// resolves to something the rank-check pipeline can run. Tablet is intentionally absent.
const DIMENSION_VALUES: Record<DimensionKind, string[]> = {
  device: serpDeviceOptions.map((option) => option.label),
  engine: [SERP_ENGINE.label],
  location: [...serpMarketOptions],
};

const DIMENSION_META: Record<DimensionKind, { lower: boolean; name: string; noun: string }> = {
  device: { lower: true, name: "Device", noun: "devices" },
  engine: { lower: false, name: "Search engine", noun: "search engines" },
  location: { lower: false, name: "Location", noun: "locations" },
};

type DimensionSwitcherProps = {
  icon: ReactNode;
  kind: DimensionKind;
  label: string;
  onTrack?: (kind: DimensionKind, value: string) => void;
  serpHref?: string;
  value: string;
};

export function DimensionSwitcher({
  icon,
  kind,
  label,
  onTrack,
  serpHref,
  value,
}: Readonly<DimensionSwitcherProps>) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const { readOnly } = useProjectWriteMode();
  const meta = DIMENSION_META[kind];
  const values =
    kind === "location" && !DIMENSION_VALUES.location.includes(value)
      ? [value, ...DIMENSION_VALUES.location]
      : DIMENSION_VALUES[kind];
  const addable = values.filter((item) => item !== value);
  const hasAddable = addable.length > 0;
  const canTrack = hasAddable && Boolean(onTrack);
  const open = Boolean(anchorEl);
  const menuId = `dimension-menu-${kind}`;
  const current = meta.lower ? value.toLowerCase() : value;
  let suggestion = "another option";
  if (addable[0]) suggestion = meta.lower ? addable[0].toLowerCase() : addable[0];
  const explainer = `You're only tracking ${current}. Add ${suggestion} to compare rankings across ${meta.noun}.`;

  function handleTrack(item: string) {
    setAnchorEl(null);
    onTrack?.(kind, item);
  }

  const caret = (
    <CaretDown
      className={`text-fg-muted transition-transform ${open ? "rotate-180" : ""}`}
      size={11}
      weight="bold"
    />
  );

  const chip = (
    <button
      aria-controls={open ? menuId : undefined}
      aria-expanded={open}
      aria-haspopup={canTrack ? "menu" : undefined}
      className="inline-flex items-center gap-1.5 rounded-full bg-bg-sunken py-1 pl-2.5 pr-2 font-mono text-[11px] text-fg-muted outline-none transition-colors hover:text-fg focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted"
      disabled={!canTrack || readOnly}
      onClick={(event) => {
        if (canTrack && !readOnly) setAnchorEl(event.currentTarget);
      }}
      type="button"
    >
      {icon}
      {label}
      {canTrack ? caret : null}
    </button>
  );
  const guardedChip =
    readOnly && canTrack ? <ProjectReadOnlyTooltip>{chip}</ProjectReadOnlyTooltip> : chip;

  return (
    <>
      {serpHref ? (
        <span className="inline-flex items-center gap-1">
          {guardedChip}
          <a
            aria-label={`Open live Google results for ${value}`}
            className="inline-flex items-center rounded-full bg-bg-sunken p-1.5 text-fg-muted outline-none transition-colors hover:text-accent-text focus-visible:text-accent-text focus-visible:outline-none"
            href={serpHref}
            rel="noreferrer noopener"
            target="_blank"
          >
            <ArrowUpRight size={12} weight="bold" />
          </a>
        </span>
      ) : (
        guardedChip
      )}
      {canTrack ? (
        <Menu
          anchorEl={anchorEl}
          id={menuId}
          onClose={() => setAnchorEl(null)}
          open={open}
          slotProps={{ paper: { sx: { border: "1px solid var(--border)", maxWidth: 288 } } }}
        >
          <div className="px-4 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.6px] text-fg-muted">
            {meta.name}
          </div>
          <div className="px-4 pt-1 text-[11px] font-semibold text-fg">
            Add a {meta.name.toLowerCase()}
          </div>
          <p className="m-0 px-4 pb-2 pt-1 text-[11.5px] leading-snug text-fg-muted">{explainer}</p>
          {addable.map((item) => (
            <MenuItem
              key={item}
              onClick={() => handleTrack(item)}
              sx={{ gap: 2, justifyContent: "space-between" }}
            >
              <span className="text-[13px] text-fg">{item}</span>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-text">
                + Track
              </span>
            </MenuItem>
          ))}
        </Menu>
      ) : null}
    </>
  );
}
