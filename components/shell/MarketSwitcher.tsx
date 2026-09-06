"use client";

import { ALL_MARKETS_VALUE, MarketSwitcherMenu } from "@/components/shell/MarketSwitcherMenu";
import { Tooltip } from "@/components/ui";
import type { HeaderContextMarket } from "@/lib/markets/header-context";
import { marketSwitchDestination } from "@/lib/markets/header-context";
import { MARKETS_SECTION } from "@/lib/markets/market-routes";
import { appPath, contextFreePathname, type ProjectRef } from "@/lib/routing/app-path";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import Popover from "@mui/material/Popover";
import { CaretDownIcon as CaretDown, XIcon as X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const PAPER_SX = {
  backgroundColor: "var(--bg-elev)",
  border: "1px solid var(--border-control)",
  borderRadius: UI_RADIUS_ROLES.card,
  boxShadow: "none",
  color: "var(--fg)",
  marginTop: "6px",
} as const;

export type MarketSwitcherProps = Readonly<{
  market: HeaderContextMarket;
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
export function MarketSwitcher({ market, markets, pathname, projectRef }: MarketSwitcherProps) {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const open = Boolean(anchorEl);

  function close(restoreFocus: boolean) {
    const trigger = anchorEl;
    setAnchorEl(null);
    // Only the keyboard gets focus back. Restoring it after a click on the backdrop leaves a
    // focus ring on a control the reader dismissed with the mouse.
    if (restoreFocus) trigger?.focus();
  }

  function leaveMarket() {
    router.push(contextFreePathname(pathname));
  }

  function select(value: string) {
    close(false);
    if (value === ALL_MARKETS_VALUE) {
      leaveMarket();
      return;
    }
    if (value !== market.ref) {
      router.push(marketSwitchDestination({ marketRef: value, pathname, projectRef }));
    }
  }

  return (
    <>
      <Tooltip content={market.name} semantics="description">
        <button
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={market.name}
          className="flex h-8 min-w-0 flex-none items-center gap-1.5 rounded-control border border-transparent px-2 text-[13px] font-medium text-fg outline-none transition-colors hover:border-border-control hover:bg-bg-sunken focus-visible:border-accent"
          // While the popover is open its own backdrop covers the trigger, so this cannot fire
          // as a second toggle: a click there closes through `onClose` and never reaches here.
          onClick={(event) => setAnchorEl(event.currentTarget)}
          type="button"
        >
          <span className="max-w-[240px] min-w-0 truncate" data-market-name>
            {market.name}
          </span>
          <CaretDown aria-hidden className="flex-none text-fg-muted" size={11} weight="regular" />
        </button>
      </Tooltip>
      <button
        aria-label="Back to all markets"
        className="grid h-6 w-6 flex-none place-items-center rounded-control border-0 bg-transparent p-0 text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg"
        onClick={leaveMarket}
        type="button"
      >
        <X aria-hidden size={13} weight="regular" />
      </button>
      <Popover
        anchorEl={anchorEl}
        anchorOrigin={{ horizontal: "left", vertical: "bottom" }}
        // The dialog takes its own focus through a ref callback, and gives it back on Escape,
        // so neither end of the popover lifecycle needs an effect.
        disableAutoFocus
        disableRestoreFocus
        onClose={() => close(false)}
        open={open}
        slotProps={{ paper: { elevation: 0, sx: PAPER_SX } }}
        transformOrigin={{ horizontal: "left", vertical: "top" }}
        // Instant: a header popover that grows out of the title reads as a page transition.
        transitionDuration={0}
      >
        <MarketSwitcherMenu
          markets={markets}
          onAddMarket={() => {
            close(false);
            router.push(appPath(projectRef, MARKETS_SECTION));
          }}
          onDismiss={() => close(true)}
          onSelect={select}
          selectedValue={market.ref}
        />
      </Popover>
    </>
  );
}
