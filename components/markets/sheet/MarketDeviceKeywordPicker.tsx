"use client";

import { Checkbox } from "@/components/ui/Checkbox";
import type { MarketDeviceCandidate } from "@/lib/markets/device-targets-input";
import { useTranslations } from "next-intl";

export function MarketDeviceKeywordPicker({
  candidates,
  device,
  selected,
  onChange,
}: Readonly<{
  candidates: readonly MarketDeviceCandidate[];
  device: "desktop" | "mobile";
  selected: readonly string[];
  onChange: (ids: string[]) => void;
}>) {
  const t = useTranslations("projectMarkets.deviceTracking");
  const available = candidates.filter((candidate) => !candidate.existingDevices.includes(device));
  const ids = new Set(selected);
  const selectedCount = available.filter((candidate) => ids.has(candidate.id)).length;
  const allSelected = available.length > 0 && selectedCount === available.length;
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span>{t("keywords")}</span>
        <span className="tabular-nums text-fg-muted">
          {t("selectedCount", { count: selectedCount, total: available.length })}
        </span>
      </div>
      {available.length ? (
        <div className="overflow-hidden rounded-control border border-border">
          <div className="border-b border-border px-3 py-2.5">
            <Checkbox
              label={t("selectAll")}
              checked={allSelected}
              aria-checked={selectedCount > 0 && !allSelected ? "mixed" : allSelected}
              onChange={() =>
                onChange(allSelected ? [] : available.map((candidate) => candidate.id))
              }
              labelClassName="font-normal"
              containerClassName="items-center"
            />
          </div>
          <div className="grid max-h-52 gap-2.5 overflow-y-auto p-3">
            {available.map((candidate) => (
              <Checkbox
                key={candidate.id}
                label={candidate.keyword}
                checked={ids.has(candidate.id)}
                labelClassName="break-words font-normal"
                containerClassName="items-center"
                onChange={(event) =>
                  onChange(
                    event.currentTarget.checked
                      ? [...selected, candidate.id]
                      : selected.filter((id) => id !== candidate.id),
                  )
                }
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="m-0 text-xs text-fg-muted">{t("noAvailableKeywords")}</p>
      )}
    </div>
  );
}
