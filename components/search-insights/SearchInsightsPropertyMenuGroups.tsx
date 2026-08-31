import { MenuGroupHeading } from "@/components/ui";
import type {
  ArchivedSearchInsightsProperty,
  SearchInsightsPropertyOption,
} from "@/lib/actions/search-insights";
import type { SearchInsightsConnection } from "@/lib/search-insights/queries/context";
import { SearchInsightsMenuOption } from "./SearchInsightsMenu";
import { archivedPropertyMetadata } from "./SearchInsightsPropertyPickerGrouping";
import { PropertyListRow } from "./SearchInsightsPropertyRow";

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
  const groups = [
    active
      ? {
          id: "active",
          label: "Active",
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
          label: "Archived",
          options: archived.map((option) => (
            <SearchInsightsMenuOption
              key={option.value}
              onSelect={() => onArchivedSelect(option)}
              selected={option.value === displayed?.value}
            >
              <PropertyListRow
                className="opacity-75"
                metadata={archivedPropertyMetadata(option, projectDomain)}
                option={option}
              />
            </SearchInsightsMenuOption>
          )),
        }
      : null,
    matching.length > 0
      ? {
          id: "matching",
          label: "Matches this project",
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
