import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
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
  title,
}: Readonly<{
  children: ReactNode;
  icon: FilterIcon;
  title: string;
}>) {
  return (
    <section className="border-b border-border py-4.5 last:border-b-0 last:pb-1">
      <div
        data-replay-label
        className="font-sans tabular-nums text-[11px] uppercase tracking-[0.6px] text-fg-muted"
      >
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
      className={`flex items-center gap-[9px] rounded-control border bg-bg-elev px-[11px] py-[9px] text-left outline-none transition-colors hover:border-accent focus-visible:border-accent ${
        active ? "border-accent" : "border-border-control"
      }`}
      onClick={onClick}
      style={{
        backgroundColor: active ? "var(--accent-soft)" : "var(--bg-elev)",
      }}
      type="button"
    >
      <span
        className={`grid h-[17px] w-[17px] shrink-0 place-items-center rounded-control border-[1.5px] ${
          active ? "border-accent" : "border-border-control"
        }`}
        style={{
          backgroundColor: active ? "var(--accent)" : "var(--bg-elev)",
        }}
      >
        {active ? <Check className="text-white" size={11} weight="regular" /> : null}
      </span>
      {Icon ? <Icon className="shrink-0 text-fg-muted" size={14} /> : null}
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">{label}</span>
      {typeof count === "number" ? (
        <span className="font-sans tabular-nums text-[11px] text-fg-muted">{count}</span>
      ) : null}
    </button>
  );
}

export function FilterSegment<T extends string>({
  ariaLabel,
  onChange,
  options,
  value,
}: Readonly<{
  ariaLabel: string;
  onChange: (value: T) => void;
  options: readonly { id: T; label: string }[];
  value: T;
}>) {
  const segmentedOptions = options.map(({ id, label }) => ({ label, value: id }));

  return (
    <div
      aria-label={ariaLabel}
      className={options.length > 4 ? "[&>fieldset>div]:!grid-cols-3" : undefined}
      role="radiogroup"
    >
      <SegmentedControl
        ariaLabel={ariaLabel}
        onChange={onChange}
        options={segmentedOptions}
        size="toolbar"
        value={value}
      />
    </div>
  );
}
