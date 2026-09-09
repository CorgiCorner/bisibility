"use client";

import { cn } from "@/lib/ui/cn";
import { useRef } from "react";

type TabsProps<T extends string> = {
  ariaLabel: string;
  onChange: (value: T) => void;
  options: readonly { label: string; value: T }[];
  panelId: string;
  value: T;
};

export function Tabs<T extends string>({
  ariaLabel,
  onChange,
  options,
  panelId,
  value,
}: Readonly<TabsProps<T>>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  return (
    <div aria-label={ariaLabel} className="flex min-w-0 gap-0.5" role="tablist">
      {options.map((option, index) => (
        <button
          aria-controls={panelId}
          aria-selected={value === option.value}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-solid",
            value === option.value
              ? "border-accent text-fg"
              : "border-transparent text-fg-muted hover:text-fg",
          )}
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
