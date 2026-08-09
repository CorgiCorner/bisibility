"use client";

import { Button } from "@/components/ui";
import { unwrapActionFailureResult } from "@/lib/actions/action-result";
import { getCloudMigrationCompatibility, preflightMigrationTarget } from "@/lib/actions/cloud";
import { actionErrorMessage } from "@/lib/ui/action-error";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  ArrowUpRightIcon as ArrowUpRight,
  CaretDownIcon as CaretDown,
  CheckCircleIcon as CheckCircle,
  ClockIcon as Clock,
  InfoIcon as Info,
  LockSimpleIcon as LockSimple,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
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
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  let checkLabel = "Run compatibility check";
  if (busy) checkLabel = "Checking...";
  else if (compatibility) checkLabel = "Refresh check";
  let holdTitle = "Read-only mode is confirmed at the next step";
  if (migrationHold) holdTitle = "Read-only mode is active";
  else if (holdPending) holdTitle = "Enabling read-only mode";

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
      const nextMessage = actionErrorMessage(error, "Compatibility check failed.");
      if (isInvalidMigrationTarget(error)) {
        form.setError("targetOrigin", { message: nextMessage, type: "server" });
      } else {
        setMessage(nextMessage);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <StepHeading
        body="Make sure the destination instance can accept this project before anything is paused or transferred."
        title="Check compatibility"
      />
      <MigrationDestinationField direction={direction} form={form} />
      <div className="mt-4 flex flex-col gap-2.5">
        {message ? (
          <StatusRow
            data={{
              detail:
                "The check itself didn't run - this is usually a network hiccup. Try again in a moment.",
              status: "ERROR",
              title: message,
              tone: "fail",
              variant: "status",
            }}
          />
        ) : null}
        {(compatibility ? resultRows(compatibility) : pendingRows()).map((row) => (
          <StatusRow data={row} key={row.title} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          disabled={busy}
          onClick={runCheck}
          startIcon={<ArrowsClockwise aria-hidden size={14} />}
          type="button"
          variant="primary"
        >
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
          Migration guide
          <ArrowUpRight aria-hidden size={13} weight="bold" />
        </a>
      </div>
      {compatibility ? (
        <details className="mt-4 rounded-[11px] border border-border bg-bg-sunken px-3.5 py-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] font-semibold text-fg-muted [&::-webkit-details-marker]:hidden">
            <CaretDown aria-hidden className="transition-transform" size={12} weight="bold" />
            Technical details
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {technicalDetails(compatibility).map((line) => (
              <span className="wrap-break-word font-mono text-[11px] text-fg-muted" key={line}>
                {line}
              </span>
            ))}
          </div>
        </details>
      ) : null}
      <div className="mt-4 flex items-start gap-2.5 rounded-[11px] border border-border bg-bg-sunken px-3.5 py-3">
        <LockSimple
          aria-hidden
          className={migrationHold ? "mt-1 text-green-text" : "mt-1 text-yellow-text"}
          size={16}
          weight="fill"
        />
        <span className="min-w-0 flex-1 text-[12.5px] leading-5 text-fg-muted">
          <span className="block font-semibold text-fg">{holdTitle}</span>
          {migrationHold
            ? "Writes and rank checks stay paused until you cancel the migration."
            : "After all gates pass, Continue asks you to confirm pausing writes and rank checks before the transfer starts."}
        </span>
      </div>
      {holdMessage ? <p className="m-0 mt-2.5 text-[12px] text-red-text">{holdMessage}</p> : null}
      <InfoBox>
        Transfer runs the destination preflight again, so a target changed after this check is still
        rejected before import.
      </InfoBox>
    </>
  );
}

function StepHeading({ body, title }: Readonly<{ body: string; title: string }>) {
  return (
    <>
      <h3 className="m-0 text-[15px] font-semibold">{title}</h3>
      <p className="m-0 mt-1.5 text-[13px] leading-[1.55] text-fg-muted">{body}</p>
    </>
  );
}

function StatusRow({ data }: Readonly<{ data: StatusRowData }>) {
  const tone = {
    fail: { icon: WarningCircle, status: "text-red-text", symbol: "text-red-text" },
    info: { icon: Info, status: "text-blue-text", symbol: "text-blue-text" },
    ok: { icon: CheckCircle, status: "text-green-text", symbol: "text-green-text" },
    pending: { icon: Clock, status: "text-blue-text", symbol: "text-blue-text" },
  }[data.tone];
  const Icon = tone.icon;
  return (
    <div className="flex items-center gap-3 rounded-[11px] border border-border bg-bg px-[15px] py-[13px]">
      <Icon aria-hidden className={tone.symbol} size={19} weight="fill" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold">{data.title}</span>
        <span className="block wrap-break-word text-[12px] leading-5 text-fg-muted">
          {data.detail}
        </span>
      </span>
      {data.variant === "status" ? (
        <span className={`font-mono text-[11px] font-semibold ${tone.status}`}>{data.status}</span>
      ) : null}
    </div>
  );
}

function InfoBox({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="mt-4 flex items-start gap-[9px] rounded-[11px] border border-dashed border-border-strong bg-transparent px-3.5 py-3 text-xs leading-5 text-fg-muted">
      <Info aria-hidden className="mt-0.5 text-accent-text" size={15} />
      <span>{children}</span>
    </div>
  );
}
