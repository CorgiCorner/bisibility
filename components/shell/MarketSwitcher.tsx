"use client";

import { ALL_MARKETS_VALUE, MarketSwitcherMenu } from "@/components/shell/MarketSwitcherMenu";
import { Popup as Popover } from "@/components/ui/Popup";
import { Tooltip } from "@/components/ui/Tooltip";
import type { HeaderContextMarket } from "@/lib/markets/header-context";
import { marketSwitchDestination } from "@/lib/markets/header-context";
import { MARKETS_SECTION } from "@/lib/markets/market-routes";
import { appPath, contextFreePathname, type ProjectRef } from "@/lib/routing/app-path";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { CaretUpDownIcon as CaretUpDown } from "@phosphor-icons/react/dist/csr/CaretUpDown";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { flushSync } from "react-dom";

const PAPER_STYLE = {
  backgroundColor: "var(--bg-elev)",
  border: "1px solid var(--border-control)",
  borderRadius: UI_RADIUS_ROLES.card,
  boxShadow: "none",
  color: "var(--fg)",
  marginTop: "6px",
} as const;

export type MarketSwitcherProps = Readonly<{
  market?: HeaderContextMarket;
  onSelectMarket?: (value: string) => void;
  /** Null hides creation; a callback keeps creation in the current page's flow. */
  onAddMarket?: (() => void) | null;
  showAllMarkets?: boolean;
  markets: readonly HeaderContextMarket[];
  pathname: string;
  projectRef: ProjectRef;
}>;

/**
 * The market the reader is inside, and the way to another one. It follows `TargetSwitcher`: a
 * quiet control beside the title whose accessible name is the market itself.
 *
 * The popover is a dialog rather than a menu because it holds three different things - a field,
 * a list and an action - and a menu that contains a text input is a menu in name only.
 */
export function MarketSwitcher({
  market,
  markets,
  onSelectMarket,
  onAddMarket,
  showAllMarkets = true,
  pathname,
  projectRef,
}: MarketSwitcherProps) {
  const router = useRouter();
  const label = market?.name ?? (markets.length ? "All markets" : "No markets");
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const open = Boolean(anchorEl);

  function close(restoreFocus: boolean) {
    const trigger = anchorEl;
    if (restoreFocus) {
      // Release the popover focus trap before handing focus back to the trigger.
      flushSync(() => setAnchorEl(null));
      trigger?.focus();
    } else {
      setAnchorEl(null);
    }
  }

  function leaveMarket() {
    router.push(contextFreePathname(pathname));
  }

  function select(value: string) {
    close(false);
    if (onSelectMarket) {
      onSelectMarket(value);
      return;
    }
    if (value === ALL_MARKETS_VALUE) {
      leaveMarket();
      return;
    }
    if (value !== market?.ref) {
      router.push(marketSwitchDestination({ marketRef: value, pathname, projectRef }));
    }
  }

  return (
    <>
      <Tooltip content={label} semantics="description">
        <button
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={label}
          className="flex h-8 min-w-0 flex-none items-center gap-1.5 rounded-control border border-border-control bg-bg-elev px-2.5 text-[13px] font-medium text-fg outline-none transition-colors hover:border-border-control hover:bg-bg-sunken focus-visible:border-accent"
          // While the popover is open its own backdrop covers the trigger, so this cannot fire
          // as a second toggle: a click there closes through `onClose` and never reaches here.
          onClick={(event) => setAnchorEl(event.currentTarget)}
          type="button"
        >
          <span className="max-w-[100px] min-w-0 truncate sm:max-w-[240px]" data-market-name>
            {label}
          </span>
          <CaretUpDown aria-hidden className="flex-none text-fg-muted" size={14} weight="regular" />
        </button>
      </Tooltip>
      <Popover
        anchorEl={anchorEl}
        align="start"
        side="bottom"
        autoFocus={false}
        restoreFocus="escape"
        onClose={() => close(false)}
        open={open}
        contentProps={{ style: PAPER_STYLE }}
      >
        <MarketSwitcherMenu
          markets={markets}
          onAddMarket={
            onAddMarket === null
              ? undefined
              : () => {
                  close(false);
                  if (onAddMarket) onAddMarket();
                  else router.push(`${appPath(projectRef, MARKETS_SECTION)}?new-market=1`);
                }
          }
          onDismiss={() => close(true)}
          onSelect={select}
          selectedValue={market?.ref ?? ALL_MARKETS_VALUE}
          showAllMarkets={showAllMarkets}
        />
      </Popover>
    </>
  );
}
