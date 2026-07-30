"use client";

import { LocationField, type LocationFieldValue } from "@/components/keywords/LocationField";
import { locationValueForKey } from "@/components/onboarding/onboarding-location-field";
import {
  DEFAULT_ONBOARDING_LOCATION_KEY,
  MAX_ONBOARDING_LOCATIONS,
} from "@/components/onboarding/onboarding-locations";
import { PlusIcon as Plus, XIcon as X } from "@phosphor-icons/react";
import { type FocusEvent, type KeyboardEvent, useState } from "react";

type LocationSelectionChipsProps = {
  error?: string;
  onChange: (values: LocationFieldValue[]) => void;
  projectId?: string | null;
  values: readonly LocationFieldValue[];
};

const chipClass =
  "inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-border bg-bg-elev px-2.5 text-[12.5px] font-medium text-fg";

export function LocationSelectionChips({
  error,
  onChange,
  projectId,
  values,
}: Readonly<LocationSelectionChipsProps>) {
  const [adding, setAdding] = useState(values.length === 0);
  const [draft, setDraft] = useState(() => locationValueForKey(DEFAULT_ONBOARDING_LOCATION_KEY));
  const selectedKeys = new Set(values.map((value) => value.canonicalKey));
  const canAdd = values.length < MAX_ONBOARDING_LOCATIONS;

  function addLocation(value: LocationFieldValue) {
    setDraft(value);
    if (selectedKeys.has(value.canonicalKey) || !canAdd) {
      return;
    }
    onChange([...values, value]);
    setAdding(false);
    setDraft(locationValueForKey(DEFAULT_ONBOARDING_LOCATION_KEY));
  }

  function removeLocation(key: string) {
    if (values.length <= 1) {
      return;
    }
    onChange(values.filter((value) => value.canonicalKey !== key));
  }

  function cancelAdd() {
    if (values.length === 0) {
      return;
    }
    setDraft(locationValueForKey(DEFAULT_ONBOARDING_LOCATION_KEY));
    setAdding(false);
  }

  function handleAddKeyDown(event: KeyboardEvent<HTMLFieldSetElement>) {
    if (event.key === "Escape") {
      cancelAdd();
    }
  }

  function handleAddBlur(event: FocusEvent<HTMLFieldSetElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    cancelAdd();
  }

  return (
    <div className="grid gap-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.4px] text-fg-faint">
        Locations
      </div>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <span className={chipClass} key={value.canonicalKey}>
            <span className="min-w-0 truncate">{value.displayName}</span>
            <button
              aria-label={`Remove ${value.displayName}`}
              className="grid h-5 w-5 flex-none place-items-center rounded-full text-fg-faint hover:text-red disabled:opacity-40"
              disabled={values.length <= 1}
              onClick={() => removeLocation(value.canonicalKey)}
              type="button"
            >
              <X aria-hidden size={11} weight="bold" />
            </button>
          </span>
        ))}
        {canAdd && !adding ? (
          <button
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-dashed border-border-strong px-2.5 text-[12.5px] font-semibold text-accent hover:border-accent"
            onClick={() => setAdding(true)}
            type="button"
          >
            <Plus aria-hidden size={13} weight="bold" />
            Add location
          </button>
        ) : null}
      </div>
      {adding && canAdd ? (
        <fieldset
          className="m-0 flex max-w-[360px] items-start gap-2 border-0 p-0"
          onBlur={handleAddBlur}
          onKeyDown={handleAddKeyDown}
        >
          <div className="min-w-0 flex-1">
            <LocationField
              error={error}
              label="Add location"
              onChange={addLocation}
              placeholder="Search country or city"
              projectId={projectId}
              value={draft}
            />
          </div>
          {values.length > 0 ? (
            <button
              aria-label="Cancel adding location"
              className="mt-[22px] inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border-strong px-2.5 text-[12.5px] font-semibold text-fg-muted hover:border-red hover:text-red"
              onClick={cancelAdd}
              type="button"
            >
              <X aria-hidden size={12} weight="bold" />
              Cancel
            </button>
          ) : null}
        </fieldset>
      ) : null}
      {!canAdd ? (
        <p className="m-0 text-[11.5px] font-medium text-fg-faint">Maximum 5 locations selected.</p>
      ) : null}
    </div>
  );
}
