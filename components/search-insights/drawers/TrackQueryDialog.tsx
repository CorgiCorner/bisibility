"use client";

import type { TrackingScheduleSelection } from "@/components/keywords/add/TrackingConfigurationFields";
import { formatResearchEstimateCents } from "@/components/research/research-money";
import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Modal } from "@/components/ui/Modal";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { type SerpDepth, type SerpDevice, serpDepthValues } from "@/lib/serp/constants";
import { VISIBILITY_HORIZON, VISIBILITY_SHALLOW_CHECK_COPY } from "@/lib/visibility/definition";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import {
  trackConfirmLabel,
  trackCostLine,
  trackDefaultMarketKey,
  trackMarketOptions,
} from "./track-dialog-model";

export type TrackQueryConfirm = {
  device: SerpDevice;
  locationKey: string;
  schedule: TrackingScheduleSelection;
  serpDepth: SerpDepth;
};

export type TrackQueryDialogProps = {
  costContext: ProjectCostContext;
  defaultDevice: SerpDevice;
  defaultMarketKey: string | null;
  markets: ProjectMarketsView;
  onCancel: () => void;
  onConfirm: (confirm: TrackQueryConfirm) => void;
  /** The query being added, or nothing when the dialog is closed. */
  query: string | null;
};

const LABEL = "font-sans tabular-nums text-ui-micro uppercase tracking-wider text-fg-muted";
const CHIP =
  "inline-flex min-h-7.5 max-w-full items-center gap-1.5 rounded-control border px-3 text-ui-caption font-medium transition-colors";
const CHIP_ON = "border-border-control bg-accent-soft text-fg";
const CHIP_OFF = "border-border bg-bg-elev text-fg-muted hover:bg-bg-sunken";
const SELECT =
  "min-h-9 w-full justify-between rounded-control border-border bg-bg-elev px-3 normal-case tracking-normal";
function trackDialogTitle(
  query: string | null,
  t: ReturnType<typeof useTranslations<"projectSearchInsights.copy">>,
) {
  return (
    <span className="flex min-w-0 flex-col gap-1.25">
      <span className={LABEL}>{t("trackDialogTitle")}</span>
      <span className="text-ui-section break-words">{query}</span>
    </span>
  );
}

export function TrackQueryDialogLoading({
  onCancel,
  query,
}: Readonly<Pick<TrackQueryDialogProps, "onCancel" | "query">>) {
  const t = useTranslations("projectSearchInsights.copy");
  return (
    <Modal
      headerDivider
      onClose={onCancel}
      open={query !== null}
      size="sm"
      title={trackDialogTitle(query, t)}
    >
      <div aria-label={t("trackDialogLoading")} className="flex flex-col gap-3.5" role="status">
        <div className="h-16 animate-pulse rounded-card bg-bg-sunken" />
        <div className="h-20 animate-pulse rounded-card bg-bg-sunken" />
        <div className="h-16 animate-pulse rounded-card bg-bg-sunken" />
      </div>
    </Modal>
  );
}

/**
 * A check costs the customer provider money every day it runs, so the row's action opens this and
 * never adds anything: confirm is the only thing that writes.
 */
