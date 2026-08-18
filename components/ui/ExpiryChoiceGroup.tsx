"use client";

import { cn } from "@/lib/ui/cn";
import { useId } from "react";

export type ExpiryChoiceOption<TDays extends number | null = number | null> = {
  days: TDays;
  label: string;
};

// Generic over the day values so each caller keeps its own literal union - project keys allow
// 30 | 90 | null, personal tokens also allow 365 - instead of widening both to number | null.
export type ExpiryChoiceGroupProps<TDays extends number | null> = {
  label?: string;
  onChange: (days: TDays) => void;
  options: readonly ExpiryChoiceOption<TDays>[];
  value: TDays;
};

const labelClass = "font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted";

/**
 * The expiry picker shared by the project API key and personal access token dialogs. The two
 * offer different windows - project keys expose 30/90/none, personal tokens also offer a year -
 * so the options stay a prop while the control, its styling and its accessibility do not.
 */
export function ExpiryChoiceGroup<TDays extends number | null>({
  label = "Expires",
  onChange,
  options,
  value,
}: Readonly<ExpiryChoiceGroupProps<TDays>>) {
  const groupName = useId();
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className={labelClass}>{label}</legend>
      <div className="mt-[9px] flex gap-[7px]">
        {options.map((option) => {
          const active = value === option.days;
          return (
            <label className="flex-1" key={option.label}>
              <input
                checked={active}
                className="peer sr-only"
                name={groupName}
                onChange={() => onChange(option.days)}
                type="radio"
                value={option.days ?? ""}
              />
              <span
                className={cn(
                  "flex w-full cursor-pointer items-center justify-center rounded-[9px] border-[1.5px] px-2 py-2 text-[12.5px] font-semibold transition-colors duration-[var(--motion-press)] ease-[ease]",
                  active
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-border-strong bg-bg-elev text-fg-muted",
                  "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-solid",
                )}
              >
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
