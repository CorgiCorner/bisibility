import type { LocationFieldValue } from "@/components/keywords/LocationField";
import { languageForLocationValue } from "@/components/onboarding/onboarding-location-field";
import { FieldLabel, MenuSelect, type MenuSelectOption } from "@/components/ui";
import { type SerpDepth, serpDepthValues } from "@/lib/serp/markets";
import { FIELD_HELP } from "@/lib/settings/field-help";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";

const boxClass =
  "flex items-center justify-between gap-2 rounded-[9px] border border-border-strong bg-transparent px-[13px] py-[11px] transition-colors";
const labelClass = "font-mono text-[10px] uppercase tracking-[0.4px] text-fg-muted";
const depthOptions = serpDepthValues.map((depth) => ({
  label: `Top ${depth}`,
  value: String(depth),
}));

export function deviceSummary(selected: readonly MenuSelectOption[]) {
  if (selected.length === 2) return "Desktop, Mobile";
  return selected.map((option) => option.label).join(", ");
}

export function languagesForLocations(locations: readonly LocationFieldValue[]) {
  const languages = [...new Set(locations.map((location) => languageForLocationValue(location)))];
  if (languages.length <= 2) return languages.join(", ");
  return `${languages[0]} +${languages.length - 1}`;
}

export function SerpDepthField({
  depth,
  onChange,
  triggerClassName,
}: Readonly<{
  depth: SerpDepth;
  onChange: (depth: SerpDepth) => void;
  triggerClassName: string;
}>) {
  return (
    <MenuField help={FIELD_HELP.serpDepth} label="SERP depth">
      <MenuSelect
        ariaLabel="SERP depth"
        onChange={(value) => onChange(Number(value) as SerpDepth)}
        options={depthOptions}
        triggerClassName={triggerClassName}
        value={String(depth)}
      />
    </MenuField>
  );
}

export function SerpDepthWarning({
  currentDepth,
  initialDepth,
}: Readonly<{ currentDepth: SerpDepth; initialDepth: SerpDepth }>) {
  if (currentDepth >= initialDepth) {
    return null;
  }
  return (
    <p className="m-0 mt-2 flex items-start gap-1.5 text-[11.5px] font-medium leading-[1.45] text-fg-muted">
      <WarningCircle
        aria-hidden
        className="mt-[1px] shrink-0 text-yellow-text"
        size={13}
        weight="fill"
      />
      <span>Rankings below Top {currentDepth} report as not found and skip alerts.</span>
    </p>
  );
}

export function ReadonlyField({
  help,
  label,
  name,
  value,
}: Readonly<{
  help?: string;
  label: string;
  name: string;
  value: string;
}>) {
  return (
    <div className={boxClass}>
      <FieldLabel className={labelClass} help={help} label={label} />
      <input
        aria-label={label}
        name={name}
        className="w-24 bg-transparent text-right text-[13.5px] font-medium text-fg outline-none focus-visible:outline-none"
        readOnly
        value={value}
      />
    </div>
  );
}

export function DerivedValue({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className={boxClass}>
      <span>
        <span className={`${labelClass} block`}>{label}</span>
        <span className="mt-0.5 block text-[10.5px] text-fg-muted">From locations</span>
      </span>
      <output aria-label={label} className="text-right text-[13.5px] font-medium text-fg">
        {value}
      </output>
    </div>
  );
}

export function MenuField({
  children,
  help,
  label,
}: Readonly<{ children: ReactNode; help?: string; label: string }>) {
  return (
    <div className={`${boxClass} focus-within:border-accent`}>
      <FieldLabel className={labelClass} help={help} label={label} />
      {children}
    </div>
  );
}
