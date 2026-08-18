import { CheckIcon as Check } from "@phosphor-icons/react";
import type { ComponentType, ReactNode } from "react";

export type FilterIcon = ComponentType<{
  className?: string;
  size?: number;
  weight?: "regular" | "bold";
}>;

export function toggleFilterValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function FilterSection({
  children,
  icon: Icon,
  title,
}: Readonly<{
  children: ReactNode;
  icon: FilterIcon;
  title: string;
}>) {
  return (
    <section className="border-b border-border-soft py-4.5 last:border-b-0 last:pb-1">
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.6px] text-fg-muted">
        <Icon className="text-accent-text" size={14} weight="bold" />
        {title}
      </div>
      {children}
    </section>
  );
}

export function FilterCheckTile({
  active,
  count,
  icon: Icon,
  label,
  onClick,
}: Readonly<{
  active: boolean;
  count?: number;
  icon?: FilterIcon;
  label: string;
  onClick: () => void;
}>) {
  return (
    <button
      className="flex items-center gap-[9px] rounded-[9px] border bg-bg-elev px-[11px] py-[9px] text-left outline-none transition-colors hover:border-accent focus-visible:border-accent"
      onClick={onClick}
      style={{
        backgroundColor: active ? "var(--accent-soft)" : "var(--bg-elev)",
        borderColor: "var(--border-strong)",
      }}
      type="button"
    >
      <span
        className="grid h-[17px] w-[17px] shrink-0 place-items-center rounded-[5px] border-[1.5px]"
        style={{
          backgroundColor: active ? "var(--accent)" : "var(--bg-elev)",
          borderColor: active ? "var(--accent)" : "var(--border-strong)",
        }}
      >
        {active ? <Check className="text-white" size={11} weight="bold" /> : null}
      </span>
      {Icon ? <Icon className="shrink-0 text-fg-muted" size={14} /> : null}
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">{label}</span>
      {typeof count === "number" ? (
        <span className="font-mono text-[11px] text-fg-muted">{count}</span>
      ) : null}
    </button>
  );
}

export function FilterSegment<T extends string>({
  onChange,
  options,
  value,
}: Readonly<{
  onChange: (value: T) => void;
  options: readonly { id: T; label: string }[];
  value: T;
}>) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-[9px] border border-border-strong bg-transparent p-[3px]">
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            className="flex-1 rounded-[7px] px-2 py-1.5 text-[12px] font-semibold outline-none transition-colors focus-visible:bg-accent-solid focus-visible:text-primary-contrast"
            key={option.id}
            onClick={() => onChange(option.id)}
            style={{
              backgroundColor: active ? "var(--bg-elev)" : "transparent",
              boxShadow: active ? "0 0 0 1px var(--border-strong)" : "none",
              color: active ? "var(--fg)" : "var(--fg-muted)",
            }}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
