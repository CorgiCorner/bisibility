"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { MenuGroupHeading } from "@/components/ui/MenuGroupHeading";
import type {
  ArchivedSearchInsightsProperty,
  SearchInsightsPropertyOption,
} from "@/lib/actions/search-insights";
import { formatDisplayDate } from "@/lib/dates/format";
import type { SearchInsightsConnection } from "@/lib/search-insights/queries/context";
import { useTranslations } from "next-intl";
import { SearchInsightsMenuOption } from "./SearchInsightsMenu";
import { PropertyListRow } from "./SearchInsightsPropertyRow";
import { matchesProjectDomain } from "./search-insights-property-match";

type Property = NonNullable<SearchInsightsConnection["property"]>;

type PropertyMenuGroupsProps = {
  active: Property | null;
  archived: readonly ArchivedSearchInsightsProperty[];
  displayed: Property | null;
  matching: readonly SearchInsightsPropertyOption[];
  onActiveSelect: (option: Property) => void;
  onArchivedSelect: (option: ArchivedSearchInsightsProperty) => void;
  onPropertySelect: (option: SearchInsightsPropertyOption) => void;
  projectDomain: string;
};

export function SearchInsightsPropertyMenuGroups({
  active,
  archived,
  displayed,
  matching,
  onActiveSelect,
  onArchivedSelect,
  onPropertySelect,
  projectDomain,
}: Readonly<PropertyMenuGroupsProps>) {
  const dateDisplay = useDateDisplay();
  const t = useTranslations("projectSearchInsights.copy");
  const archivedMetadata = (option: ArchivedSearchInsightsProperty) => {
    const lastSynced = t("archivedPropertyLastSynced", {
      date: formatDisplayDate(option.lastSyncedDate, dateDisplay),
    });
    return matchesProjectDomain(option, projectDomain)
      ? `${t("archivedPropertyMatchesProject")} · ${lastSynced}`
      : lastSynced;
  };
  const groups = [
    active
      ? {
          id: "active",
          label: t("activeProperties"),
          options: (
            <SearchInsightsMenuOption
              className="border border-border"
              key="active-option"
              onSelect={() => onActiveSelect(active)}
              selected={active.value === displayed?.value}
            >
              <PropertyListRow option={active} />
            </SearchInsightsMenuOption>
          ),
        }
      : null,
    archived.length > 0
      ? {
          id: "archived",
          label: t("archivedProperties"),
          options: archived.map((option) => (
            <SearchInsightsMenuOption
              key={option.value}
              onSelect={() => onArchivedSelect(option)}
              selected={option.value === displayed?.value}
            >
              <PropertyListRow
                className="opacity-75"
                metadata={archivedMetadata(option)}
                option={option}
              />
            </SearchInsightsMenuOption>
          )),
        }
      : null,
    matching.length > 0
      ? {
          id: "matching",
          label: t("matchingProperties"),
          options: matching.map((option) => (
            <SearchInsightsMenuOption
              key={option.value}
              onSelect={() => onPropertySelect(option)}
              selected={option.value === displayed?.value}
            >
              <PropertyListRow option={option} />
            </SearchInsightsMenuOption>
          )),
        }
      : null,
  ].filter((group) => group !== null);

  return groups.flatMap((group, index) => [
    <MenuGroupHeading first={index === 0} key={`${group.id}-heading`}>
      {group.label}
    </MenuGroupHeading>,
    group.options,
  ]);
}
