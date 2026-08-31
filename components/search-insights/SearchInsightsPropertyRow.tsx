import { PillBadge, Tooltip } from "@/components/ui";
import type { SearchInsightsPropertyOption } from "@/lib/actions/search-insights";
import type { SearchInsightsConnection } from "@/lib/search-insights/queries/context";
import { cn } from "@/lib/ui/cn";
import {
  GlobeHemisphereWestIcon as GlobeHemisphereWest,
  LinkSimpleIcon as LinkSimple,
} from "@phosphor-icons/react";
import { propertyTip, propertyTruncation } from "./search-insights-workspace-model";

type Property = SearchInsightsPropertyOption | NonNullable<SearchInsightsConnection["property"]>;

export function PropertyKindPill({
  kind,
  label,
}: Readonly<{ kind: "domain" | "url-prefix"; label: string }>) {
  return (
    <span className="shrink-0 justify-self-end" data-slot="property-kind">
      <Tooltip content={propertyTip(kind)} semantics="description">
        <PillBadge className="cursor-help whitespace-nowrap">{label}</PillBadge>
      </Tooltip>
    </span>
  );
}

export function PropertyName({ name, value }: Readonly<{ name: string; value: string }>) {
  const { head, tail } = propertyTruncation(name);
  return (
    <span
      aria-label={value}
      className="flex min-w-0 overflow-hidden font-mono text-ui-caption"
      data-slot="property-name"
    >
      <span className="min-w-0 truncate">{head}</span>
      <span className="shrink-0 whitespace-nowrap">{tail}</span>
    </span>
  );
}

export function PropertyListRow({
  className,
  metadata,
  option,
}: Readonly<{ className?: string; metadata?: string; option: Property }>) {
  return (
    <span
      className={cn(
        "grid w-full min-w-0 grid-cols-[15px_minmax(0,1fr)_max-content] items-center gap-x-2.5",
        className,
      )}
      data-slot="property-row"
    >
      {option.kind === "domain" ? (
        <GlobeHemisphereWest
          weight="regular"
          aria-hidden
          className="shrink-0 text-fg-muted"
          size={15}
        />
      ) : (
        <LinkSimple weight="regular" aria-hidden className="shrink-0 text-fg-muted" size={15} />
      )}
      <PropertyName name={option.displayName} value={option.value} />
      <PropertyKindPill kind={option.kind} label={option.kindLabel} />
      {metadata ? (
        <span
          className="col-start-2 col-end-4 mt-0.5 min-w-0 truncate font-mono text-[10px] uppercase tracking-wide text-fg-muted"
          data-slot="property-metadata"
        >
          {metadata}
        </span>
      ) : null}
    </span>
  );
}

export function PropertyGroup({
  label,
  onSelect,
  options,
}: Readonly<{
  label: string;
  onSelect: (option: SearchInsightsPropertyOption) => void;
  options: readonly SearchInsightsPropertyOption[];
}>) {
  if (options.length === 0) return null;
  return (
    <section className="mt-4" aria-label={label}>
      <p className="m-0 mb-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
        {label}
      </p>
      <div className="max-h-[180px] overflow-y-auto rounded-control border border-border">
        {options.map((option) => (
          <button
            className="w-full min-w-0 overflow-hidden border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-bg-sunken"
            key={option.value}
            onClick={() => onSelect(option)}
            type="button"
          >
            <PropertyListRow option={option} />
          </button>
        ))}
      </div>
    </section>
  );
}
