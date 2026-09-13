"use client";

import { MarketSwitcher } from "@/components/shell/MarketSwitcher";
import type { HeaderContextMarket } from "@/lib/markets/header-context";
import { headerContextState } from "@/lib/markets/header-context";
import { appRootPath, type ProjectRef } from "@/lib/routing/app-path";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The slot names the AXIS, not the market. A second axis - the engine - already has a URL shape,
 * and a name that spells out "market" would have to be replaced the day it grows a producer.
 */
export const HEADER_CONTEXT_LABEL = "Change context";

export type HeaderContextSlotProps = Readonly<{
  contexts?: readonly HeaderContextMarket[];
  projectRef?: ProjectRef;
  trailingControl?: ReactNode;
}>;

/**
 * What sits between the navigation and the page title: the context the reader is inside, or
 * nothing at all.
 *
 * The list arrives as a prop from the shell, which is the only place that can fetch it; WHICH
 * of them is current is read off the pathname, exactly as the market layout resolved it. That
 * is deliberate: the market provider nests INSIDE the shell, so the header cannot read it, and
 * a second fetch here would be a client component asking the server what the URL already says.
 */
export function HeaderContextSlot({
  contexts = [],
  projectRef = "",
  trailingControl,
}: HeaderContextSlotProps) {
  const pathname = usePathname() ?? appRootPath();
  const state = headerContextState(pathname, contexts);
  if (state.kind === "none") {
    return null;
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled grouping in the header, not a fieldset of form controls
    <div
      aria-label={HEADER_CONTEXT_LABEL}
      className="flex min-w-0 flex-none items-center gap-1"
      role="group"
    >
      {contexts.length === 0 && (state.kind === "market" || state.kind === "all-markets") ? (
        <span className="flex h-8 flex-none items-center px-2 text-[13px] font-medium text-fg-muted">
          No markets
        </span>
      ) : state.kind === "market" || state.kind === "all-markets" ? (
        <MarketSwitcher
          market={state.kind === "market" ? state.market : undefined}
          markets={contexts}
          pathname={pathname}
          projectRef={projectRef}
        />
      ) : (
        // No producer mints an engine URL yet, so this states the axis and offers nothing: a
        // control that cannot change anything is worse than a label that admits it.
        <span className="flex h-8 flex-none items-center gap-1.5 px-2 text-[13px] font-medium text-fg-muted">
          <span className="max-w-[240px] min-w-0 truncate">{state.label}</span>
          <CaretDown aria-hidden className="flex-none opacity-40" size={11} weight="regular" />
        </span>
      )}
      {trailingControl}
    </div>
  );
}
