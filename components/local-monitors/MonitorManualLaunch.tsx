"use client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { monitorConnectionChoiceSchema } from "@/lib/local-monitor-launch/input-schema";
import type { MonitorLaunchFailure, MonitorLaunchPreview } from "@/lib/local-monitor-launch/result";
import {
  launchMonitorAction,
  previewMonitorLaunchAction,
  readMonitorLaunchAction,
} from "@/lib/local-monitor-launch/session-actions";
import type { MonitorIntentView } from "@/lib/local-monitor-worker/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { MonitorRunReceipt } from "./MonitorRunReceipt";

type ReadyPreview = Extract<MonitorLaunchPreview, { kind: "ready" }>;
export function MonitorManualLaunch({
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
  const t = useTranslations("shared.localMonitors.manual"),
    format = useFormatter();
  const query = useQuery({
    queryKey: ["local-monitor-launch", projectId, monitorId, version],
    queryFn: () => readMonitorLaunchAction({ projectId, monitorId }),
    retry: false,
  });
  const state = query.data?.kind === "ready" ? query.data.state : null;
  const form = useForm<z.input<typeof monitorConnectionChoiceSchema>>({
    resolver: zodResolver(monitorConnectionChoiceSchema),
    defaultValues: { connectionId: "" },
  });
  const connectionId = form.watch("connectionId");
  const [preview, setPreview] = useState<ReadyPreview | null>(null),
    [pending, setPending] = useState(false);
  const [error, setError] = useState<MonitorLaunchFailure | null>(null),
    [accepted, setAccepted] = useState<MonitorIntentView | null>(null);
  const key = useRef<string | null>(null);
  const intent =
    accepted && state?.intent?.id !== accepted.id ? accepted : (state?.intent ?? accepted);
  async function prepare(values: z.input<typeof monitorConnectionChoiceSchema>) {
    if (!canWrite || pending) return;
    setPending(true);
    setError(null);
    setPreview(null);
    key.current ??= crypto.randomUUID();
    try {
      const value = await previewMonitorLaunchAction({
        projectId,
        monitorId,
        expectedVersion: version,
        connectionId: values.connectionId,
        idempotencyKey: key.current,
      });
      if (value.kind === "ready") setPreview(value);
      else setError(value);
    } catch {
      setError({ kind: "unavailable" });
    } finally {
      setPending(false);
    }
  }
  async function enqueue() {
    if (!canWrite || !preview || pending) return;
    setPending(true);
    setError(null);
    try {
      const value = await launchMonitorAction(preview.command);
      if (value.kind === "queued") {
        setAccepted(value.receipt.intent);
        setPreview(null);
        key.current = null;
        await query.refetch();
      } else setError(value);
    } catch {
      setError({ kind: "unavailable" });
    } finally {
      setPending(false);
    }
  }
  const readError = query.data && query.data.kind !== "ready" ? query.data : null;
  const shownError =
    error ?? readError ?? (query.isError ? { kind: "unavailable" as const } : null);
  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">{t("title")}</h2>
      <p className="text-sm text-fg-muted">{t("help")}</p>
      {canWrite ? (
        <form className="space-y-3" onSubmit={form.handleSubmit(prepare)}>
          <MenuSelect
            ariaLabel={t("connection")}
            value={connectionId}
            disabled={pending || !state}
            ariaInvalid={Boolean(form.formState.errors.connectionId)}
            options={[
              { value: "", label: t("chooseConnection") },
              ...(state?.connections ?? []).map((connection) => ({
                value: connection.id,
                label: connection.provider === "dataforseo" ? "DataForSEO" : connection.provider,
              })),
            ]}
            onChange={(value) => {
              form.setValue("connectionId", value, { shouldValidate: true });
              setPreview(null);
              key.current = null;
              setError(null);
            }}
          />
          {state && !state.connections.length ? (
            <p className="text-sm">{t("noConnection")}</p>
          ) : null}
          <Button type="submit" variant="outline" disabled={pending || !connectionId}>
            {t("preview")}
          </Button>
        </form>
      ) : null}
      {preview ? (
        <section className="space-y-3" aria-label={t("consent")}>
          <p>{t("taskCount", { count: format.number(preview.expectedCount) })}</p>
          <ul className="list-inside list-disc text-sm">
            {preview.nativeEstimates.map((estimate) => (
              <li key={estimate.unit}>
                {estimate.amount ?? t("unknown")}{" "}
                {estimate.unit === "cents" ? t("nativeCents") : estimate.unit}
              </li>
            ))}
          </ul>
          <p className="text-sm">
            {t("expires", {
              time: format.dateTime(new Date(preview.expiresAt), {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
          </p>
          <p className="text-sm text-fg-muted">{t("consentHelp")}</p>
          <Button disabled={pending} onClick={() => void enqueue()}>
            {t("confirmLaunch")}
          </Button>
        </section>
      ) : null}
      {shownError ? (
        <p role="alert" className="text-sm text-red-text">
          {t(shownError.reason ? `unavailable.${shownError.reason}` : `errors.${shownError.kind}`)}
        </p>
      ) : null}
      {intent ? (
        <p role="status" className="text-sm">
          {t(`queue.${intent.state}`)}
        </p>
      ) : null}
      <Button
        variant="ghost"
        disabled={pending || query.isFetching}
        onClick={() => void query.refetch()}
      >
        {t("refreshRecorded")}
      </Button>
      {state?.run ? (
        <MonitorRunReceipt run={state.run} labels={state.labels} />
      ) : (
        <p className="text-sm text-fg-muted">{t(query.isPending ? "loadingRecorded" : "noRun")}</p>
      )}
    </Card>
  );
}
