"use client";

import {
  ContextSwitcherCaret,
  contextSwitcherTriggerClassName,
} from "@/components/shell/ContextSwitcherTrigger";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import type { LensDevice } from "@/lib/keywords/lens-model";
import {
  rankTrackerMutationPresence,
  rankTrackerNavigationHref,
  resetRankTrackerPage,
} from "@/lib/keywords/rank-tracker-navigation";
import {
  type NextSearchParams,
  parseRankTrackerQuery,
  resolveRankTrackerQuery,
} from "@/lib/keywords/rank-tracker-query";
import type { SavedViewConfig } from "@/lib/keywords/saved-view-model";
import { DeviceMobileIcon as DeviceMobile } from "@phosphor-icons/react/dist/csr/DeviceMobile";
import { DevicesIcon as Devices } from "@phosphor-icons/react/dist/csr/Devices";
import { MonitorIcon as Monitor } from "@phosphor-icons/react/dist/csr/Monitor";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRankTrackerSearchDraft } from "./RankTrackerSearchDraft";

export const deviceScopeOptions: readonly MenuSelectOption[] = [
  { icon: <Devices aria-hidden size={14} weight="regular" />, label: "All devices", value: "all" },
  { icon: <Monitor aria-hidden size={14} weight="regular" />, label: "Desktop", value: "desktop" },
  {
    icon: <DeviceMobile aria-hidden size={14} weight="regular" />,
    label: "Mobile",
    value: "mobile",
  },
];

function searchRecord(params: URLSearchParams): NextSearchParams {
  const record: NextSearchParams = {};
  for (const [key, value] of params) {
    const current = record[key];
    record[key] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value];
  }
  return record;
}

function isDevice(value: string): value is LensDevice {
  return value === "all" || value === "desktop" || value === "mobile";
}

export function RankTrackerDeviceHeaderControl({ savedView }: { savedView?: SavedViewConfig }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = new URLSearchParams(searchParams.toString());
  const query = resolveRankTrackerQuery(parseRankTrackerQuery(searchRecord(current)), savedView);
  const searchDraft = useRankTrackerSearchDraft();

  function changeDevice(device: string) {
    if (!isDevice(device)) return;
    const search = searchDraft?.read(query.search) ?? query.search;
    const next = resetRankTrackerPage({ ...query, search, lens: { ...query.lens, device } });
    searchDraft?.commit(search);
    router.push(
      rankTrackerNavigationHref({
        basePath: pathname,
        current,
        present: rankTrackerMutationPresence(query, next, ["device", "location", "page"]),
        query: next,
      }),
    );
  }

  return (
    <MenuSelect
      ariaLabel="Device scope"
      onChange={changeDevice}
      options={deviceScopeOptions}
      trailingIcon={<ContextSwitcherCaret />}
      triggerClassName={contextSwitcherTriggerClassName}
      value={query.lens.device}
    />
  );
}
