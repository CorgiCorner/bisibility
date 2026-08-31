"use client";

import {
  type TrackingScheduleSelection,
  trackingScheduleOptions,
} from "@/components/keywords/add/TrackingConfigurationFields";
import { TRACK_DIALOG_COPY } from "@/components/search-insights/search-insights-copy";
import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button, MenuSelect, Modal } from "@/components/ui";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import {
  type SerpDepth,
  type SerpDevice,
  serpDepthValues,
  serpDeviceOptions,
} from "@/lib/serp/markets";
import { CheckIcon as Check } from "@phosphor-icons/react";
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

const LABEL = "font-mono text-ui-micro uppercase tracking-wider text-fg-muted";
const CHIP =
  "inline-flex min-h-7.5 max-w-full items-center gap-1.5 rounded-control border px-3 text-ui-caption font-medium transition-colors";
const CHIP_ON = "border-border-control bg-accent-soft text-fg";
const CHIP_OFF = "border-border bg-bg-elev text-fg-muted hover:bg-bg-sunken";
const SELECT =
  "min-h-9 w-full justify-between rounded-control border-border bg-bg-elev px-3 normal-case tracking-normal";
const depthOptions = serpDepthValues.map((depth) => ({
  label: `Top ${depth}`,
  value: String(depth),
}));

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
      title={
        <span className="flex min-w-0 flex-col gap-1.25">
          <span className={LABEL}>{TRACK_DIALOG_COPY.title}</span>
          <span className="text-ui-section break-words">{query}</span>
        </span>
      }
      footer={
        <div className="flex items-center gap-2.5">
          <Button onClick={onCancel} size="sm" variant="ghost">
            {TRACK_DIALOG_COPY.cancel}
          </Button>
          <ProjectReadOnlyTooltip className="inline-flex flex-1">
            <Button
              disabled={readOnly || !selectedKey}
              onClick={() => {
                if (selectedKey)
                  onConfirm({ device, locationKey: selectedKey, schedule, serpDepth });
              }}
              ref={confirmRef}
              sx={{ flex: 1 }}
            >
              {trackConfirmLabel(schedule, costContext.rawFrequency)}
            </Button>
          </ProjectReadOnlyTooltip>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        <section aria-label={TRACK_DIALOG_COPY.market} className="flex flex-col gap-1.75">
          <span className={LABEL}>{TRACK_DIALOG_COPY.market}</span>
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
                  <span className="font-mono text-ui-micro">{TRACK_DIALOG_COPY.paused}</span>
                ) : null}
              </button>
            ))}
          </div>
        </section>
        <section aria-label={TRACK_DIALOG_COPY.device} className="flex flex-col gap-1.75">
          <span className={LABEL}>{TRACK_DIALOG_COPY.device}</span>
          <div className="flex gap-1.5">
            {serpDeviceOptions.map((option) => (
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
          <section
            aria-label={TRACK_DIALOG_COPY.schedule}
            className="flex min-w-0 flex-col gap-1.75"
          >
            <span className={LABEL}>{TRACK_DIALOG_COPY.schedule}</span>
            <MenuSelect
              ariaLabel={TRACK_DIALOG_COPY.schedule}
              onChange={(value) => setSchedule(value as TrackingScheduleSelection)}
              options={trackingScheduleOptions(costContext.rawFrequency)}
              pinCaret
              triggerClassName={SELECT}
              value={schedule}
            />
          </section>
          <section aria-label={TRACK_DIALOG_COPY.depth} className="flex min-w-0 flex-col gap-1.75">
            <span className={LABEL}>{TRACK_DIALOG_COPY.depth}</span>
            <MenuSelect
              ariaLabel={TRACK_DIALOG_COPY.depth}
              onChange={(value) => setSerpDepth(Number(value) as SerpDepth)}
              options={depthOptions}
              pinCaret
              triggerClassName={SELECT}
              value={String(serpDepth)}
            />
          </section>
        </div>
        <section className="flex flex-col gap-1.5 rounded-card border border-border bg-bg-sunken px-3.5 py-3">
          <span className={LABEL}>{TRACK_DIALOG_COPY.costTitle}</span>
          <span className="font-mono text-ui-caption leading-normal">
            {trackCostLine(costContext, schedule, serpDepth)}
          </span>
          <span className="text-ui-caption leading-normal text-fg-muted">
            {TRACK_DIALOG_COPY.ownRate}
          </span>
        </section>
      </div>
    </Modal>
  );
}
