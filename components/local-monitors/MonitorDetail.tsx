"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type {
  LocalMonitorRunHistory,
  LocalMonitorRunResult,
} from "@/lib/local-monitor-results/model";
import type {
  MonitorSaveResult,
  MonitorDetail as MonitorValue,
  SetupChoices,
} from "@/lib/local-monitors/contracts";
import {
  saveMonitorAction,
  searchMonitorChoicesAction,
} from "@/lib/local-monitors/session-actions";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { MonitorCapturedScope } from "./MonitorCapturedScope";
import { MonitorForm } from "./MonitorForm";
import { MonitorHistory } from "./MonitorHistory";
import { MonitorManualLaunch } from "./MonitorManualLaunch";
import { MonitorPoints } from "./MonitorPoints";
import { MonitorRecurringSchedule } from "./MonitorRecurringSchedule";
import { MonitorRetryPanel } from "./MonitorRetryPanel";
import { MonitorRunResults } from "./results/MonitorRunResults";

export function MonitorDetail({
  projectId,
  monitor,
  choices,
  runHistory,
  runResult,
  resultUnavailable,
}: {
  projectId: string;
  monitor: MonitorValue;
  choices: SetupChoices;
  runHistory: LocalMonitorRunHistory | null;
  runResult: LocalMonitorRunResult | null;
  resultUnavailable: boolean;
}) {
  const t = useTranslations("shared.localMonitors");
  const format = useFormatter();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<MonitorSaveResult | null>(null);
  const archiveKey = useRef<string | null>(null);
  const current = monitor.state === "active";
  async function archive() {
    if (pending || !choices.permissions.canWrite || !current) return;
    archiveKey.current ??= crypto.randomUUID();
    setPending(true);
    setResult(null);
    try {
      const next = await saveMonitorAction({
        operation: "archive",
        projectId,
        monitorId: monitor.id,
        expectedVersion: monitor.version,
        idempotencyKey: archiveKey.current,
      });
      setResult(next);
      if (next.kind === "saved") {
        setConfirm(false);
        router.refresh();
      }
    } catch {
      setResult({ kind: "unavailable" });
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-5">
      <Link
        className="text-sm text-accent underline-offset-4 hover:underline"
        href={appPath(asProjectRef(projectId), "settings", "business-locations", "monitors")}
      >
        {t("back")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{monitor.name}</h1>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setEditing(false);
            setConfirm(false);
            setResult(null);
            archiveKey.current = null;
            router.refresh();
          }}
        >
          {t("reload")}
        </Button>
        {choices.permissions.canWrite && current ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              {t("edit")}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(true)}>
              {t("archive")}
            </Button>
          </div>
        ) : null}
      </div>
      <Card className="space-y-3">
        <p>
          {t("revisionNumber", { revision: format.number(monitor.revision) })} ·{" "}
          {t(current ? "states.active" : "states.archived")}
        </p>
        <p className="text-sm text-fg-muted">{t("setupOnly")}</p>
        <p className="text-sm">
          {t("keywords")}: {monitor.keywords.map((row) => row.text).join(", ")}
        </p>
        <p className="text-sm">
          {t("mode")}:{" "}
          {t(
            monitor.schedule.mode === "scheduled"
              ? "modes.scheduled"
              : monitor.schedule.mode === "paused"
                ? "modes.paused"
                : monitor.schedule.mode === "manual"
                  ? "modes.manual"
                  : "modes.unknown",
          )}
        </p>
        <MonitorCapturedScope monitor={monitor} />
        {monitor.readiness.reasons.length ? (
          <ul className="list-inside list-disc text-sm">
            {monitor.readiness.reasons.map((reason) => (
              <li key={reason}>{t(`readiness.${reason}`)}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-4 text-sm">
          <Link
            className="text-accent hover:underline"
            href={appPath(asProjectRef(projectId), "settings", "business-locations")}
          >
            {t("manageSubjects")}
          </Link>
          <Link
            className="text-accent hover:underline"
            href={appPath(asProjectRef(projectId), "integrations")}
          >
            {t("reviewIntegrations")}
          </Link>
        </div>
      </Card>
      {!choices.permissions.canWrite ? (
        <p className="text-sm text-fg-muted">{t("readOnly")}</p>
      ) : null}
      {confirm ? (
        <Card className="space-y-3">
          <p>{t("archiveConfirm")}</p>
          <div className="flex gap-2">
            <Button
              disabled={pending || result?.kind === "conflict"}
              onClick={() => void archive()}
            >
              {t("confirmArchive")}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setConfirm(false)}>
              {t("cancel")}
            </Button>
          </div>
        </Card>
      ) : null}
      {result && result.kind !== "saved" ? (
        <p role="alert" className="text-sm text-red-text">
          {t(`errors.${result.kind}`)}
        </p>
      ) : null}
      {editing && choices.permissions.canWrite && current ? (
        <MonitorForm
          key={`${monitor.id}:${monitor.version}`}
          projectId={projectId}
          current={monitor}
          choices={choices}
          save={saveMonitorAction}
          search={searchMonitorChoicesAction}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      ) : null}
      <MonitorManualLaunch
        key={`${monitor.id}:${monitor.version}`}
        projectId={projectId}
        monitorId={monitor.id}
        version={monitor.version}
        canWrite={choices.permissions.canWrite && current}
      />
      <MonitorRecurringSchedule
        key={`${monitor.id}:${monitor.version}:recurring`}
        projectId={projectId}
        monitorId={monitor.id}
        version={monitor.version}
        canWrite={choices.permissions.canWrite && current}
      />
      <MonitorRunResults
        key={`${monitor.id}:${runResult?.runId ?? "empty"}:${runResult?.asOf ?? "none"}:${runHistory?.window?.from ?? "all"}:${runHistory?.window?.to ?? "all"}`}
        projectId={projectId}
        monitorId={monitor.id}
        initialHistory={runHistory}
        report={runResult}
        unavailable={resultUnavailable}
      />
      {runResult ? (
        <MonitorRetryPanel
          key={`${monitor.id}:${runResult.runId}:${monitor.version}`}
          projectId={projectId}
          monitorId={monitor.id}
          version={monitor.version}
          runId={runResult.runId}
          canWrite={choices.permissions.canWrite && current}
        />
      ) : null}
      <MonitorPoints monitor={monitor} />
      <MonitorHistory
        key={`${monitor.id}:${monitor.revision}`}
        projectId={projectId}
        monitorId={monitor.id}
      />
    </div>
  );
}
