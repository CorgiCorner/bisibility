"use client";

import { cn } from "@/lib/ui/cn";

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

const labelClass = "font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint";

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
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className={labelClass}>{label}</legend>
      <div className="mt-[9px] flex gap-[7px]">
        {options.map((option) => {
          const active = value === option.days;
          return (
            <button
              aria-pressed={active}
              className={cn(
                "flex-1 rounded-[9px] border-[1.5px] px-2 py-2 text-[12.5px] font-semibold",
                active
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-border-strong bg-bg-elev text-fg-muted",
              )}
              key={option.label}
              onClick={() => onChange(option.days)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
