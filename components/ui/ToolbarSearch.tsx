"use client";

import { toolbarControlClassName } from "@/components/ui/toolbar-control-styles";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react";
import { clsx } from "clsx";
import type { Ref } from "react";

export type ToolbarSearchVariant = "outlined" | "toolbar";

export type ToolbarSearchProps = {
  className?: string;
  id: string;
  inputRef?: Ref<HTMLInputElement>;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
  variant?: ToolbarSearchVariant;
};

const toolbarInputClassName =
  "min-w-0 flex-1 bg-transparent font-mono text-[12px] text-fg outline-none placeholder:text-fg-muted focus-visible:outline-none";

const outlinedInputClassName =
  "min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[12.5px] text-fg outline-none placeholder:text-fg-muted";

export function ToolbarSearch({
  className,
  id,
  inputRef,
  label,
  onChange,
  placeholder,
  value,
  variant = "toolbar",
}: Readonly<ToolbarSearchProps>) {
  const isToolbar = variant === "toolbar";
  return (
    <label
      className={clsx(
        isToolbar
          ? clsx(
              toolbarControlClassName,
              "flex items-center gap-2 px-[11px] transition-colors focus-within:border-accent",
            )
          : clsx(
              "flex h-8.5 items-center gap-2 rounded-[9px] border border-border-strong bg-transparent px-3",
              "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-solid",
            ),
        className,
      )}
      htmlFor={id}
    >
      <MagnifyingGlass aria-hidden className="shrink-0 text-fg-muted" size={isToolbar ? 14 : 15} />
      <input
        aria-label={label}
        className={isToolbar ? toolbarInputClassName : outlinedInputClassName}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        ref={inputRef}
        type="search"
        value={value}
      />
    </label>
  );
}
