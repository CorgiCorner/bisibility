"use client";

import {
  ContextSwitcherCaret,
  contextSwitcherTriggerClassName,
} from "@/components/shell/ContextSwitcherTrigger";
import { MenuMultiSelect, MenuSelect } from "@/components/ui/MenuSelect";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { OverviewView } from "./types";

export function OverviewHeaderContext({
  options,
}: Readonly<{
  options: OverviewView["toolbar"]["marketOptions"];
}>) {
  const t = useTranslations("projectDashboard.headerContext");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const deviceValue = searchParams.get("device");
  const selectedDevice =
    deviceValue === "desktop" || deviceValue === "mobile" ? deviceValue : "all";
  if (!options.length) return null;
  const deviceScopeOptions = [
    { label: t("allDevices"), value: "all" },
    { label: t("desktop"), value: "desktop" },
    { label: t("mobile"), value: "mobile" },
  ];

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
    <div aria-label={t("changeContext")} className="flex min-w-0 items-center gap-1" role="group">
      <MenuMultiSelect
        allLabel={t("allMarkets")}
        ariaLabel={t("markets")}
        minSelected={0}
        onChange={changeMarkets}
        options={options}
        placeholder={t("allMarkets")}
        summary={(markets) => {
          if (markets.length === 0) return t("allMarkets");
          if (markets.length === 1) return `${markets[0]?.label} / ${markets[0]?.secondary}`;
          return t("marketCount", { count: markets.length });
        }}
        trailingIcon={<ContextSwitcherCaret />}
        triggerClassName={`${contextSwitcherTriggerClassName} max-w-[116px] sm:max-w-[280px]`}
        values={searchParams.getAll("market")}
      />
      <MenuSelect
        ariaLabel={t("deviceScope")}
        onChange={changeDevice}
        options={deviceScopeOptions}
        trailingIcon={<ContextSwitcherCaret />}
        triggerClassName={`${contextSwitcherTriggerClassName} max-w-[108px] sm:max-w-none`}
        value={selectedDevice}
      />
    </div>
  );
}
