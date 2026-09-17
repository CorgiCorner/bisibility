"use client";

import type { IssuePersonalTokenInput } from "@/lib/schemas/personalToken";
import { cn } from "@/lib/ui/cn";

export type PersonalTokenScopeOption = {
  desc: string;
  label: string;
  value: IssuePersonalTokenInput["scope"];
};

type PersonalTokenScopeOptionsProps = {
  onSelect: (value: IssuePersonalTokenInput["scope"]) => void;
  options: readonly PersonalTokenScopeOption[];
  scope: IssuePersonalTokenInput["scope"];
};

export function PersonalTokenScopeOptions({
  onSelect,
  options,
  scope,
}: Readonly<PersonalTokenScopeOptionsProps>) {
  return (
    <div className="mt-[9px] grid gap-[7px]">
      {options.map((option) => {
        const active = scope === option.value;
        return (
          <label
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-control border-[1.5px] px-[13px] py-[11px]",
              active ? "border-accent bg-accent-soft" : "border-border-control bg-bg-elev",
            )}
            key={option.value}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-fg">{option.label}</span>
              <span className="mt-px block text-[11.5px] text-fg-muted">{option.desc}</span>
            </span>
            <input
              checked={active}
              className="sr-only"
              name="personal-token-scope"
              onChange={() => onSelect(option.value)}
              type="radio"
              value={option.value}
            />
            <span
              className={cn(
                "grid h-[18px] w-[18px] flex-none place-items-center rounded-full border-[1.5px]",
                active ? "border-accent" : "border-border",
              )}
            >
              <span
                className={cn("h-[9px] w-[9px] rounded-full bg-accent", !active && "invisible")}
              />
            </span>
          </label>
        );
      })}
    </div>
  );
}
