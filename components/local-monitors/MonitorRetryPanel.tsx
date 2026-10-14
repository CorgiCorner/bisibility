"use client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type { MonitorLaunchFailure, MonitorLaunchPreview } from "@/lib/local-monitor-launch/result";
import {
  launchMonitorAction,
  previewMonitorLaunchAction,
  readMonitorRetryAction,
} from "@/lib/local-monitor-launch/session-actions";
import { monitorRetryFormSchema } from "@/lib/local-monitor-retry/input-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

type Ready = Extract<MonitorLaunchPreview, { kind: "ready" }>;
export function MonitorRetryPanel({
  projectId,
  monitorId,
  version,
  runId,
  canWrite,
}: {
  projectId: string;
  monitorId: string;
  version: number;
  runId: string;
  canWrite: boolean;
}) {
  const t = useTranslations("shared.localMonitors.retry"),
    manual = useTranslations("shared.localMonitors.manual"),
    format = useFormatter();
  const query = useQuery({
    queryKey: ["local-monitor-retry", projectId, monitorId, runId, version],
    queryFn: () => readMonitorRetryAction({ projectId, monitorId, runId }),
    retry: false,
  });
  const state = query.data?.kind === "ready" ? query.data.state : null;
  const form = useForm<z.input<typeof monitorRetryFormSchema>>({
    resolver: zodResolver(monitorRetryFormSchema),
    defaultValues: { connectionId: "", targetIds: [] },
  });
  const values = form.watch();
  const selectionEligible = Boolean(
    state &&
      values.targetIds.length &&
      values.targetIds.every((id) => state.rows.some((row) => row.targetId === id && row.eligible)),
  );
  const [preview, setPreview] = useState<Ready | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState<MonitorLaunchFailure | null>(null),
    [queued, setQueued] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  function invalidate() {
    setPreview(null);
    setError(null);
    key.current = null;
  }
  async function prepare(input: z.input<typeof monitorRetryFormSchema>) {
    if (!canWrite || pending || !selectionEligible) return;
    setPending(true);
    setError(null);
    setPreview(null);
    key.current ??= crypto.randomUUID();
    try {
      const result = await previewMonitorLaunchAction({
        projectId,
        monitorId,
        expectedVersion: version,
        connectionId: input.connectionId,
        idempotencyKey: key.current,
        retry: { parentRunId: runId, targetIds: input.targetIds },
      });
      if (result.kind === "ready") setPreview(result);
      else setError(result);
    } catch {
      setError({ kind: "unavailable" });
    } finally {
      setPending(false);
    }
  }
  async function launch() {
    if (!canWrite || pending || !preview || !selectionEligible) return;
    setPending(true);
    setError(null);
    try {
      const result = await launchMonitorAction(preview.command);
      if (result.kind === "queued") {
        setQueued(result.receipt.intent.id);
        invalidate();
        form.setValue("targetIds", []);
        await query.refetch();
      } else setError(result);
    } catch {
      setError({ kind: "unavailable" });
    } finally {
      setPending(false);
    }
  }
  const shownError =
    error ??
    (query.data && query.data.kind !== "ready"
      ? query.data
      : query.isError
        ? { kind: "unavailable" as const }
        : null);
  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">{t("title")}</h2>
      <p className="text-sm text-fg-muted">{t("help")}</p>
      {state ? (
        <p>{t("parentCount", { count: format.number(state.parentExpectedCount) })}</p>
      ) : null}
      {state?.retry ? (
        <p className="text-sm">
          {t("childScope", {
            parent: format.number(state.retry.parentExpectedCount),
            selected: format.number(state.retry.selectedCount),
          })}
        </p>
      ) : null}
      <form className="space-y-3" onSubmit={form.handleSubmit(prepare)}>
        <fieldset disabled={!canWrite || pending} className="m-0 space-y-3 border-0 p-0">
          <legend className="text-sm font-medium">{t("selection")}</legend>
          {state?.rows.map((row) => (
            <Checkbox
              key={row.targetId}
              disabled={!row.eligible || pending || !canWrite}
              checked={values.targetIds.includes(row.targetId)}
              label={`${row.keyword} · ${t("point", { point: format.number(row.ordinal + 1) })}`}
              description={`${row.latitude}, ${row.longitude} · ${t(`reasons.${row.reason}`)}`}
              onChange={(event) => {
                form.setValue(
                  "targetIds",
                  event.currentTarget.checked
                    ? [...values.targetIds, row.targetId]
                    : values.targetIds.filter((id) => id !== row.targetId),
                  { shouldValidate: true },
                );
                invalidate();
              }}
            />
          ))}
          <MenuSelect
            ariaLabel={manual("connection")}
            value={values.connectionId}
            disabled={!state || pending || !canWrite}
            options={[
              { value: "", label: manual("chooseConnection") },
              ...(state?.connections ?? []).map((c) => ({
                value: c.id,
                label: c.provider === "dataforseo" ? "DataForSEO" : c.provider,
              })),
            ]}
            onChange={(value) => {
              form.setValue("connectionId", value, { shouldValidate: true });
              invalidate();
            }}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={!canWrite || pending || !values.connectionId || !selectionEligible}
          >
            {manual("preview")}
          </Button>
        </fieldset>
      </form>
      {preview && selectionEligible ? (
        <section aria-label={manual("consent")} className="space-y-3">
          <p>
            {t("childScope", {
              parent: format.number(
                preview.command.retry?.parentExpectedCount ?? preview.expectedCount,
              ),
              selected: format.number(preview.expectedCount),
            })}
          </p>
          <ul className="list-inside list-disc text-sm">
            {preview.nativeEstimates.map((e) => (
              <li key={e.unit}>
                {e.amount ?? manual("unknown")}{" "}
                {e.unit === "cents" ? manual("nativeCents") : e.unit}
              </li>
            ))}
          </ul>
          <p>
            {manual("expires", {
              time: format.dateTime(new Date(preview.expiresAt), {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
          </p>
          <p className="text-sm">{manual("consentHelp")}</p>
          <Button disabled={!canWrite || pending} onClick={() => void launch()}>
            {t("confirm")}
          </Button>
        </section>
      ) : null}
      {shownError ? (
        <p role="alert" className="text-sm text-red-text">
          {manual(
            shownError.reason ? `unavailable.${shownError.reason}` : `errors.${shownError.kind}`,
          )}
        </p>
      ) : null}
      {queued ? <p role="status">{t("queued", { id: queued })}</p> : null}
      <Button
        variant="ghost"
        disabled={pending || query.isFetching}
        onClick={() => {
          invalidate();
          form.setValue("targetIds", []);
          void query.refetch();
        }}
      >
        {manual("refreshRecorded")}
      </Button>
    </Card>
  );
}
