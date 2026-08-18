"use client";

import { Toolbar } from "@/components/shell/Toolbar";
import { Button, MenuMultiSelect, Pill } from "@/components/ui";
import { appPath } from "@/lib/routing/app-path";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import {
  CalendarBlankIcon as CalendarBlank,
  CaretDownIcon as CaretDown,
  CheckIcon as Check,
  GlobeHemisphereWestIcon as Globe,
  MonitorIcon as Monitor,
  PlusIcon as Plus,
  TagIcon as Tag,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useState } from "react";
import type { OverviewView } from "./types";

type MenuKey = "range" | "device" | "tag";
type SelectedFilters = OverviewView["toolbar"];

type FilterOption = { label: string; value: string | null };
type FilterMenu = {
  icon: ReactNode;
  key: MenuKey;
  options: readonly FilterOption[];
  prefix: string;
  selected: string | null;
};

const RANGE_OPTIONS: readonly FilterOption[] = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 28 days", value: "28d" },
  { label: "Last 90 days", value: "90d" },
];

const DEVICE_OPTIONS: readonly FilterOption[] = [
  { label: "All devices", value: "all" },
  { label: "Desktop", value: "desktop" },
  { label: "Mobile", value: "mobile" },
];

const OVERVIEW_FILTER_CLASS = "overview-toolbar-filter";
const OVERVIEW_MARKET_FILTER_CLASS = `${OVERVIEW_FILTER_CLASS} !rounded-full !bg-bg-elev !px-3 !text-xs !font-semibold !text-fg-muted hover:!border-accent hover:!bg-bg-sunken hover:!text-accent`;

function tagOptions(tags: readonly string[]): FilterOption[] {
  return [{ label: "All tags", value: null }, ...tags.map((tag) => ({ label: tag, value: tag }))];
}

function filterMenus(selected: SelectedFilters): readonly FilterMenu[] {
  return [
    {
      icon: <CalendarBlank aria-hidden className="text-fg-muted" size={15} />,
      key: "range",
      options: RANGE_OPTIONS,
      prefix: "",
      selected: selected.rangeValue,
    },
    {
      icon: <Monitor aria-hidden className="text-fg-muted" size={15} />,
      key: "device",
      options: DEVICE_OPTIONS,
      prefix: "",
      selected: selected.deviceValue,
    },
    {
      icon: <Tag aria-hidden className="text-fg-muted" size={15} />,
      key: "tag",
      options: tagOptions(selected.availableTags),
      prefix: "Tag: ",
      selected: selected.tagValue,
    },
  ];
}

const PAPER_SX = {
  backgroundColor: "var(--bg-elev)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  boxShadow: "none",
  color: "var(--fg)",
  marginTop: "6px",
  minWidth: 168,
  padding: "6px",
} as const;

const ROW_SX = {
  borderRadius: "9px",
  color: "var(--fg-muted)",
  fontSize: "13px",
  gap: "12px",
  justifyContent: "space-between",
  minHeight: 0,
  paddingX: "9px",
  paddingY: "8px",
  "&:hover": { backgroundColor: "var(--nav-active)" },
  "&.Mui-focusVisible": { backgroundColor: "var(--nav-active)" },
} as const;

export function OverviewToolbar({
  initialSelected,
  projectRef,
}: Readonly<{ initialSelected?: SelectedFilters; projectRef: string }>) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [openKey, setOpenKey] = useState<MenuKey | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selected = initialSelected ?? {
    availableTags: [],
    device: "All devices",
    deviceValue: "all",
    marketOptions: [],
    marketValues: [],
    range: "Last 28 days",
    rangeValue: "28d",
    tag: "All tags",
    tagValue: null,
  };
  const menus = filterMenus(selected);

  function openMenu(key: MenuKey, target: HTMLElement) {
    setAnchorEl(target);
    setOpenKey(key);
  }

  function hrefFor(key: MenuKey, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    const defaults = { device: "all", range: "28d", tag: null } satisfies Record<
      MenuKey,
      string | null
    >;
    if (value === defaults[key] || value === null) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function changeMarkets(values: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("market");
    for (const value of values) params.append("market", value);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="-mx-4 -mt-4 mb-5.5 sm:-mx-5 lg:-mx-7 lg:-mt-5.5">
      <Toolbar
        action={
          <Button
            component={Link}
            href={appPath(projectRef, "rank-tracker?add=1")}
            size="sm"
            startIcon={<Plus size={15} weight="bold" />}
            sx={{ height: 37, minHeight: 37, whiteSpace: "nowrap" }}
            variant="primary"
          >
            <span className="hidden sm:inline">Add keyword</span>
            <span className="sm:hidden">Add</span>
          </Button>
        }
      >
        {selected.marketOptions.length > 0 ? (
          <MenuMultiSelect
            allLabel="All markets"
            ariaLabel="Markets"
            leadingIcon={<Globe aria-hidden size={15} />}
            minSelected={0}
            onChange={changeMarkets}
            options={selected.marketOptions}
            placeholder="All markets"
            summary={(markets) => {
              if (markets.length === 0) return "All markets";
              if (markets.length === 1) {
                return `${markets[0]?.label} / ${markets[0]?.secondary}`;
              }
              return `${markets.length} markets`;
            }}
            triggerClassName={OVERVIEW_MARKET_FILTER_CLASS}
            values={selected.marketValues}
          />
        ) : null}
        {menus.map((menu) => {
          const open = openKey === menu.key;
          return (
            <Pill
              aria-controls={open ? `overview-${menu.key}-menu` : undefined}
              aria-expanded={open}
              aria-haspopup="menu"
              className={OVERVIEW_FILTER_CLASS}
              key={menu.key}
              onClick={(event) => openMenu(menu.key, event.currentTarget)}
            >
              {menu.icon}
              {`${menu.prefix}${selected[menu.key]}`}
              <CaretDown aria-hidden className="text-fg-muted" size={11} weight="bold" />
            </Pill>
          );
        })}
      </Toolbar>
      {menus.map((menu) => (
        <Menu
          anchorEl={anchorEl}
          disableRestoreFocus
          id={`overview-${menu.key}-menu`}
          key={menu.key}
          onClose={() => setOpenKey(null)}
          open={openKey === menu.key}
          slotProps={{
            list: { "aria-label": menu.key, dense: true, sx: { padding: 0 } },
            paper: { sx: PAPER_SX },
          }}
        >
          {menu.options.map((option) => {
            const current = menu.selected === option.value;
            return (
              <MenuItem
                component={Link}
                href={hrefFor(menu.key, option.value)}
                key={`${menu.key}:${option.value ?? "all"}`}
                onClick={() => setOpenKey(null)}
                sx={ROW_SX}
              >
                <span className={current ? "font-semibold text-fg" : undefined}>
                  {option.label}
                </span>
                {current ? (
                  <Check aria-hidden className="text-accent-text" size={15} weight="bold" />
                ) : null}
              </MenuItem>
            );
          })}
        </Menu>
      ))}
    </div>
  );
}
