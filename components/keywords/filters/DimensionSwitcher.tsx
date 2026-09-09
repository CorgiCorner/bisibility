"use client";

import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import { quietChipVariants } from "@/components/ui/quiet-chip-styles";
import { DEFAULT_SERP_DEPTH, SERP_ENGINE, serpDeviceOptions } from "@/lib/serp/constants";
import { cn } from "@/lib/ui/cn";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { DeviceMobileIcon as DeviceMobile } from "@phosphor-icons/react/dist/csr/DeviceMobile";
import { MonitorIcon as Monitor } from "@phosphor-icons/react/dist/csr/Monitor";
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
  // Locations must come from tracked Location refs. This component has no such source.
  location: [],
};

const DIMENSION_META: Record<DimensionKind, { lower: boolean; name: string; noun: string }> = {
  device: { lower: true, name: "Device", noun: "devices" },
  engine: { lower: false, name: "Search engine", noun: "search engines" },
  location: { lower: false, name: "Location", noun: "locations" },
};

function deviceIcon(value: string) {
  return value.toLowerCase() === "mobile" ? (
    <DeviceMobile weight="regular" aria-hidden size={15} />
  ) : (
    <Monitor weight="regular" aria-hidden size={15} />
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
  const values = kind === "location" ? [value] : DIMENSION_VALUES[kind];
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
      weight="regular"
    />
  );
  const chipShape = serpHref ? "rounded-l-full border-0" : "";

  const chip = (
    <button
      aria-controls={open ? menuId : undefined}
      aria-expanded={open}
      aria-haspopup={canTrack ? "menu" : undefined}
      className={cn(
        quietChipVariants({ size: "lg" }),
        chipShape,
        "font-sans tabular-nums text-fg outline-none transition-colors hover:border-border-control hover:bg-bg-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted",
      )}
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
            <ArrowUpRight size={12} weight="regular" />
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
          contentProps={{
            style: {
              border: "1px solid var(--border)",
              maxWidth: "calc(100vw - 24px)",
              width: 290,
            },
          }}
        >
          <div className="px-3.5 pb-1 pt-2 font-sans tabular-nums text-[9.5px] uppercase tracking-[0.5px] text-fg-muted">
            {meta.name}
          </div>
          <MenuItem
            aria-current="true"
            aria-label={`${label}, currently shown`}
            onClick={() => setAnchorEl(null)}
            selected
            style={{
              borderRadius: UI_RADIUS_ROLES.control,
              gap: 9,
              marginLeft: "5px",
              marginRight: "5px",
              minHeight: "36px",
              paddingLeft: "9px",
              paddingRight: "9px",
              "--control-selected-background-color": "var(--accent-soft)",
              "--control-selected-hover-background-color": "var(--bg-sunken)",
            }}
          >
            <span className="inline-flex shrink-0 items-center text-fg-muted">{icon}</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg" title={label}>
              {label}
            </span>
            <Check aria-hidden className="shrink-0 text-accent-text" size={13} weight="regular" />
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
              style={{
                borderRadius: UI_RADIUS_ROLES.control,
                gap: 9,
                justifyContent: "space-between",
                marginLeft: "5px",
                marginRight: "5px",
                minHeight: "34px",
                paddingLeft: "9px",
                paddingRight: "9px",
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
