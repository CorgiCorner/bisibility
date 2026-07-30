"use client";

import { CopyButton } from "@/components/ui";
import { unwrapActionFailureResult } from "@/lib/actions/action-result";
import { createCloudMigrationHandoff } from "@/lib/actions/cloud";
import { actionErrorMessage } from "@/lib/ui/action-error";
import {
  ArrowRightIcon as ArrowRight,
  CheckCircleIcon as CheckCircle,
  CloudArrowUpIcon as CloudArrowUp,
  CloudCheckIcon as CloudCheck,
  LinkIcon,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import { useState } from "react";
import type {
  CloudMigrationHandoff,
  MigrationDirection,
  MigrationOutcome,
} from "./MigrateToCloudWizard.types";

// biome-ignore format: compact props keep this component under the file line cap.
type HandoffProps = { direction: MigrationDirection; handoff: CloudMigrationHandoff | null; onHandoff: (handoff: CloudMigrationHandoff) => void; projectId?: string; targetOrigin?: string };

// biome-ignore format: compact props keep this component under the file line cap.
type DoneStepProps = HandoffProps & { domain: string; holdMessage?: string | null; holdPending?: boolean; migrationHold: boolean; outcome: MigrationOutcome | null; onCancelMigration: () => void; onKeepReadOnly: () => void; onMarkMigrated: () => void };

function errorMessage(error: unknown) {
  return actionErrorMessage(error, "Migration handoff generation failed.");
}

async function copyText(text: string) {
  await navigator.clipboard?.writeText(text);
}

export function HandoffPanel({
  direction,
  handoff,
  onHandoff,
  projectId,
  targetOrigin,
}: Readonly<HandoffProps>) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const targetLabel = direction === "to-cloud" ? "Cloud" : "self-host";
  let generateLabel = "Generate";
  if (busy) generateLabel = "Generating...";
  else if (handoff) generateLabel = "Refresh";

  async function handleGenerate() {
    setBusy(true);
    setMessage(null);
    try {
      const next = unwrapActionFailureResult(
        await createCloudMigrationHandoff({
          ...(projectId ? { projectId } : {}),
          ...(targetOrigin ? { targetOrigin } : {}),
        }),
      );
      onHandoff(next);
      await copyText(next.cloudImportUrl).catch(() => undefined);
      setMessage(`${targetLabel} import link generated and copied.`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 overflow-hidden rounded-[14px] border border-border bg-bg-elev">
      <div className="flex items-center gap-[13px] border-border-soft border-b p-[16px_18px]">
        <span className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[10px] bg-accent-soft text-accent">
          <CloudArrowUp aria-hidden size={20} weight="fill" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold">{targetLabel} handoff</div>
          <div className="mt-0.5 text-[12px] text-fg-muted">
            Opens the destination import flow where the migration token is created.
          </div>
        </div>
        <button
          className="inline-flex min-h-9 flex-none items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55"
          disabled={busy}
          onClick={handleGenerate}
          type="button"
        >
          <LinkIcon aria-hidden size={14} />
          {generateLabel}
        </button>
      </div>
      {handoff ? (
        <div className="flex flex-col gap-3 p-[16px_18px]">
          <HandoffRow label="Import page" value={handoff.cloudImportUrl} />
          <HandoffRow label="Import API" value={handoff.apiImportUrl} />
          <div className="rounded-[11px] border border-border bg-bg-sunken px-3.5 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint">
              REST handoff
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg-muted">
                {handoff.apiRequest}
              </code>
              <CopyButton label="Copy REST handoff" size="md" text={handoff.apiRequest} />
            </div>
          </div>
          <a
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent"
            href={handoff.cloudImportUrl}
            rel="noreferrer"
            target="_blank"
          >
            Open {targetLabel} import page
            <ArrowRight aria-hidden size={13} weight="bold" />
          </a>
        </div>
      ) : null}
      {message ? (
        <div className="flex items-center gap-2 border-border-soft border-t px-[18px] py-3 text-[12px] text-fg-muted">
          {handoff ? (
            <CheckCircle aria-hidden className="text-green" size={14} weight="fill" />
          ) : (
            <WarningCircle aria-hidden className="text-yellow" size={14} weight="fill" />
          )}
          {message}
        </div>
      ) : null}
    </div>
  );
}

function ImportCompletionSummary({
  completion,
}: Readonly<{ completion: Extract<MigrationOutcome, { kind: "completed" }>["completion"] }>) {
  const countEntries = Object.entries(completion.counts ?? {}).filter(([, value]) => value > 0);
  return (
    <div className="mt-4 w-full max-w-[420px] rounded-[11px] border border-border bg-bg-sunken px-3.5 py-3 text-left">
      <div className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint">
        Import job {completion.jobId}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {countEntries.length > 0 ? (
          countEntries.map(([label, value]) => (
            <span
              className="rounded-full border border-border-strong bg-bg-elev px-2.5 py-1 font-mono text-[10.5px] text-fg-muted"
              key={label}
            >
              {label.replaceAll("_", " ")}: {value}
            </span>
          ))
        ) : (
          <span className="font-mono text-[11px] text-fg-muted">No imported rows reported.</span>
        )}
      </div>
    </div>
  );
}

export function DoneStep({
  domain,
  direction,
  handoff,
  holdMessage,
  holdPending = false,
  migrationHold,
  outcome,
  onCancelMigration,
  onHandoff,
  onKeepReadOnly,
  onMarkMigrated,
  projectId,
  targetOrigin,
}: DoneStepProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const targetLabel = direction === "to-cloud" ? "Cloud" : "self-host";
  const targetUrl = handoff?.cloudWorkspaceUrl ?? handoff?.cloudImportUrl ?? null;
  const completed = outcome?.kind === "completed" ? outcome.completion : null;

  async function handleGenerate() {
    setBusy(true);
    setMessage(null);
    try {
      const next = unwrapActionFailureResult(
        await createCloudMigrationHandoff({
          ...(projectId ? { projectId } : {}),
          ...(targetOrigin ? { targetOrigin } : {}),
        }),
      );
      onHandoff(next);
      await copyText(next.cloudWorkspaceUrl).catch(() => undefined);
      setMessage(`${targetLabel} workspace URL generated and copied.`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center px-4 py-6 text-center">
      <span
        className={`grid h-14 w-14 place-items-center rounded-[15px] ${completed ? "bg-green/10 text-green" : "bg-yellow/10 text-yellow"}`}
      >
        {completed ? (
          <CloudCheck aria-hidden size={30} weight="fill" />
        ) : (
          <WarningCircle aria-hidden size={30} weight="fill" />
        )}
      </span>
      <h3 className="m-0 mt-[18px] text-[18px] font-semibold tracking-[-0.4px]">
        {completed ? `${targetLabel} import complete` : "Awaiting external confirmation"}
      </h3>
      <p className="m-0 mt-[7px] max-w-[390px] text-[13.5px] leading-[1.55] text-fg-muted">
        {completed
          ? `${domain} was accepted and committed by the destination. Keep this source project as rollback until you verify the migrated workspace.`
          : `The package left this source flow, but ${targetLabel} has not reported a completed import here. Verify the destination before releasing read-only mode.`}
      </p>
      {completed ? <ImportCompletionSummary completion={completed} /> : null}
      <div className="mt-[22px] flex w-full max-w-[420px] items-center gap-2 rounded-[10px] border border-border-strong bg-bg-sunken px-3.5 py-[11px]">
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg-muted">
          {targetUrl ?? `Generate the ${targetLabel} handoff to copy a real URL`}
        </span>
        {targetUrl ? (
          <CopyButton label={`Copy ${targetLabel} URL`} size="md" text={targetUrl} />
        ) : (
          <button
            className="inline-flex min-h-8 items-center rounded-lg bg-accent px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55"
            disabled={busy}
            onClick={handleGenerate}
            type="button"
          >
            Generate
          </button>
        )}
      </div>
      {message ? <p className="m-0 mt-2 text-[12px] text-fg-muted">{message}</p> : null}
      <p className="m-0 mt-3 font-mono text-[11px] text-fg-faint">
        Re-connect SERP and analytics providers on the destination before resuming scheduled checks.
      </p>
      <div className="mt-5 w-full max-w-[420px] rounded-[12px] border border-border bg-bg px-3.5 py-3 text-left">
        <div className="text-[13px] font-semibold text-fg">Source project</div>
        <p className="m-0 mt-1 text-xs leading-5 text-fg-muted">
          {migrationHold
            ? `Keep it read-only while you verify the ${targetLabel} workspace, then mark it as migrated to disable it for good. Cancelling resumes writes here and the instances may drift apart.`
            : "Writes are active on this source project."}
        </p>
        {migrationHold ? (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-[9px] border border-border-strong bg-bg-elev px-3 text-[12.5px] font-semibold text-fg-muted disabled:opacity-60"
                disabled={busy || holdPending}
                onClick={onKeepReadOnly}
                type="button"
              >
                Keep read-only
              </button>
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-[9px] bg-accent px-3 text-[12.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55"
                disabled={busy || holdPending}
                onClick={onMarkMigrated}
                type="button"
              >
                Mark as migrated
              </button>
            </div>
            <button
              className="mt-2.5 p-0 text-[12px] font-semibold text-red hover:opacity-80 disabled:opacity-60"
              disabled={busy || holdPending}
              onClick={onCancelMigration}
              type="button"
            >
              Cancel migration and resume writes
            </button>
          </>
        ) : null}
        {holdMessage ? (
          <p className="m-0 mt-3 font-mono text-[11.5px] text-red">{holdMessage}</p>
        ) : null}
      </div>
    </div>
  );
}

function HandoffRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-center gap-2 rounded-[11px] border border-border bg-bg-sunken px-3.5 py-3">
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint">
          {label}
        </span>
        <span className="mt-1 block truncate font-mono text-[11.5px] text-fg-muted">{value}</span>
      </span>
      <CopyButton label={`Copy ${label}`} size="md" text={value} />
    </div>
  );
}
