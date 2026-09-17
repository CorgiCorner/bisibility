"use client";

import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { unwrapActionFailureResult } from "@/lib/actions/action-result";
import { createCloudMigrationHandoff } from "@/lib/actions/cloud";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { CloudArrowUpIcon as CloudArrowUp } from "@phosphor-icons/react/dist/csr/CloudArrowUp";
import { CloudCheckIcon as CloudCheck } from "@phosphor-icons/react/dist/csr/CloudCheck";
import { LinkIcon } from "@phosphor-icons/react/dist/csr/Link";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ImportCompletionSummary } from "./MigrateToCloudImportCompletion";
import type {
  CloudMigrationHandoff,
  MigrationDirection,
  MigrationOutcome,
} from "./MigrateToCloudWizard.types";

// biome-ignore format: compact props keep this component under the file line cap.
type HandoffProps = { direction: MigrationDirection; handoff: CloudMigrationHandoff | null; onHandoff: (handoff: CloudMigrationHandoff) => void; projectId?: string; targetOrigin?: string };

// biome-ignore format: compact props keep this component under the file line cap.
type DoneStepProps = HandoffProps & { domain: string; holdMessage?: string | null; holdPending?: boolean; migrationHold: boolean; outcome: MigrationOutcome | null; onCancelMigration: () => void; onKeepReadOnly: () => void; onMarkMigrated: () => void };

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
  const t = useTranslations("projectSettingsMigration.handoff");
  const transferT = useTranslations("projectSettingsMigration.transfer");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const targetLabel =
    direction === "to-cloud" ? transferT("target.hosted") : transferT("target.selfHost");
  let generateLabel = t("generate");
  if (busy) generateLabel = t("generating");
  else if (handoff) generateLabel = t("refresh");

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
      setMessage(t("generated", { target: targetLabel }));
    } catch {
      setMessage(t("generationError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 overflow-hidden rounded-card border border-border bg-bg-elev">
      <div className="flex items-center gap-[13px] border-border border-b p-[16px_18px]">
        <span className="grid h-[38px] w-[38px] flex-none place-items-center rounded-control bg-accent-soft text-accent-solid">
          <CloudArrowUp aria-hidden size={20} weight="regular" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold">{t("title", { target: targetLabel })}</div>
          <div className="mt-0.5 text-[12px] text-fg-muted">{t("description")}</div>
        </div>
        <Button
          disabled={busy}
          onClick={handleGenerate}
          startIcon={<LinkIcon aria-hidden size={14} weight="regular" />}
          style={{ flex: "none" }}
          type="button"
          variant="primary"
        >
          {generateLabel}
        </Button>
      </div>
      {handoff ? (
        <div className="flex flex-col gap-3 p-[16px_18px]">
          <HandoffRow label={t("importPage")} value={handoff.cloudImportUrl} />
          <HandoffRow label={t("importApi")} value={handoff.apiImportUrl} />
          <div className="rounded-control border border-border bg-bg-sunken px-3.5 py-3">
            <div className="font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
              {t("rest")}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-sans tabular-nums text-[11.5px] text-fg-muted">
                {handoff.apiRequest}
              </code>
              <CopyButton label={t("copyRest")} size="md" text={handoff.apiRequest} />
            </div>
          </div>
          <a
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent-text"
            href={handoff.cloudImportUrl}
            rel="noreferrer"
            target="_blank"
          >
            {t("openImport", { target: targetLabel })}
            <CaretRight aria-hidden size={13} weight="regular" />
          </a>
        </div>
      ) : null}
      {message ? (
        <div className="flex items-center gap-2 border-border border-t px-4.5 py-3 text-[12px] text-fg-muted">
          {handoff ? (
            <CheckCircle aria-hidden className="text-green-text" size={14} weight="regular" />
          ) : (
            <WarningCircle aria-hidden className="text-yellow-text" size={14} weight="regular" />
          )}
          {message}
        </div>
      ) : null}
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
  const t = useTranslations("projectSettingsMigration.handoff");
  const transferT = useTranslations("projectSettingsMigration.transfer");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const targetLabel =
    direction === "to-cloud" ? transferT("target.hosted") : transferT("target.selfHost");
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
      setMessage(t("projectGenerated", { target: targetLabel }));
    } catch {
      setMessage(t("generationError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center px-4 py-6 text-center">
      <span
        className={`grid h-14 w-14 place-items-center rounded-card ${completed ? "bg-green/10 text-green-text" : "bg-yellow/10 text-yellow-text"}`}
      >
        {completed ? (
          <CloudCheck aria-hidden size={30} weight="regular" />
        ) : (
          <WarningCircle aria-hidden size={30} weight="regular" />
        )}
      </span>
      <h3 className="m-0 mt-4.5 text-[18px] font-semibold tracking-[-0.4px]">
        {completed ? t("completed", { target: targetLabel }) : t("pending")}
      </h3>
      <p className="m-0 mt-[7px] max-w-[390px] text-[13.5px] leading-[1.55] text-fg-muted">
        {completed
          ? t("completedDescription", { domain })
          : t("pendingDescription", { target: targetLabel })}
      </p>
      {completed ? <ImportCompletionSummary completion={completed} /> : null}
      <div className="mt-5.5 flex w-full max-w-[420px] items-center gap-2 rounded-control border border-border bg-transparent px-3.5 py-[11px]">
        <span className="min-w-0 flex-1 truncate font-sans tabular-nums text-[11.5px] text-fg-muted">
          {targetUrl ?? t("generateUrl", { target: targetLabel })}
        </span>
        {targetUrl ? (
          <CopyButton label={t("copyUrl", { target: targetLabel })} size="md" text={targetUrl} />
        ) : (
          <Button
            disabled={busy}
            onClick={handleGenerate}
            size="xs"
            type="button"
            variant="primary"
          >
            {t("generate")}
          </Button>
        )}
      </div>
      {message ? <p className="m-0 mt-2 text-[12px] text-fg-muted">{message}</p> : null}
      <p className="m-0 mt-3 font-sans tabular-nums text-[11px] text-fg-muted">{t("reconnect")}</p>
      <div className="mt-5 w-full max-w-[420px] rounded-card border border-border bg-bg px-3.5 py-3 text-left">
        <div className="text-[13px] font-semibold text-fg">{t("sourceTitle")}</div>
        <p className="m-0 mt-1 text-xs leading-5 text-fg-muted">
          {migrationHold ? t("sourceHeld", { target: targetLabel }) : t("sourceActive")}
        </p>
        {migrationHold ? (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button
                disabled={busy || holdPending}
                onClick={onKeepReadOnly}
                style={{ "--control-color": "var(--fg-muted)", minHeight: 40 }}
                type="button"
                variant="secondary"
              >
                {t("keepReadOnly")}
              </Button>
              <Button
                disabled={busy || holdPending}
                onClick={onMarkMigrated}
                style={{ minHeight: 40 }}
                type="button"
                variant="primary"
              >
                {t("markMigrated")}
              </Button>
            </div>
            <button
              className="mt-2.5 p-0 text-[12px] font-semibold text-red-text hover:opacity-80 disabled:bg-bg-sunken disabled:text-fg-muted"
              disabled={busy || holdPending}
              onClick={onCancelMigration}
              type="button"
            >
              {t("cancelResume")}
            </button>
          </>
        ) : null}
        {holdMessage ? (
          <p className="m-0 mt-3 font-sans tabular-nums text-[11.5px] text-red-text">
            {holdMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function HandoffRow({ label, value }: Readonly<{ label: string; value: string }>) {
  const t = useTranslations("projectSettingsMigration.handoff");
  return (
    <div className="flex items-center gap-2 rounded-control border border-border bg-bg-sunken px-3.5 py-3">
      <span className="min-w-0 flex-1">
        <span className="block font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          {label}
        </span>
        <span className="mt-1 block truncate font-sans tabular-nums text-[11.5px] text-fg-muted">
          {value}
        </span>
      </span>
      <CopyButton label={t("copy", { label })} size="md" text={value} />
    </div>
  );
}