export function TrackQueryDialog({
  costContext,
  defaultDevice,
  defaultMarketKey,
  markets,
  onCancel,
  onConfirm,
  query,
}: Readonly<TrackQueryDialogProps>) {
  const { readOnly } = useProjectWriteMode();
  const format = useFormatter();
  const t = useTranslations("projectSearchInsights.copy");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const options = trackMarketOptions(markets);
  const fallbackKey = trackDefaultMarketKey(options, defaultMarketKey);
  const [device, setDevice] = useState<SerpDevice>(defaultDevice);
  const [marketKey, setMarketKey] = useState<string | null>(fallbackKey);
  const [schedule, setSchedule] = useState<TrackingScheduleSelection>("project_default");
  const [serpDepth, setSerpDepth] = useState<SerpDepth>(costContext.depth);
  const selectedKey = options.some((option) => option.key === marketKey && !option.disabled)
    ? marketKey
    : fallbackKey;
  const projectFrequencyLabel =
    costContext.rawFrequency === "custom_cron"
      ? t("trackScheduleProjectDefaultCustom_cron")
      : costContext.rawFrequency === "daily"
        ? t("trackScheduleProjectDefaultDaily")
        : costContext.rawFrequency === "weekly"
          ? t("trackScheduleProjectDefaultWeekly")
          : costContext.rawFrequency === "monthly"
            ? t("trackScheduleProjectDefaultMonthly")
            : costContext.rawFrequency === "manual"
              ? t("trackScheduleProjectDefaultManual")
              : t("trackScheduleProjectDefaultPaused");
  const scheduleOptions = [
    {
      label: t("trackScheduleProjectDefault", { frequency: projectFrequencyLabel }),
      value: "project_default",
    },
    { label: t("trackScheduleDaily"), value: "daily" },
    { label: t("trackScheduleWeekly"), value: "weekly" },
    { label: t("trackScheduleMonthly"), value: "monthly" },
    { label: t("trackScheduleManual"), value: "manual" },
    { label: t("trackSchedulePaused"), value: "paused" },
  ];
  const depthOptions = serpDepthValues.map((depth) => ({
    label: t("trackDepth", { depth }),
    value: String(depth),
  }));
  const deviceOptions = [
    { label: t("trackDeviceDesktop"), value: "desktop" },
    { label: t("trackDeviceMobile"), value: "mobile" },
  ] as const;
  const presentation = {
    formatMoney: (cents: number) => formatResearchEstimateCents(cents, format.number),
    t,
  };

  return (
    <Modal
      headerDivider
      initialFocus={() => confirmRef.current?.focus()}
      onClose={onCancel}
      onExited={() => {
        setDevice(defaultDevice);
        setMarketKey(fallbackKey);
        setSchedule("project_default");
        setSerpDepth(costContext.depth);
      }}
      onPrimaryAction={() => {
        if (selectedKey) onConfirm({ device, locationKey: selectedKey, schedule, serpDepth });
      }}
      open={query !== null}
      primaryActionDisabled={readOnly || !selectedKey}
      size="sm"
      title={trackDialogTitle(query, t)}
      footer={
        <div className="flex items-center gap-2.5">
          <Button onClick={onCancel} size="sm" variant="ghost">
            {t("trackDialogCancel")}
          </Button>
          <ProjectReadOnlyTooltip className="inline-flex flex-1">
            <Button
              disabled={readOnly || !selectedKey}
              onClick={() => {
                if (selectedKey)
                  onConfirm({ device, locationKey: selectedKey, schedule, serpDepth });
              }}
              ref={confirmRef}
              style={{ flex: 1 }}
            >
              {trackConfirmLabel(schedule, costContext.rawFrequency, t)}
            </Button>
          </ProjectReadOnlyTooltip>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        <section aria-label={t("trackDialogMarket")} className="flex flex-col gap-1.75">
          <span className={LABEL}>{t("trackDialogMarket")}</span>
          <div className="flex flex-wrap gap-1.5">
            {options.map((option) => (
              <button
                aria-label={`${option.name} / ${option.language}`}
                aria-pressed={option.key === selectedKey}
                className={`${CHIP} ${option.key === selectedKey ? CHIP_ON : CHIP_OFF}${option.disabled ? " opacity-60" : ""}`}
                disabled={option.disabled}
                key={option.key}
                onClick={() => setMarketKey(option.key)}
                type="button"
              >
                {option.key === selectedKey ? (
                  <Check aria-hidden size={10} weight="regular" />
                ) : null}
                <span className="truncate font-semibold">{option.name}</span>
                <span className="text-fg-muted">/ {option.language}</span>
                {option.disabled ? (
                  <span className="font-sans tabular-nums text-ui-micro">
                    {t("trackDialogPaused")}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </section>
        <section aria-label={t("trackDialogDevice")} className="flex flex-col gap-1.75">
          <span className={LABEL}>{t("trackDialogDevice")}</span>
          <div className="flex gap-1.5">
            {deviceOptions.map((option) => (
              <button
                aria-pressed={option.value === device}
                className={`${CHIP} ${option.value === device ? CHIP_ON : CHIP_OFF}`}
                key={option.value}
                onClick={() => setDevice(option.value)}
                type="button"
              >
                {option.value === device ? <Check aria-hidden size={10} weight="regular" /> : null}
                {option.label}
              </button>
            ))}
          </div>
        </section>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <section aria-label={t("trackDialogSchedule")} className="flex min-w-0 flex-col gap-1.75">
            <span className={LABEL}>{t("trackDialogSchedule")}</span>
            <MenuSelect
              ariaLabel={t("trackDialogSchedule")}
              onChange={(value) => setSchedule(value as TrackingScheduleSelection)}
              options={scheduleOptions}
              pinCaret
              triggerClassName={SELECT}
              value={schedule}
            />
          </section>
          <section aria-label={t("trackDialogDepth")} className="flex min-w-0 flex-col gap-1.75">
            <span className={LABEL}>{t("trackDialogDepth")}</span>
            <MenuSelect
              ariaLabel={t("trackDialogDepth")}
              onChange={(value) => setSerpDepth(Number(value) as SerpDepth)}
              options={depthOptions}
              pinCaret
              triggerClassName={SELECT}
              triggerTitle={
                serpDepth < VISIBILITY_HORIZON ? VISIBILITY_SHALLOW_CHECK_COPY : undefined
              }
              triggerWrapperClassName="w-full"
              value={String(serpDepth)}
            />
          </section>
        </div>
        <section className="flex flex-col gap-1.5 rounded-card border border-border bg-bg-sunken px-3.5 py-3">
          <span className={LABEL}>{t("trackDialogCostTitle")}</span>
          <span className="font-sans tabular-nums text-ui-caption leading-normal">
            {trackCostLine(costContext, schedule, serpDepth, presentation)}
          </span>
          <span className="text-ui-caption leading-normal text-fg-muted">
            {t("trackDialogOwnRate")}
          </span>
        </section>
      </div>
    </Modal>
  );
}
