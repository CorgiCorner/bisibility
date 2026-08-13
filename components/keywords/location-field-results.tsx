import {
  GlobeHemisphereWestIcon as GlobeHemisphereWest,
  MapPinIcon as MapPin,
} from "@phosphor-icons/react";
import { countryNameForCode, type LocationSuggestion } from "./location-picker-data";

const optionId = (option: LocationSuggestion) => option.id || option.canonicalKey;
export const locationOptionDomId = (listId: string, index: number) => `${listId}-opt-${index}`;

function cityCaption(option: LocationSuggestion) {
  return [option.regionName, countryNameForCode(option.countryCode) ?? option.countryCode]
    .filter(Boolean)
    .join(", ");
}

type LocationResultsProps = {
  activeOption: LocationSuggestion | undefined;
  cities: LocationSuggestion[];
  countries: LocationSuggestion[];
  hasOptions: boolean;
  listId: string;
  loading: boolean;
  onPick: (option: LocationSuggestion) => void;
  showEmpty: boolean;
  visible: boolean;
};

export function LocationResults({
  activeOption,
  cities,
  countries,
  hasOptions,
  listId,
  loading,
  onPick,
  showEmpty,
  visible,
}: Readonly<LocationResultsProps>) {
  if (!visible) return null;
  return (
    <div
      className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded-[9px] border border-border bg-bg-elev py-1 shadow-lg"
      id={listId}
      role="listbox"
      tabIndex={-1}
    >
      {countries.length > 0 ? (
        <LocationGroup
          activeOption={activeOption}
          label="Countries"
          listId={listId}
          onPick={onPick}
          options={countries}
          startIndex={0}
        />
      ) : null}
      {cities.length > 0 ? (
        <LocationGroup
          activeOption={activeOption}
          label="Cities"
          listId={listId}
          onPick={onPick}
          options={cities}
          startIndex={countries.length}
        />
      ) : null}
      {loading && !hasOptions ? (
        <span className="block px-3 py-2 normal-case text-fg-muted">Searching locations...</span>
      ) : null}
      {showEmpty ? (
        <span className="block px-3 py-2 normal-case text-fg-muted">
          No results yet. City suggestions are powered by your connected providers.
        </span>
      ) : null}
    </div>
  );
}

type LocationGroupProps = {
  activeOption: LocationSuggestion | undefined;
  label: "Countries" | "Cities";
  listId: string;
  onPick: (option: LocationSuggestion) => void;
  options: LocationSuggestion[];
  startIndex: number;
};

function LocationGroup({
  activeOption,
  label,
  listId,
  onPick,
  options,
  startIndex,
}: Readonly<LocationGroupProps>) {
  return (
    <span className="block">
      <span className="block px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
        {label}
      </span>
      {options.map((option, index) => {
        const selected = activeOption ? optionId(activeOption) === optionId(option) : false;
        const Icon = option.kind === "country" ? GlobeHemisphereWest : MapPin;
        return (
          <button
            aria-selected={selected}
            className={`flex w-full items-start gap-2 px-3 py-2 text-left normal-case tracking-normal ${
              selected ? "bg-bg-sunken text-fg" : "text-fg hover:bg-bg-sunken"
            }`}
            id={locationOptionDomId(listId, startIndex + index)}
            key={optionId(option)}
            onClick={() => onPick(option)}
            onMouseDown={(event) => event.preventDefault()}
            role="option"
            type="button"
          >
            <Icon className="mt-0.5 flex-none text-accent-text" size={14} weight="bold" />
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-semibold">
                {option.kind === "city" ? option.cityName : option.displayName}
              </span>
              {option.kind === "city" ? (
                <span className="block truncate text-[11.5px] text-fg-muted">
                  {cityCaption(option)}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </span>
  );
}
