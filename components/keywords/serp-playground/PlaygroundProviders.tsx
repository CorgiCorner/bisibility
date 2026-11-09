"use client";
import { Checkbox } from "@/components/ui/Checkbox";
import type { PlaygroundPageData } from "@/lib/provider-comparison/playground-model";
import type { ComparisonProvider, ComparisonRun } from "@/lib/provider-comparison/types";
import { useTranslations } from "next-intl";
import { providerLabels } from "./provider-labels";

export function PlaygroundProviders({
  available,
  history,
  selected,
  busy,
  onChange,
}: {
  available: PlaygroundPageData["providers"];
  history: ComparisonRun[];
  selected: ComparisonProvider[];
  busy: boolean;
  onChange: (provider: ComparisonProvider, checked: boolean) => void;
}) {
  const t = useTranslations("projectRankTracker.serpPlayground");
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">{t("providers")}</legend>
      <div className="flex min-h-9 flex-wrap items-center gap-4">
        {available.map((item) => (
          <Checkbox
            key={item.provider}
            label={providerLabels[item.provider]}
            disabled={
              busy ||
              (!item.ready &&
                !history.some((run) => run.sides.some((side) => side.provider === item.provider)))
            }
            checked={selected.includes(item.provider)}
            onChange={(event) => onChange(item.provider, event.target.checked)}
            labelClassName="text-xs font-normal leading-5"
          />
        ))}
      </div>
    </fieldset>
  );
}
