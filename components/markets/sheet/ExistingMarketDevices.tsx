"use client";
import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { useToast } from "@/components/ui/toast-context";
import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  type MarketDeviceActions,
  type MarketDeviceCandidate,
  type MarketDevicePreview,
  type MarketDeviceSelection,
  marketDeviceSelectionSchema,
} from "@/lib/markets/device-targets-input";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { MarketDeviceKeywordPicker } from "./MarketDeviceKeywordPicker";
import type { NewMarketScheduleOption } from "./NewMarketSchedule";
export function ExistingMarketDevices({
  projectId,
  marketId,
  actions,
  schedules,
  onAdded,
  initialDevice = "mobile",
  onPendingChange,
  actionsContainer,
  candidates,
}: {
  projectId: string;
  marketId: string;
  actions: MarketDeviceActions;
  schedules: readonly NewMarketScheduleOption[];
  onAdded?: () => void;
  initialDevice?: "desktop" | "mobile";
  onPendingChange?: (pending: boolean) => void;
  actionsContainer?: HTMLElement | null;
  candidates?: readonly MarketDeviceCandidate[];
}) {
  const t = useTranslations("projectMarkets.deviceTracking");
  const { showToast } = useToast();
  const root = useTranslations("projectMarkets");
  const form = useForm<MarketDeviceSelection>({
    resolver: zodResolver(marketDeviceSelectionSchema),
    defaultValues: {
      projectId,
      marketId,
      device: initialDevice,
      scheduleId: null,
      ...(candidates
        ? {
            keywordIds: candidates
              .filter((candidate) => !candidate.existingDevices.includes(initialDevice))
              .map((candidate) => candidate.id),
          }
        : {}),
    },
  });
  const selection = form.watch();
  const key = JSON.stringify(selection);
  const current = useRef({ key, request: 0 });
  if (current.current.key !== key) current.current = { key, request: current.current.request + 1 };
  const [review, setReview] = useState<{ key: string; value: MarketDevicePreview } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const shown = review?.key === key && review.value.outcome === "ready" ? review.value : null;
  async function preview(input: MarketDeviceSelection) {
    const request = ++current.current.request;
    setBusy(true);
    onPendingChange?.(true);
    setError(null);
    try {
      const value = await actions.preview(input);
      if (current.current.key !== key || current.current.request !== request) return;
      setReview({ key, value });
      if (value.outcome === "unavailable") setError(t(`errors.${value.reason}`));
    } catch {
      if (current.current.request === request) setError(t("failed"));
    } finally {
      if (current.current.request === request) {
        setBusy(false);
        onPendingChange?.(false);
      }
    }
  }
  async function confirm(input: MarketDeviceSelection) {
    if (!shown?.newCheckCount || busy) return;
    const request = ++current.current.request;
    setBusy(true);
    onPendingChange?.(true);
    setError(null);
    try {
      const value = await actions.add({ ...input, fingerprint: shown.fingerprint });
      if (current.current.key !== key || current.current.request !== request) return;
      if (value.outcome === "unavailable") {
        setReview(null);
        setError(t(`errors.${value.reason}`));
      } else {
        setAdded(value.created);
        showToast(t("added", { count: value.created }), { severity: "success" });
        onAdded?.();
      }
    } catch {
      if (current.current.request === request) {
        setReview(null);
        setError(t("failed"));
      }
    } finally {
      if (current.current.request === request) {
        setBusy(false);
        onPendingChange?.(false);
      }
    }
  }
  if (added !== null)
    return (
      <p role="status" className="text-sm text-fg">
        {t("added", { count: added })}
      </p>
    );
  const controls = (
    <div
      className={actionsContainer ? "contents" : "flex flex-wrap items-center justify-end gap-2"}
    >
      {!shown?.newCheckCount ? (
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={busy || (candidates !== undefined && !selection.keywordIds?.length)}
          onClick={() => void form.handleSubmit(preview)()}
        >
          {t("review")}
        </Button>
      ) : null}
      {shown && shown.newCheckCount > 0 ? (
        <Button
          type="button"
          size="sm"
          disabled={busy}
          loading={busy}
          onClick={() => void form.handleSubmit(confirm)()}
        >
          {t("confirm", { count: shown.newCheckCount, device: root(selection.device) })}
        </Button>
      ) : null}
    </div>
  );
  return (
    <section aria-label={t("title")} className="grid gap-3 rounded-card border border-border p-4">
      <h3 className="text-sm font-medium">{t("title")}</h3>
      <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0" disabled={busy}>
        <div className="grid gap-1.5">
          <FieldLabel label={t("device")} />
          <MenuSelect
            ariaLabel={t("device")}
            size="input"
            value={selection.device}
            onChange={(value) => {
              const device = value as "desktop" | "mobile";
              form.setValue("device", device);
              if (candidates)
                form.setValue(
                  "keywordIds",
                  candidates
                    .filter((candidate) => !candidate.existingDevices.includes(device))
                    .map((candidate) => candidate.id),
                );
              setError(null);
            }}
            options={[
              { label: root("mobile"), value: "mobile" },
              { label: root("desktop"), value: "desktop" },
            ]}
          />
        </div>
        {candidates ? (
          <MarketDeviceKeywordPicker
            candidates={candidates}
            device={selection.device}
            selected={selection.keywordIds ?? []}
            onChange={(ids) => {
              form.setValue("keywordIds", ids);
              setError(null);
            }}
          />
        ) : null}
        <div className="grid gap-1.5">
          <FieldLabel label={root("schedule")} />
          <MenuSelect
            ariaLabel={root("schedule")}
            size="input"
            value={selection.scheduleId ?? "manual"}
            onChange={(value) => {
              form.setValue("scheduleId", value === "manual" ? null : value);
              setError(null);
            }}
            options={[
              { label: root("manual"), value: "manual" },
              ...schedules
                .filter((item) => !["manual", "paused"].includes(item.frequency))
                .map((item) => ({ label: item.name, value: item.id })),
            ]}
          />
        </div>
      </fieldset>
      <p className="text-xs text-fg-muted">
        {selection.scheduleId ? t("scheduledNotice") : t("manualNotice")}
      </p>
      {shown ? (
        <div role="status" className="grid gap-1 text-sm">
          <p>
            {t("scope", {
              checks: shown.newCheckCount,
              device: root(selection.device),
            })}
          </p>
          {shown.existingCount > 0 || shown.archivedCount > 0 ? (
            <p className="text-xs text-fg-muted">
              {t("skipped", { existing: shown.existingCount, archived: shown.archivedCount })}
            </p>
          ) : null}
        </div>
      ) : null}
      {form.formState.errors.keywordIds ? (
        <p role="alert" className="text-xs text-red-text">
          {t("selectionLimit")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-red-text">
          {error}
        </p>
      ) : null}
      {actionsContainer === undefined
        ? controls
        : actionsContainer
          ? createPortal(controls, actionsContainer)
          : null}
    </section>
  );
}
