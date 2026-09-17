"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { Button } from "@/components/ui/Button";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { unwrapActionFailureResult } from "@/lib/actions/action-result";
import { getCloudMigrationCompatibility, preflightMigrationTarget } from "@/lib/actions/cloud";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { CircleIcon as Circle } from "@phosphor-icons/react/dist/csr/Circle";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/csr/Info";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/dist/csr/LockSimple";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  compatibilityBlockers,
  MIGRATION_ERROR_CODES_URL,
  MIGRATION_GUIDE_URL,
  pendingRows,
  resultRows,
  type StatusRowData,
  technicalDetails,
} from "./MigrateToCloudCheck.rows";
import type {
  MigrationCompatibilityResult,
  MigrationDirection,
  MigrationTokenFormApi,
} from "./MigrateToCloudWizard.types";
import { MigrationDestinationField } from "./MigrationDestinationField";

type CheckStepProps = {
  compatibility: MigrationCompatibilityResult | null;
  contextKey: string;
  direction: MigrationDirection;
  form: MigrationTokenFormApi;
  holdMessage?: string | null;
  holdPending?: boolean;
  migrationHold: boolean;
  onCompatibilityChange: (result: MigrationCompatibilityResult | null) => void;
  projectId?: string;
};

function isInvalidMigrationTarget(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "invalid_migration_target";
}

export function CheckStep({
  compatibility,
  contextKey,
  direction,
  form,
  holdMessage,
  holdPending = false,
  migrationHold,
  onCompatibilityChange,
  projectId,
}: Readonly<CheckStepProps>) {
  const dateContext = useDateDisplay();
  const t = useTranslations("projectSettingsMigration.check");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const checkLabel = busy ? t("checking") : compatibility ? t("refresh") : t("run");
  const holdTitle = migrationHold
    ? t("holdActiveTitle")
    : holdPending
      ? t("holdEnablingTitle")
      : t("holdPendingTitle");

  async function runCheck() {
    if (!(await form.trigger("targetOrigin"))) return;
    setBusy(true);
    setMessage(null);
    onCompatibilityChange(null);
    try {
      const usesUserTarget =
        direction === "to-self-host" || form.formState.dirtyFields?.targetOrigin;
      const targetOrigin = usesUserTarget
        ? form.getValues("targetOrigin").trim() || undefined
        : undefined;
      const input = {
        ...(projectId ? { projectId } : {}),
        ...(targetOrigin ? { targetOrigin } : {}),
      };
      const [source, targetResult] = await Promise.all([
        getCloudMigrationCompatibility(projectId ? { projectId } : {}),
        preflightMigrationTarget(input),
      ]);
      const target = unwrapActionFailureResult(targetResult);
      const blockers = compatibilityBlockers(source, target);
      onCompatibilityChange({
        blockers,
        checkedAt: new Date().toISOString(),
        compatible: blockers.length === 0,
        contextKey,
        source,
        target,
      });
    } catch (error) {
      if (isInvalidMigrationTarget(error)) {
        form.setError("targetOrigin", { message: t("invalidTarget"), type: "server" });
      } else {
        setMessage(t("failureFallback"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <StepHeading body={t("body")} hint={t("preflightHint")} title={t("title")} />
      <MigrationDestinationField
        destinationUnreachable={compatibility?.target.reachable === false}
        direction={direction}
        form={form}
      />
      <div className="mt-4 flex flex-col gap-2.5">
        {message ? (
          <StatusRow
            data={{
              detail: t("failureDetail"),
              status: t("failureStatus"),
              title: message,
              tone: "fail",
              variant: "status",
            }}
          />
        ) : null}
        {(compatibility ? resultRows(compatibility, dateContext, t) : pendingRows(t)).map((row) => (
          <StatusRow data={row} key={row.title} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button disabled={busy} onClick={runCheck} type="button" variant="primary">
          {checkLabel}
        </Button>
        <a
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent-text"
          href={
            compatibility?.compatible === false ? MIGRATION_ERROR_CODES_URL : MIGRATION_GUIDE_URL
          }
          rel="noreferrer"
          target="_blank"
        >
          {t("guide")}
          <ArrowUpRight aria-hidden size={13} weight="regular" />
        </a>
      </div>
      {compatibility ? (
        <details className="mt-4 rounded-control border border-border bg-bg-sunken px-3.5 py-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] font-semibold text-fg-muted [&::-webkit-details-marker]:hidden">
            <CaretDown aria-hidden className="transition-transform" size={12} weight="regular" />
            {t("technical")}
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {technicalDetails(compatibility, dateContext, t).map((line) => (
              <span
                className="wrap-break-word font-sans tabular-nums text-[11px] text-fg-muted"
                key={line}
              >
                {line}
              </span>
            ))}
          </div>
        </details>
      ) : null}
      <div className="mt-4 flex items-start gap-2.5 rounded-control border border-border bg-bg-sunken px-3.5 py-3">
        <LockSimple
          aria-hidden
          className={migrationHold ? "mt-1 text-green-text" : "mt-1 text-yellow-text"}
          size={16}
          weight="regular"
        />
        <span className="min-w-0 flex-1 text-[12.5px] leading-5 text-fg-muted">
          <span className="block font-semibold text-fg">{holdTitle}</span>
          {migrationHold ? t("holdActiveBody") : t("holdPendingBody")}
        </span>
      </div>
      {holdMessage ? <p className="m-0 mt-2.5 text-[12px] text-red-text">{holdMessage}</p> : null}
    </>
  );
}

function StepHeading({
  body,
  hint,
  title,
}: Readonly<{ body: string; hint?: string; title: string }>) {
  return (
    <>
      <h3 className="m-0 flex items-center gap-1 text-[15px] font-semibold">
        {title}
        {hint ? <InfoTooltip text={hint} /> : null}
      </h3>
      <p className="m-0 mt-1.5 text-[13px] leading-[1.55] text-fg-muted">{body}</p>
    </>
  );
}

function StatusRow({ data }: Readonly<{ data: StatusRowData }>) {
  const tone = {
    fail: {
      icon: WarningCircle,
      status: "text-red-text",
      symbol: "text-red-text",
      weight: "regular" as const,
    },
    info: {
      icon: Info,
      status: "text-fg-muted",
      symbol: "text-fg-muted",
      weight: "regular" as const,
    },
    ok: {
      icon: CheckCircle,
      status: "text-green-text",
      symbol: "text-green-text",
      weight: "regular" as const,
    },
    pending: {
      icon: Circle,
      status: "text-fg-muted",
      symbol: "text-fg-muted",
      weight: "regular" as const,
    },
  }[data.tone];
  const Icon = tone.icon;
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-control border border-border bg-transparent px-[13px] py-3">
      <Icon aria-hidden className={tone.symbol} size={19} weight="regular" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold">{data.title}</span>
        <span className="block wrap-break-word text-[12px] leading-5 text-fg-muted">
          {data.detail}
        </span>
      </span>
      {data.variant === "status" ? (
        <span className={`font-sans tabular-nums text-[11px] font-semibold ${tone.status}`}>
          {data.status}
        </span>
      ) : null}
    </div>
  );
}
