"use client";

import { deviceScopeOptions } from "@/components/keywords/RankTrackerDeviceHeaderControl";
import {
  ContextSwitcherCaret,
  contextSwitcherTriggerClassName,
} from "@/components/shell/ContextSwitcherTrigger";
import { HEADER_CONTEXT_LABEL } from "@/components/shell/HeaderContextSlot";
import { MenuMultiSelect, MenuSelect } from "@/components/ui/MenuSelect";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { OverviewView } from "./types";

export function OverviewHeaderContext({
  options,
}: Readonly<{
  options: OverviewView["toolbar"]["marketOptions"];
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const deviceValue = searchParams.get("device");
  const selectedDevice =
    deviceValue === "desktop" || deviceValue === "mobile" ? deviceValue : "all";
  if (!options.length) return null;

  function changeMarkets(values: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("market");
    for (const value of values) params.append("market", value);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function changeDevice(value: string) {
    if (value !== "all" && value !== "desktop" && value !== "mobile") return;
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("device");
    else params.set("device", value);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: labelled header context, matching the shared shell slot
    <div
      aria-label={HEADER_CONTEXT_LABEL}
      className="flex min-w-0 flex-none items-center gap-1"
      role="group"
    >
      <MenuMultiSelect
        allLabel="All markets"
        ariaLabel="Markets"
        minSelected={0}
        onChange={changeMarkets}
        options={options}
        placeholder="All markets"
        summary={(markets) => {
          if (markets.length === 0) return "All markets";
          if (markets.length === 1) return `${markets[0]?.label} / ${markets[0]?.secondary}`;
          return `${markets.length} markets`;
        }}
        trailingIcon={<ContextSwitcherCaret />}
        triggerClassName={`${contextSwitcherTriggerClassName} max-w-[150px] sm:max-w-[280px]`}
        values={searchParams.getAll("market")}
      />
      <MenuSelect
        ariaLabel="Device scope"
        onChange={changeDevice}
        options={deviceScopeOptions}
        trailingIcon={<ContextSwitcherCaret />}
        triggerClassName={contextSwitcherTriggerClassName}
        value={selectedDevice}
      />
    </div>
  );
}
