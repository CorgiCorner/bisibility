"use client";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type { NewMarketCreateInput } from "@/lib/markets/create-input";
import { useTranslations } from "next-intl";
import { NewMarketKeywordMethod, type NewMarketSource } from "./NewMarketKeywordMethod";
import { NewMarketSchedule, type NewMarketScheduleOption } from "./NewMarketSchedule";
import { selectedDevice } from "./new-market-creator-model";
export function NewMarketCreationFields({
  devices,
  method,
  pasteError,
  schedule,
  schedules,
  sources,
  onDevices,
  onMethod,
  onSchedule,
  onNewSchedule,
}: {
  devices: readonly string[];
  method: NewMarketCreateInput["method"] | undefined;
  pasteError: string | null;
  schedule: NewMarketCreateInput["schedule"];
  schedules: readonly NewMarketScheduleOption[];
  sources: readonly NewMarketSource[];
  onDevices: (device: string) => void;
  onMethod: (method: NewMarketCreateInput["method"]) => void;
  onSchedule: (schedule: NewMarketCreateInput["schedule"]) => void;
  onNewSchedule: () => void;
}) {
  const t = useTranslations("projectMarkets");
  return (
    <>
      <div className="grid gap-1.5">
        <FieldLabel label={t("devices")} />
        <MenuSelect
          ariaLabel={t("devices")}
          onChange={onDevices}
          options={[
            { label: t("desktop"), value: "desktop" },
            { label: t("mobile"), value: "mobile" },
            { label: t("both"), value: "both" },
          ]}
          size="input"
          value={selectedDevice(devices)}
        />
        <p className="m-0 text-[12px] text-fg-muted">
          {t("deviceCountNote", { count: devices.length })}
        </p>
      </div>
      <NewMarketKeywordMethod
        onChange={onMethod}
        pasteError={pasteError}
        sources={sources}
        value={method}
      />
      {method && method.kind !== "empty" ? (
        <NewMarketSchedule
          onChange={onSchedule}
          onNewSchedule={onNewSchedule}
          schedules={schedules}
          value={schedule}
        />
      ) : null}
    </>
  );
}
