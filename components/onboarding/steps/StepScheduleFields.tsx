import type { LocationFieldValue } from "@/components/keywords/LocationField";
import { languageForLocationValue } from "@/components/onboarding/onboarding-location-field";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import type { AnalyticsControlId } from "@/lib/analytics/controls";
import { type SerpDepth, serpDepthValues } from "@/lib/serp/constants";
import { VISIBILITY_HORIZON } from "@/lib/visibility/definition";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

const boxClass =
  "flex items-center justify-between gap-2 rounded-control border border-border-control bg-transparent px-[13px] py-[11px] transition-colors";
const labelClass = "text-[10px] uppercase tracking-[0.4px] text-fg-muted";
export function deviceSummary(
  selected: readonly MenuSelectOption[],
  t: ReturnType<typeof useTranslations<"onboarding.tracking">>,
) {
  if (selected.length === 2) return t("bothDevices");
  return selected.map((option) => option.label).join(", ");
}

export function languagesForLocations(locations: readonly LocationFieldValue[]) {
  const languages = [...new Set(locations.map((location) => languageForLocationValue(location)))];
  if (languages.length <= 2) return languages.join(", ");
  return `${languages[0]} +${languages.length - 1}`;
}

export function SerpDepthField({
  analytics,
  depth,
  onChange,
  triggerClassName,
}: Readonly<{
  analytics?: { control: AnalyticsControlId };
  depth: SerpDepth;
  onChange: (depth: SerpDepth) => void;
  triggerClassName: string;
}>) {
  const t = useTranslations("onboarding.tracking");
  const help = t("depthHelp", {
    depth,
    visibilityDepth: depth < VISIBILITY_HORIZON ? VISIBILITY_HORIZON : 0,
  });
  const depthOptions = serpDepthValues.map((option) => ({
    label: t("depthOption", { depth: option }),
    value: String(option),
  }));
  return (
    <MenuField help={help} label={t("depth")}>
      <MenuSelect
        analytics={analytics}
        ariaLabel={t("depth")}
        onChange={(value) => onChange(Number(value) as SerpDepth)}
        options={depthOptions}
        triggerClassName={triggerClassName}
        value={String(depth)}
      />
    </MenuField>
  );
}

export function DerivedValue({
  help,
  label,
  value,
}: Readonly<{ help?: string; label: string; value: string }>) {
  return (
    <div className={boxClass}>
      <FieldLabel className={labelClass} help={help} label={label} />
      <output aria-label={label} className="text-right text-sm font-normal text-fg">
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
