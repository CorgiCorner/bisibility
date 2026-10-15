"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import {
  launchProviderComparisonAction,
  loadProviderComparisonAction,
  previewProviderComparisonAction,
  readProviderComparisonAction,
} from "@/lib/actions/provider-comparison";
import type {
  ComparisonContext,
  ComparisonPreview,
  ComparisonRun,
} from "@/lib/provider-comparison/types";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { ComparisonResults } from "./ComparisonResults";

export type ComparisonActions = {
  load: typeof loadProviderComparisonAction;
  preview: typeof previewProviderComparisonAction;
  launch: typeof launchProviderComparisonAction;
  read: typeof readProviderComparisonAction;
};
const defaultActions: ComparisonActions = {
  load: loadProviderComparisonAction,
  preview: previewProviderComparisonAction,
  launch: launchProviderComparisonAction,
  read: readProviderComparisonAction,
};

export function ProviderComparisonCard({
  projectRef,
  keywordRef,
  canLaunch,
  timeZone,
  actions = defaultActions,
}: {
  projectRef: string;
  keywordRef: string;
  canLaunch: boolean;
  timeZone: string;
  actions?: ComparisonActions;
}) {
  const t = useTranslations("projectRankTracker.keywordDetail.providerComparison");
  const format = useFormatter();
  const contentId = useId();
  const [opened, setOpened] = useState(false);
  const [context, setContext] = useState<ComparisonContext | null>(null);
  const [preview, setPreview] = useState<ComparisonPreview | null>(null);
  const [run, setRun] = useState<ComparisonRun | null>(null);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [launchAttempted, setLaunchAttempted] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const scope = { projectRef, keywordRef };
  const perform = (work: () => Promise<void>) =>
    startTransition(async () => {
      setError(false);
      try {
        await work();
      } catch {
        setError(true);
      }
    });
  const load = () =>
    perform(async () => {
      const result = await actions.load(scope);
      if (!result.ok) {
        setError(true);
        return;
      }
      setContext(result.context);
      setRun(result.run);
    });
  const getPreview = () =>
    perform(async () => {
      const result = await actions.preview(scope);
      if (!result.ok) {
        setError(true);
        return;
      }
      setPreview(result.preview);
      setRequestKey(crypto.randomUUID());
      setLaunchAttempted(false);
    });
  const launch = () =>
    perform(async () => {
      if (!preview || !requestKey) return;
      setLaunchAttempted(true);
      const result = await actions.launch({
        ...scope,
        previewId: preview.id,
        previewHash: preview.hash,
        requestKey,
      });
      if (!result.ok) {
        if (result.reason === "preview_changed") {
          setPreview(null);
          setLaunchAttempted(false);
        }
        setError(true);
        return;
      }
      setRun(result.run);
      setPreview(null);
    });
  const refresh = () =>
    perform(async () => {
      if (!run) return;
      const result = await actions.read({ ...scope, runId: run.id });
      if (!result.ok) {
        setError(true);
        return;
      }
      setRun(result.run);
    });
  const inProgress = run?.sides.some(
    (side) => side.status === "queued" || side.status === "claimed",
  );
  return (
    <Card component="section" className="min-w-0 px-5 py-4.5" size="md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <h2 className="text-sm font-medium">{t("title")}</h2>
          <InfoTooltip text={t("help")} />
        </div>
        <Button
          size="sm"
          variant="secondary"
          aria-controls={contentId}
          aria-expanded={opened}
          disabled={pending}
          onClick={() => {
            setOpened(!opened);
            if (!opened && !context) load();
          }}
        >
          {t(opened ? "close" : "open")}
        </Button>
      </div>
      {opened ? (
        <div className="mt-4 grid gap-4" id={contentId}>
          {error ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
              <span>{t("error")}</span>
              {!context ? (
                <Button size="sm" variant="secondary" onClick={load} disabled={pending}>
                  {t("retry")}
                </Button>
              ) : null}
            </div>
          ) : null}
          {!context && pending ? (
            <p role="status" className="text-sm text-fg-muted">
              {t("loading")}
            </p>
          ) : null}
          {context ? (
            <>
              <p className="text-xs text-fg-muted">
                {context.keyword.locationLabel} · {t(context.keyword.device)} · {t("depth")}
              </p>
              {!context.available ? (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <p>{t("needsProviders")}</p>
                  <Button size="sm" variant="secondary" href={`/app/${projectRef}/integrations`}>
                    {t("connections")}
                  </Button>
                </div>
              ) : null}
              {run ? (
                <>
                  <ComparisonResults run={run} timeZone={timeZone} />
                  <div>
                    <Button size="sm" variant="secondary" loading={pending} onClick={refresh}>
                      {t("refresh")}
                    </Button>
                  </div>
                </>
              ) : null}
              {context.available && canLaunch && !preview && !inProgress ? (
                <div>
                  <Button size="sm" variant="secondary" loading={pending} onClick={getPreview}>
                    {t("preview")}
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
          {preview ? (
            <div className="grid gap-3 rounded-control border border-border p-3">
              <h3 className="text-sm font-medium">{t("review")}</h3>
              <dl className="grid gap-2 text-sm">
                {preview.sides.map((side) => (
                  <div
                    key={side.provider}
                    className="flex flex-wrap items-baseline justify-between gap-2"
                  >
                    <dt>{t(`providers.${side.provider}`)}</dt>
                    <dd className="tabular-nums">
                      {side.nativeUnit === "cents"
                        ? format.number(side.nativeQuantity / 100, {
                            style: "currency",
                            currency: "USD",
                            maximumFractionDigits: 4,
                          })
                        : t("searches", { count: side.nativeQuantity })}
                      {side.fundingSource === "hosted"
                        ? ` · ${t("credits", { value: format.number(side.estimatedCostCents / 100, { style: "currency", currency: "USD", maximumFractionDigits: 4 }) })}`
                        : ""}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-fg-muted">
                {t("expires", {
                  date: format.dateTime(new Date(preview.expiresAt), {
                    timeStyle: "short",
                    timeZone,
                  }),
                })}
              </p>
              {launchAttempted && error ? (
                <p className="text-xs text-fg-muted">{t("launchUncertain")}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" loading={pending} onClick={launch}>
                  {t(launchAttempted ? "retryLaunch" : "launch")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending || launchAttempted}
                  onClick={() => setPreview(null)}
                >
                  {t("cancel")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
