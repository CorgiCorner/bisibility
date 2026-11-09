"use client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useFormatter, useTranslations } from "next-intl";
import { AttemptHistoryTable } from "./AttemptHistoryTable";
import { ObservationHistoryTable } from "./ObservationHistoryTable";
import { SectionChevron, useSectionDisclosure } from "./section-disclosure";
import type { useKeywordDetailHistory } from "./use-keyword-detail-history";
export function KeywordHistoryLog({
  state,
  timeZone,
  noMatchDepths,
}: {
  state: ReturnType<typeof useKeywordDetailHistory>;
  timeZone: string;
  noMatchDepths?: Readonly<Record<string, number>>;
}) {
  const t = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  const format = useFormatter();
  const { pages, page, stream, setStream, busy, loadMore, openSnapshot } = state;
  const { open, toggle } = useSectionDisclosure(`check-history:${stream}`);
  return (
    <Card className="min-w-0 rounded-card px-4 sm:px-5" size="lg">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <SectionTitle>{t("checksTitle")}</SectionTitle>
          <p className="m-0 mt-1 text-xs text-fg-muted">{t("checksDescription")}</p>
        </div>
        <div className="flex w-full min-w-0 items-center justify-between gap-4 sm:w-auto">
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
          <SectionChevron open={open} toggle={toggle} title={t("checksTitle")} />
        </div>
      </div>
      <div hidden={!open} className="mt-4">
        {stream === "observations" ? (
          <ObservationHistoryTable
            page={pages.observations}
            noMatchDepths={noMatchDepths}
            onOpen={(id) => void openSnapshot(id)}
            timeZone={timeZone}
          />
        ) : (
          <AttemptHistoryTable page={pages.attempts} timeZone={timeZone} />
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-fg-muted">
          <span>
            {t("loadedCount", {
              loaded: format.number(page.records.length),
              total: format.number(page.totalCount),
            })}
          </span>
          {page.nextCursor ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void loadMore()}>
              {t("loadMore")}
            </Button>
          ) : null}
        </div>
        {page.excludedUnknownTime > 0 ? (
          <p className="m-0 mt-2 text-xs text-fg-muted">
            {t("excludedUnknownTime", { count: format.number(page.excludedUnknownTime) })}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
