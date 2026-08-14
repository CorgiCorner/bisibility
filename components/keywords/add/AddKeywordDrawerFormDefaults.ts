import type { LocationFieldValue } from "@/components/keywords/LocationField";
import type { AddKeywordDrawerForm } from "@/lib/keywords/add-keyword-drawer-shared";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { SerpDevice } from "@/lib/serp/markets";
import { trackingScheduleValue } from "./AddKeywordDrawerExtensions";
import { countryForSelection } from "./AddKeywordDrawerLocation";

type DrawerFormDefaultsArgs = {
  costContext?: ProjectCostContext;
  defaultDevice: SerpDevice;
  initialKeyword?: string;
  initialScheduleFrequency?:
    | "custom_cron"
    | "daily"
    | "manual"
    | "monthly"
    | "paused"
    | "project_default"
    | "weekly";
  location: LocationFieldValue;
  projectId: string;
};

export function drawerFormDefaults({
  costContext,
  defaultDevice,
  initialKeyword = "",
  initialScheduleFrequency,
  location,
  projectId,
}: DrawerFormDefaultsArgs): AddKeywordDrawerForm {
  return {
    city: location.cityName ?? null,
    device: defaultDevice,
    isPaused: false,
    keywords: initialKeyword,
    location: countryForSelection(location) as AddKeywordDrawerForm["location"],
    locationKey: location.kind === "country" ? undefined : location.canonicalKey,
    projectId,
    schedule: trackingScheduleValue(initialScheduleFrequency, costContext),
    tags: [],
    targetUrl: "",
  };
}

export function drawerLocationFields(location: LocationFieldValue) {
  return {
    city: location.kind === "city" ? (location.cityName ?? null) : null,
    location: countryForSelection(location) as AddKeywordDrawerForm["location"],
    locationKey: location.kind === "country" ? undefined : location.canonicalKey,
  };
}
