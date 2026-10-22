"use client";

import { LocalizedMeasurementHelp } from "@/components/measurement-help/LocalizedMeasurementHelp";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useFormatter, useTranslations } from "next-intl";
import { AttemptHistoryTable } from "./AttemptHistoryTable";
import { HistoryTime } from "./HistoryTime";
import type { HistoryPage, KeywordHistoryPort } from "./history-contract";
import { validHistoryPages } from "./history-page-state";
import { ObservationHistoryTable } from "./ObservationHistoryTable";
import { RecordedHistoryChart } from "./RecordedHistoryChart";
import { RecordedUrlHistory } from "./RecordedUrlHistory";
import { RetainedSnapshotCard } from "./RetainedSnapshotCard";
import { useKeywordDetailHistory } from "./use-keyword-detail-history";

type Props = { history: KeywordHistoryPort; keyword: string; timeZone: string };

export function KeywordDetailHistory(props: Readonly<Props>) {
  const initial = props.history.initial.observations;
  return (
    <HistoryWorkspace
      key={`${initial.asOf}:${initial.sourceDigest}:${initial.nextCursor ?? ""}:${JSON.stringify(initial.window)}`}
      {...props}
    />
  );
}

function HistoryWorkspace({ history, keyword, timeZone }: Readonly<Props>) {
  const t = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  const format = useFormatter();
  const {
    pages,
    page,
    stream,
    setStream,
    busy,
    failure,
    snapshot,
    windowId,
    loadMore,
    changeWindow,
    openSnapshot,
  } = useKeywordDetailHistory(history);
  const windowDate = (value: string) =>
    Number.isFinite(Date.parse(value))
      ? format.dateTime(new Date(value), { dateStyle: "medium", timeZone })
      : t("unknownTime");
  const windowLabel = (window: HistoryPage["window"]) =>
    t("window", {
      from: windowDate(window.from),
      to: windowDate(window.to),
      basis: t(`basis.${window.basis}`),
    });
  const forbidden = failure === "forbidden";
  if (forbidden)
    return (
      <Card className="min-w-0 rounded-card" size="lg">
        <p role="alert" className="m-0 text-xs text-fg-muted">
          {t("failure.forbidden")}
        </p>
      </Card>
    );
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <Card className="min-w-0 rounded-card" size="lg">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <SectionTitle>{t("title")}</SectionTitle>
              <p className="m-0 mt-2 text-xs text-fg-muted">{keyword}</p>
            </div>
            <div className="flex min-w-0 max-w-full items-center gap-2">
              <MenuSelect
                ariaLabel={t("windowControl")}
                triggerClassName="min-w-0 max-w-full flex-1"
                disabled={busy || forbidden}
                value={windowId}
                options={history.windows.map((option) => ({
                  value: option.id,
                  label: windowLabel(option.window),
                }))}
                onChange={(id) => void changeWindow(id)}
              />
              <LocalizedMeasurementHelp metricId="organic_rank" definitionVersion="help-v1" />
            </div>
          </div>
          {!forbidden ? (
            <p className="m-0 mt-4 border-t border-border pt-3 text-[11px] text-fg-muted">
              {t("snapshotAsOf")} <HistoryTime value={page.asOf} timeZone={timeZone} />
            </p>
          ) : null}
        </div>
        {failure ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p role="alert" className="m-0 text-xs text-red-text">
              {t(`failure.${failure}`)}
            </p>
            {windowId ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void changeWindow(windowId)}
              >
                {t("reloadHistory")}
              </Button>
            ) : null}
          </div>
        ) : null}
        {!forbidden && validHistoryPages(pages) ? (
          <>
            <RecordedHistoryChart
              page={pages.observations}
              onOpen={(id) => void openSnapshot(id)}
              timeZone={timeZone}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border py-3">
              <SegmentedControl
                ariaLabel={t("streamControl")}
                disabled={busy}
                fitContent
                size="xs"
                value={stream}
                onChange={setStream}
                options={[
                  { value: "observations", label: t("observations") },
                  { value: "attempts", label: t("attempts") },
                ]}
              />
              <span className="text-[11px] text-fg-muted">{windowLabel(page.window)}</span>
            </div>
            {stream === "observations" ? (
              <ObservationHistoryTable
                page={pages.observations}
                onOpen={(id) => void openSnapshot(id)}
                timeZone={timeZone}
              />
            ) : (
              <AttemptHistoryTable page={pages.attempts} timeZone={timeZone} />
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-fg-muted">
              <span>
                {t("loadedCount", {
                  loaded: format.number(page.records.length),
                  total: format.number(page.totalCount),
                })}
              </span>
              {page.nextCursor ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void loadMore()}
                >
                  {t("loadMore")}
                </Button>
              ) : null}
            </div>
            {page.excludedUnknownTime > 0 ? (
              <p className="m-0 mt-2 text-[11px] text-fg-muted">
                {t("excludedUnknownTime", { count: format.number(page.excludedUnknownTime) })}
              </p>
            ) : null}
          </>
        ) : null}
        {busy ? (
          <p role="status" className="m-0 mt-3 text-[11px] text-fg-muted">
            {t("reading")}
          </p>
        ) : null}
      </Card>
      {!forbidden && validHistoryPages(pages) ? (
        <RecordedUrlHistory page={pages.observations} timeZone={timeZone} />
      ) : null}
      {!forbidden && snapshot ? (
        <RetainedSnapshotCard snapshot={snapshot} timeZone={timeZone} />
      ) : null}
    </div>
  );
}
