import type {
  ArchivedSearchInsightsProperty,
  SearchInsightsPropertyOption,
} from "@/lib/actions/search-insights";
import type { DateFormat } from "@/lib/dates/format";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { formatDateLabel } from "@/lib/search-insights/dates";
import type { SearchInsightsConnection } from "@/lib/search-insights/queries/context";
import { matchesProjectDomain } from "./search-insights-property-match";

type ActiveProperty = SearchInsightsConnection["property"];

export function groupSearchInsightsProperties({
  active,
  archived,
  options,
  projectDomain,
}: {
  active: ActiveProperty;
  archived: readonly ArchivedSearchInsightsProperty[];
  options: readonly SearchInsightsPropertyOption[];
  projectDomain: string;
}) {
  const activeKeys = new Set(active ? [active.value] : []);
  const archivedKeys = new Set<string>();
  const uniqueArchived = archived.filter((option) => {
    if (activeKeys.has(option.value) || archivedKeys.has(option.value)) return false;
    archivedKeys.add(option.value);
    return true;
  });
  const reservedKeys = new Set([...activeKeys, ...archivedKeys]);
  const availableKeys = new Set<string>();
  const available = options.filter((option) => {
    if (reservedKeys.has(option.value) || availableKeys.has(option.value)) return false;
    availableKeys.add(option.value);
    return true;
  });

  return {
    archived: uniqueArchived,
    matching: available.filter((option) => matchesProjectDomain(option, projectDomain)),
    other: available.filter((option) => !matchesProjectDomain(option, projectDomain)),
  };
}

export function archivedPropertyMetadata(
  option: ArchivedSearchInsightsProperty,
  projectDomain: string,
  format: DateFormat = "month_first",
) {
  const relevance = matchesProjectDomain(option, projectDomain) ? "matches this project · " : "";
  return `${relevance}last synced ${formatDateLabel(option.lastSyncedDate, format)}`;
}

export function propertyConnectionSettingsHref(projectId: string) {
  const route = appPath(asProjectRef(projectId), "integrations");
  return `${route}?connect=gsc#provider-gsc`;
}
