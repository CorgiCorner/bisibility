"use client";

import { fieldLabelClass, fieldMetaClass } from "@/lib/keywords/add-keyword-drawer-shared";
import { type SerpDevice, serpDeviceValues } from "@/lib/serp/constants";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { useTranslations } from "next-intl";

/**
 * The drawer's own device selection. It stays out of the shared market blocks because a device
 * belongs to a keyword's check, not to a market.
 */
export function AddKeywordDeviceChips({
  devices,
  onChange,
}: Readonly<{ devices: readonly SerpDevice[]; onChange: (devices: SerpDevice[]) => void }>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.add");
  const deviceNames = useTranslations("shared.markets");
  function toggle(device: SerpDevice) {
    const next = devices.includes(device)
      ? devices.filter((item) => item !== device)
      : [...devices, device];
    if (next.length > 0) onChange(next);
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className={fieldLabelClass}>{t("devices")}</span>
        <span className={fieldMetaClass}>{t("required")}</span>
      </div>
      <div className="mt-2 flex gap-2">
        {serpDeviceValues.map((device) => {
          const selected = devices.includes(device);
          return (
            <button
              aria-pressed={selected}
              className={`inline-flex min-h-[30px] items-center gap-1.5 rounded-full border border-border px-3 text-[12px] font-medium outline-offset-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid ${selected ? "bg-bg-sunken text-fg" : "bg-bg-elev text-fg-muted hover:bg-bg-sunken"}`}
              key={device}
              onClick={() => toggle(device)}
              type="button"
            >
              {selected ? <Check aria-hidden size={10} weight="regular" /> : null}
              {deviceNames(device)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
