"use client";

import { toolbarControlClassName } from "@/components/ui/toolbar-control-styles";
import { MagnifyingGlassIcon as MagnifyingGlass, XIcon as X } from "@phosphor-icons/react";
import { clsx } from "clsx";
import type { Ref } from "react";
import styles from "./ToolbarSearch.module.css";

export type ToolbarSearchVariant = "outlined" | "toolbar";

export type ToolbarSearchProps = {
  className?: string;
  id: string;
  inputRef?: Ref<HTMLInputElement>;
  label: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder: string;
  value: string;
  variant?: ToolbarSearchVariant;
};

const toolbarInputClassName =
  "compact-text-12 min-w-0 flex-1 bg-transparent font-mono text-[12px] leading-4 text-fg outline-none placeholder:text-[12px] placeholder:leading-4 placeholder:text-fg-muted focus-visible:outline-none";

const outlinedInputClassName =
  "min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[12.5px] text-fg outline-none placeholder:text-[12px] placeholder:leading-4 placeholder:text-fg-muted";

export function ToolbarSearch({
  className,
  id,
  inputRef,
  label,
  onBlur,
  onChange,
  onSubmit,
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
              "flex h-8.5 items-center gap-2 rounded-control border border-border-control bg-transparent px-3",
              "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-solid",
            ),
        className,
      )}
      htmlFor={id}
    >
      <MagnifyingGlass
        aria-hidden
        className="shrink-0 text-fg-muted"
        size={isToolbar ? 14 : 15}
        weight="regular"
      />
      <input
        aria-label={label}
        className={clsx(
          isToolbar ? toolbarInputClassName : outlinedInputClassName,
          styles.searchInput,
        )}
        id={id}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit?.();
          }
        }}
        placeholder={placeholder}
        ref={inputRef}
        type="search"
        value={value}
      />
      {value ? (
        <button
          aria-label={`Clear ${label}`}
          className="inline-flex size-6 shrink-0 items-center justify-center text-fg-muted hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-solid"
          onClick={() => onChange("")}
          onMouseDown={(event) => event.preventDefault()}
          type="button"
        >
          <X aria-hidden size={12} weight="regular" />
        </button>
      ) : null}
    </label>
  );
}
