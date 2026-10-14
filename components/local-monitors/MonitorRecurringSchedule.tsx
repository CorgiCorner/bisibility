"use client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { recurringCentsUsd, recurringUsdCents } from "@/lib/local-monitor-recurring/cost";
import type { RecurringFormValues } from "@/lib/local-monitor-recurring/form-schema";
import {
  approveRecurringMonitorAction,
  pauseRecurringMonitorAction,
  previewRecurringMonitorAction,
  readRecurringMonitorAction,
} from "@/lib/local-monitor-recurring/session-actions";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { MonitorRecurringForm } from "./MonitorRecurringForm";
import { MonitorRecurringReview } from "./MonitorRecurringReview";

type Preview = Extract<
  Awaited<ReturnType<typeof previewRecurringMonitorAction>>,
  { kind: "ready" }
>;
export function MonitorRecurringSchedule({
  projectId,
  monitorId,
  version,
  canWrite,
}: {
  projectId: string;
  monitorId: string;
  version: number;
  canWrite: boolean;
}) {
  const t = useTranslations("shared.localMonitors.recurring"),
    format = useFormatter(),
    router = useRouter();
  const query = useQuery({
    queryKey: ["local-monitor-recurring", projectId, monitorId, version],
    queryFn: () => readRecurringMonitorAction(projectId, monitorId),
  });
  const [preview, setPreview] = useState<Preview | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState(false);
  const state = query.data;
  async function review(values: RecurringFormValues) {
    if (!state) return;
    const calendar = state.schedules.find((row) => row.id === values.scheduleId);
    if (!calendar) return;
    setPending(true);
    setError(false);
    setPreview(null);
    try {
      const result = await previewRecurringMonitorAction({
        projectId,
        monitorId,
        expectedVersion: version,
        connectionId: values.connectionId,
        scheduleId: values.scheduleId,
        expectedScheduleEpoch: calendar.epoch,
        maximumPerOccurrenceCents: recurringUsdCents(values.maximumPerOccurrenceUsd),
        maximumTotalCents: recurringUsdCents(values.maximumTotalUsd),
        maximumOccurrences: values.maximumOccurrences,
        validUntil: new Date(values.validUntil).toISOString(),
        catchUp: "skip_elapsed",
        idempotencyKey: crypto.randomUUID(),
      });
      if (result.kind === "ready") setPreview(result);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  async function approve() {
    if (!preview) return;
    setPending(true);
    setError(false);
    try {
      const result = await approveRecurringMonitorAction(preview.command);
      if (result.kind !== "saved") {
        setError(true);
        return;
      }
      setPreview(null);
      await query.refetch();
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  async function pause() {
    setPending(true);
    setError(false);
    try {
      const result = await pauseRecurringMonitorAction({
        projectId,
        monitorId,
        expectedVersion: version,
        idempotencyKey: crypto.randomUUID(),
      });
      if (result.kind !== "saved") {
        setError(true);
        return;
      }
      setPreview(null);
      await query.refetch();
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <Card className="space-y-3">
      <h2 className="text-base font-semibold">{t("title")}</h2>
      {query.isPending ? (
        <p role="status">{t("loading")}</p>
      ) : query.isError ? (
        <p role="alert">{t("unavailable")}</p>
      ) : state ? (
        <>
          {!state.enabled ? <p className="text-sm text-fg-muted">{t("disabled")}</p> : null}
          {state.approval ? (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt>{t("next")}</dt>
                <dd>
                  {format.dateTime(new Date(state.approval.nextDueAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </dd>
              </div>
              <div>
                <dt>{t("validThrough")}</dt>
                <dd>
                  {format.dateTime(new Date(state.approval.validUntil), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </dd>
              </div>
              <div>
                <dt>{t("issuedCeiling")}</dt>
                <dd>
                  USD {recurringCentsUsd(state.approval.issuedCents)} /{" "}
                  {recurringCentsUsd(state.approval.maximumTotalCents)}
                </dd>
              </div>
              <div>
                <dt>{t("status")}</dt>
                <dd>{t(`states.${state.approval.state}`)}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-fg-muted">{t("noApproval")}</p>
          )}
          {state.choicesTruncated ? (
            <p role="status" className="text-sm">
              {t("tooManyChoices")}
            </p>
          ) : null}
          {canWrite && state.enabled ? (
            <MonitorRecurringForm
              key={`${monitorId}:${version}`}
              state={state}
              pending={pending || preview !== null}
              onReview={review}
            />
          ) : null}
          {canWrite && state.mode === "scheduled" ? (
            <Button variant="outline" disabled={pending} onClick={() => void pause()}>
              {t("pause")}
            </Button>
          ) : null}
        </>
      ) : null}
      {preview ? (
        <div className="space-y-2 border-t border-border pt-3">
          <MonitorRecurringReview command={preview.command} />
          <div className="flex gap-2">
            <Button disabled={pending} onClick={() => void approve()}>
              {t("approve")}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setPreview(null)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-text">
          {t("unavailable")}
        </p>
      ) : null}
    </Card>
  );
}
