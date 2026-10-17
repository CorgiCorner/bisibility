"use client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { localHistoryHref } from "@/lib/local-monitor-results/history-links";
import type {
  LocalMonitorRunHistory,
  LocalMonitorRunResult,
} from "@/lib/local-monitor-results/model";
import {
  exportLocalRunResultAction,
  readLocalRunHistoryAction,
} from "@/lib/local-monitor-results/session-actions";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { MonitorHistoryWindow } from "./MonitorHistoryWindow";
import { MonitorPointEvidence } from "./MonitorPointEvidence";
import { MonitorResultGrid } from "./MonitorResultGrid";
import { MonitorResultTable } from "./MonitorResultTable";
export function MonitorRunResults({
  projectId,
  monitorId,
  initialHistory,
  report,
  unavailable,
}: {
  projectId: string;
  monitorId: string;
  initialHistory: LocalMonitorRunHistory | null;
  report: LocalMonitorRunResult | null;
  unavailable: boolean;
}) {
  const t = useTranslations("shared.localMonitors"),
    format = useFormatter(),
    [history, setHistory] = useState(initialHistory),
    [keyword, setKeyword] = useState(report?.grids[0]?.keywordId ?? ""),
    [pointId, setPointId] = useState<string | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState(false);
  const grid = report?.grids.find((value) => value.keywordId === keyword),
    points = report?.points.filter((value) => value.keywordId === keyword) ?? [],
    point = report?.points.find((value) => value.id === pointId);
  const href = appPath(
    asProjectRef(projectId),
    "settings",
    "business-locations",
    "monitors",
    monitorId,
  );
  async function more() {
    if (pending || !history?.nextCursor) return;
    setPending(true);
    setError(false);
    try {
      const next = await readLocalRunHistoryAction({
        projectId,
        monitorId,
        cursor: history.nextCursor,
        asOf: history.asOf,
        ...(history.window?.from ? { from: history.window.from } : {}),
        ...(history.window ? { to: history.window.to } : {}),
      });
      setHistory((old) => ({ ...next, items: [...(old?.items ?? []), ...next.items] }));
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  async function download(kind: "csv" | "json") {
    if (pending || !report) return;
    setPending(true);
    setError(false);
    try {
      const file = await exportLocalRunResultAction({
        projectId,
        monitorId,
        runId: report.runId,
        asOf: report.asOf,
        version: 1,
        format: kind,
      });
      const url = URL.createObjectURL(new Blob([file.text], { type: file.mediaType }));
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  const percent = (value: number | null) =>
    value === null
      ? t("results.unknown")
      : format.number(value, { style: "percent", maximumFractionDigits: 1 });
  return (
    <section className="space-y-4" aria-label={t("results.title")}>
      <h2 className="font-semibold">{t("results.title")}</h2>
      <p className="text-sm text-fg-muted">{t("results.seedHelp")}</p>
      {unavailable ? (
        <p role="alert">{t("results.unavailable")}</p>
      ) : !report ? (
        <p>{t("results.empty")}</p>
      ) : null}
      {report ? (
        <Card className="space-y-4">
          <p>
            {report.subject} ·{" "}
            {t("revisionNumber", { revision: format.number(report.definitionRevision) })}
          </p>
          <p className="text-sm">
            {t("results.asOf")}:{" "}
            <time dateTime={report.asOf}>
              {format.dateTime(new Date(report.asOf), { dateStyle: "medium", timeStyle: "short" })}
            </time>
          </p>
          <p className="text-sm text-fg-muted">{t("results.accountingHelp")}</p>
          <MenuSelect
            ariaLabel={t("keywords")}
            value={keyword}
            options={report.grids.map((value) => ({
              value: value.keywordId,
              label: value.keyword,
            }))}
            onChange={(value) => {
              setKeyword(value);
              setPointId(null);
            }}
          />
          {grid ? (
            <>
              <dl className="grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <dt>{t("results.topN", { n: format.number(grid.topN) })}</dt>
                  <dd>{percent(grid.observedRate)}</dd>
                </div>
                <div>
                  <dt>{t("results.observedCoverage")}</dt>
                  <dd>
                    {percent(grid.observedCoverage)} ({grid.counts.measured}/{grid.expected})
                  </dd>
                </div>
                <div>
                  <dt>{t("results.dataCoverage")}</dt>
                  <dd>{percent(grid.dataCoverage)}</dd>
                </div>
              </dl>
              <p className="text-sm text-fg-muted">
                {t("results.bounds")}:{" "}
                {grid.sampleBounds
                  ? `${percent(grid.sampleBounds[0])} - ${percent(grid.sampleBounds[1])}`
                  : t("results.unknown")}
                .{" "}
                {t(
                  grid.reason === "matcher_version_mixed"
                    ? "results.matcherVersionMixed"
                    : "results.comparisonHelp",
                )}
              </p>
              <MonitorResultGrid grid={grid} points={points} onPoint={setPointId} />
              <MonitorResultTable points={points} onPoint={setPointId} />
            </>
          ) : null}
          <div className="flex gap-2">
            <Button variant="outline" disabled={pending} onClick={() => void download("csv")}>
              {t("results.exportCsv")}
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => void download("json")}>
              {t("results.exportJson")}
            </Button>
          </div>
          {point ? (
            <MonitorPointEvidence
              key={`${report.runId}:${point.id}`}
              report={report}
              point={point}
              window={history?.window}
            />
          ) : null}
        </Card>
      ) : null}
      <h3 className="font-semibold">{t("results.history")}</h3>
      {history ? <MonitorHistoryWindow href={href} history={history} /> : null}
      {history ? (
        <ol className="space-y-2">
          {history.items.map((row) => (
            <li key={row.runId}>
              <Link
                className="text-accent hover:underline"
                href={localHistoryHref(href, history.asOf, history.window, row.runId)}
                aria-current={row.runId === report?.runId ? "page" : undefined}
              >
                <time dateTime={row.createdAt}>
                  {format.dateTime(new Date(row.createdAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>{" "}
                · {t("revisionNumber", { revision: format.number(row.definitionRevision) })} ·{" "}
                {t(
                  row.mode === "manual"
                    ? "modes.manual"
                    : row.mode === "scheduled"
                      ? "modes.scheduled"
                      : "modes.unknown",
                )}
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
      {history?.nextCursor ? (
        <Button variant="outline" disabled={pending} onClick={() => void more()}>
          {t("moreHistory")}
        </Button>
      ) : null}
      {error ? <p role="alert">{t("readError")}</p> : null}
    </section>
  );
}
