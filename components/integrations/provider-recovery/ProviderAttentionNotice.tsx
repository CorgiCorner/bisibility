"use client";

import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import type { AttentionState } from "@/lib/integrations/provider-recovery/types";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";

type Props = {
  state: AttentionState;
  canManage: boolean;
  onCheck: () => void;
  onViewChecks: () => void;
  onDismiss: () => void;
  copy?: { heading: string; description: string };
  labels?: Record<
    "free" | "owner" | "dismiss" | "checking" | "check" | "open" | "schedule" | "checks",
    string
  >;
  allowCheck?: boolean;
  accountUrl?: string;
};

export function ProviderAttentionNotice({
  state,
  canManage,
  onCheck,
  onViewChecks,
  onDismiss,
  copy: suppliedCopy,
  labels: suppliedLabels,
  allowCheck,
  accountUrl,
}: Props) {
  const t = useTranslations("projectIntegrations.recovery");
  const copy = suppliedCopy ?? {
    heading: t(`${state}Heading`, { provider: "" }),
    description: t(`${state}Description`),
  };
  const labels = suppliedLabels ?? {
    free: t("free"),
    owner: t("owner"),
    dismiss: t("dismiss"),
    checking: t("checking"),
    check: t("check"),
    open: t("open"),
    schedule: t("schedule"),
    checks: t("checks"),
  };
  const ready = state === "ready";
  const checking = state === "checking";
  const billing = state === "billing" || checking;
  const checkable = allowCheck ?? billing;
  const hue = ready
    ? "var(--green)"
    : billing || state === "review"
      ? "var(--yellow)"
      : "var(--blue)";
  const dismissStyle = {
    "--control-hover-background-color": "transparent",
    "--control-focus-background-color": "transparent",
    "--control-hover-text-decoration": "underline",
    "--control-hover-text-underline-offset": "3px",
  } satisfies CSSProperties;
  return (
    <div
      className="@container rounded-control border p-3 sm:p-4"
      style={{
        background: `color-mix(in srgb, ${hue} 6%, var(--bg-elev))`,
        borderColor: `color-mix(in srgb, ${hue} 36%, var(--border))`,
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="grid h-5 w-6 shrink-0 place-items-center"
          style={{ color: ready ? "var(--green-text)" : "var(--fg-muted)" }}
        >
          {ready ? (
            <CheckCircleIcon aria-hidden size={21} weight="regular" />
          ) : (
            <WarningCircleIcon aria-hidden size={21} weight="regular" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div aria-live="polite" role="status">
            <h3 className="m-0 text-[14px] leading-snug font-semibold">{copy.heading}</h3>
            <p className="m-0 mt-1.5 max-w-[560px] text-[13px] leading-relaxed text-fg-muted">
              {copy.description}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3 @min-[520px]:flex-row @min-[520px]:items-center">
        {checkable || (!canManage && !ready) ? (
          <p className="order-last m-0 text-center text-[11.5px] text-fg-muted @min-[420px]:text-right @min-[520px]:order-first @min-[520px]:text-left">
            {canManage ? labels.free : labels.owner}
          </p>
        ) : null}
        <div className="grid w-full grid-cols-2 items-center gap-2 @min-[420px]:ml-auto @min-[420px]:flex @min-[420px]:w-auto @min-[420px]:justify-end">
          <Button
            className={`${checkable && canManage ? "" : "col-span-2"} min-h-11 w-full @min-[520px]:min-h-8.5 @min-[420px]:w-auto @min-[420px]:shrink-0 @min-[420px]:whitespace-nowrap`}
            onClick={onDismiss}
            size="sm"
            style={dismissStyle}
            variant="ghost"
          >
            {labels.dismiss}
          </Button>
          {checkable && canManage ? (
            <>
              <Button
                className="min-h-11 w-full @min-[520px]:min-h-8.5 @min-[420px]:w-auto @min-[420px]:shrink-0 @min-[420px]:whitespace-nowrap"
                loading={checking}
                loadingLabel={labels.checking}
                onClick={onCheck}
                size="sm"
                startIcon={
                  checking ? (
                    <Spinner />
                  ) : (
                    <ArrowClockwiseIcon aria-hidden size={14} weight="regular" />
                  )
                }
                variant="outline"
              >
                {labels.check}
              </Button>
            </>
          ) : !billing ? (
            <Button
              className="col-span-2 row-start-1 min-h-11 w-full @min-[520px]:min-h-8.5 @min-[420px]:w-auto @min-[420px]:shrink-0 @min-[420px]:whitespace-nowrap"
              onClick={onViewChecks}
              size="sm"
              variant={ready ? "primary" : "outline"}
            >
              {ready ? labels.schedule : labels.checks}
            </Button>
          ) : null}
          {accountUrl && canManage && !ready ? (
            <Button
              className="col-span-2 row-start-1 min-h-11 w-full @min-[520px]:min-h-8.5 @min-[420px]:w-auto @min-[420px]:shrink-0 @min-[420px]:whitespace-nowrap"
              href={accountUrl}
              rel="noopener noreferrer"
              size="sm"
              target="_blank"
              endIcon={<ArrowUpRightIcon aria-hidden size={14} weight="regular" />}
            >
              {labels.open}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function DismissedProviderNotice({
  state,
  onShow,
}: {
  state: AttentionState;
  onShow: () => void;
}) {
  const t = useTranslations("projectIntegrations.recovery");
  const message =
    state === "ready"
      ? t("dismissedReady")
      : state === "review"
        ? t("dismissedReview")
        : state === "internal"
          ? t("dismissedInternal")
          : t("dismissedBilling");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-bg-sunken p-3">
      <p aria-live="polite" className="m-0 text-[12px] text-fg-muted" role="status">
        {message}
      </p>
      <Button className="min-h-10 sm:min-h-8.5" onClick={onShow} size="sm" variant="outline">
        {t("showDetails")}
      </Button>
    </div>
  );
}
