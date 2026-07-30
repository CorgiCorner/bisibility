import type { Dispatch, KeyboardEvent, SetStateAction } from "react";
import type { LocationSuggestion } from "./location-picker-data";

type LocationKeyOptions = {
  activeOption: LocationSuggestion | undefined;
  clear: () => void;
  draft: string | null;
  locations: LocationSuggestion[];
  selectOption: (option: LocationSuggestion) => void;
  setActiveIndex: Dispatch<SetStateAction<number>>;
  setDraft: Dispatch<SetStateAction<string | null>>;
  setExpanded: Dispatch<SetStateAction<boolean>>;
};

function handleArrowKey(event: KeyboardEvent<HTMLInputElement>, options: LocationKeyOptions) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return false;
  event.preventDefault();
  options.setExpanded(true);
  if (event.key === "ArrowDown") {
    options.setActiveIndex((index) =>
      options.locations.length ? (index + 1) % options.locations.length : -1,
    );
  } else {
    options.setActiveIndex((index) => {
      if (!options.locations.length) return -1;
      return index <= 0 ? options.locations.length - 1 : index - 1;
    });
  }
  return true;
}

export function locationKeyHandler(options: LocationKeyOptions) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (handleArrowKey(event, options)) return;
    if (event.key === "Enter" && options.activeOption) {
      event.preventDefault();
      options.selectOption(options.activeOption);
    } else if (event.key === "Enter" && options.draft !== null) {
      event.preventDefault();
    } else if (event.key === "Escape") {
      options.clear();
      options.setDraft(null);
      options.setExpanded(false);
      options.setActiveIndex(-1);
    }
  };
}
