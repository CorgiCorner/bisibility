"use client";

import { cn } from "@/lib/ui/cn";
import { useRef } from "react";

export function tabTriggerClassName(active: boolean, layout: "inline" | "stretch" = "inline") {
  return cn(
    "-mb-px flex items-center gap-2 border-x-0 border-t-0 border-b-2 bg-transparent px-3.5 py-[9px] text-[13.5px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-solid",
    layout === "stretch"
      ? "min-h-11 min-w-0 flex-1 justify-center whitespace-normal text-center sm:flex-none sm:whitespace-nowrap"
      : "whitespace-nowrap",
    active
      ? cn("border-accent text-fg", layout === "inline" && "font-semibold")
      : "border-transparent text-fg-muted hover:text-fg",
  );
}

export const tabCountClassName =
  "rounded-control bg-bg-sunken px-[7px] py-0.5 font-sans tabular-nums text-[11px] text-fg-muted";

type TabsProps<T extends string> = {
  ariaLabel: string;
  layout?: "inline" | "stretch";
  onChange: (value: T) => void;
  options: readonly { label: string; value: T }[];
  panelId: string;
  value: T;
};

export function Tabs<T extends string>({
  ariaLabel,
  layout = "inline",
  onChange,
  options,
  panelId,
  value,
}: Readonly<TabsProps<T>>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  return (
    <div
      aria-label={ariaLabel}
      className={cn("flex min-w-0 gap-0.5", layout === "stretch" && "w-full")}
      role="tablist"
    >
      {options.map((option, index) => (
        <button
          aria-controls={panelId}
          aria-selected={value === option.value}
          className={tabTriggerClassName(value === option.value, layout)}
          id={`${panelId}-${option.value}-tab`}
          key={option.value}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            const nextIndex =
              event.key === "ArrowRight"
                ? (index + 1) % options.length
                : event.key === "ArrowLeft"
                  ? (index - 1 + options.length) % options.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? options.length - 1
                      : null;
            if (nextIndex === null) return;
            event.preventDefault();
            onChange(options[nextIndex].value);
            buttons.current[nextIndex]?.focus();
          }}
          ref={(button) => {
            buttons.current[index] = button;
          }}
          role="tab"
          tabIndex={value === option.value ? 0 : -1}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
