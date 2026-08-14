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
  CheckIcon as Check,
  DeviceMobileIcon as DeviceMobile,
  MonitorIcon as Monitor,
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

function deviceIcon(value: string) {
  return value.toLowerCase() === "mobile" ? (
    <DeviceMobile aria-hidden size={15} />
  ) : (
    <Monitor aria-hidden size={15} />
  );
}

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
  const normalizedValue = meta.lower ? value.toLowerCase() : value;
  const addable = values.filter(
    (item) => (meta.lower ? item.toLowerCase() : item) !== normalizedValue,
  );
  const hasAddable = addable.length > 0;
  const canTrack = hasAddable && Boolean(onTrack);
  const open = Boolean(anchorEl);
  const menuId = `dimension-menu-${kind}`;
  const current = normalizedValue;
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
  const chipShape = serpHref ? "rounded-l-full border-0" : "rounded-full border border-border";

  const chip = (
    <button
      aria-controls={open ? menuId : undefined}
      aria-expanded={open}
      aria-haspopup={canTrack ? "menu" : undefined}
      className={`inline-flex items-center gap-1.5 ${chipShape} bg-bg-sunken py-1 pl-2.5 pr-2 font-mono text-[11px] text-fg outline-none transition-colors hover:border-border-strong hover:bg-nav-active focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted`}
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
        <span className="inline-flex items-center overflow-hidden rounded-full border border-border bg-bg-sunken">
          {guardedChip}
          <a
            aria-label={`Open live Google results for ${value}`}
            className="inline-flex items-center border-l border-border bg-bg-sunken p-1.5 text-fg-muted outline-none transition-colors hover:text-accent-text focus-visible:text-accent-text focus-visible:outline-none"
            href={serpHref}
            rel="noreferrer noopener"
            target="_blank"
            title="Open live search results in a new tab"
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
          slotProps={{
            paper: {
              sx: {
                border: "1px solid var(--border)",
                maxWidth: "calc(100vw - 24px)",
                width: 290,
              },
            },
          }}
        >
          <div className="px-3.5 pb-1 pt-2 font-mono text-[9.5px] uppercase tracking-[0.5px] text-fg-muted">
            {meta.name}
          </div>
          <MenuItem
            aria-current="true"
            aria-label={`${label}, currently shown`}
            onClick={() => setAnchorEl(null)}
            selected
            sx={{
              borderRadius: "8px",
              gap: 1.125,
              marginX: "5px",
              minHeight: "36px",
              paddingX: "9px",
              "&.Mui-selected": { backgroundColor: "var(--accent-soft)" },
              "&.Mui-selected:hover": { backgroundColor: "var(--bg-sunken)" },
            }}
          >
            <span className="inline-flex shrink-0 items-center text-fg-muted">{icon}</span>
            <span
              className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-fg"
              title={label}
            >
              {label}
            </span>
            <Check aria-hidden className="shrink-0 text-accent-text" size={13} weight="bold" />
          </MenuItem>
          <div aria-hidden className="mx-2 my-1 h-px bg-border" />
          <div className="px-3.5 pt-1 text-[11px] font-semibold text-fg">
            Add a {meta.name.toLowerCase()}
          </div>
          <p className="m-0 px-3.5 pb-2 pt-1 text-[11.5px] leading-snug text-fg-muted">
            {explainer}
          </p>
          {addable.map((item) => (
            <MenuItem
              aria-label={`Add ${item}`}
              key={item}
              onClick={() => handleTrack(item)}
              title={`Add ${item}`}
              sx={{
                borderRadius: "8px",
                gap: 1.125,
                justifyContent: "space-between",
                marginX: "5px",
                minHeight: "34px",
                paddingX: "9px",
              }}
            >
              {kind === "device" ? (
                <span className="inline-flex shrink-0 items-center text-fg-muted">
                  {deviceIcon(item)}
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted" title={item}>
                {item}
              </span>
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-accent px-2 py-0.5 text-[10.5px] font-semibold text-accent-text">
                <span aria-hidden>+</span> Track
              </span>
            </MenuItem>
          ))}
        </Menu>
      ) : null}
    </>
  );
}
