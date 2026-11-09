"use client";

import { LocalizedMeasurementHelp } from "@/components/measurement-help/LocalizedMeasurementHelp";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useFormatter, useTranslations } from "next-intl";
import type { HistoryPage, KeywordHistoryPort } from "./history-contract";
import { validHistoryPages } from "./history-page-state";
import { KeywordHistoryLog } from "./KeywordHistoryLog";
import { RecordedHistoryChart } from "./RecordedHistoryChart";
import { RecordedUrlHistory } from "./RecordedUrlHistory";
import { RetainedSnapshotCard } from "./RetainedSnapshotCard";
import { SectionChevron, useSectionDisclosure } from "./section-disclosure";
import { useKeywordDetailHistory } from "./use-keyword-detail-history";

type Props = {
  history: KeywordHistoryPort;
  keyword: string;
  timeZone: string;
  noMatchDepths?: Readonly<Record<string, number>>;
};

export function KeywordDetailHistory(props: Readonly<Props>) {
  const initial = props.history.initial.observations;
  return (
    <HistoryWorkspace
      key={`${initial.asOf}:${initial.sourceDigest}:${initial.nextCursor ?? ""}:${JSON.stringify(initial.window)}`}
      {...props}
    />
  );
}

function HistoryWorkspace({ history, keyword, timeZone, noMatchDepths }: Readonly<Props>) {
  const t = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  const format = useFormatter();
  const { open, toggle } = useSectionDisclosure("position-history");
  const state = useKeywordDetailHistory(history);
  const { pages, busy, failure, snapshot, windowId, changeWindow, openSnapshot } = state;
  const windowDate = (value: string) =>
    Number.isFinite(Date.parse(value))
      ? format.dateTime(new Date(value), { dateStyle: "medium", timeZone })
      : t("unknownTime");
  const windowLabel = (window: HistoryPage["window"]) =>
    t("window", {
      from: windowDate(window.from),
      to: windowDate(window.to),
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
      <Card className="min-w-0 rounded-card px-4 sm:px-5" size="lg">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex min-w-0 items-center gap-2">
                <SectionTitle>{t("title")}</SectionTitle>
                <LocalizedMeasurementHelp metricId="organic_rank" definitionVersion="help-v1" />
              </div>
              <p className="m-0 mt-1 text-xs text-fg-muted">{keyword}</p>
            </div>
            <div className="flex w-full min-w-0 max-w-full items-center gap-4 sm:w-auto sm:flex-nowrap">
              <MenuSelect
                ariaLabel={t("windowControl")}
                triggerClassName="min-w-0 flex-1 sm:flex-none sm:w-[248px] max-w-full min-h-9"
                disabled={busy || forbidden}
                value={windowId}
                options={history.windows.map((option) => ({
                  value: option.id,
                  label: windowLabel(option.window),
                }))}
                onChange={(id) => void changeWindow(id)}
              />
              <SectionChevron open={open} toggle={toggle} title={t("title")} />
            </div>
          </div>
        </div>
        <div hidden={!open}>
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
            </>
          ) : null}
          {busy ? (
            <p role="status" className="m-0 mt-3 text-[11px] text-fg-muted">
              {t("reading")}
            </p>
          ) : null}
        </div>
      </Card>
      {!forbidden && validHistoryPages(pages) ? (
        <KeywordHistoryLog state={state} timeZone={timeZone} noMatchDepths={noMatchDepths} />
      ) : null}
      {!forbidden && validHistoryPages(pages) ? (
        <RecordedUrlHistory
          page={pages.observations}
          timeZone={timeZone}
          noMatchDepths={noMatchDepths}
        />
      ) : null}
      {!forbidden && snapshot ? (
        <RetainedSnapshotCard
          snapshot={snapshot}
          timeZone={timeZone}
          noMatchDepths={noMatchDepths}
        />
      ) : null}
    </div>
  );
}
