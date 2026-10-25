"use client";

import { AppDrawer } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
import type { IndexingUrl } from "@/lib/search-index/ui-model";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { IndexingHistoryStrip } from "./IndexingHistoryStrip";
import { IndexingHistoryLine, IndexingRichResults } from "./IndexingStoredFacts";
import { IndexingPath } from "./IndexingTable";
import { useInspectionLabel } from "./inspection-label";
import { useViewerTimeZone } from "./use-viewer-time-zone";

function Fact({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="grid gap-1 py-1.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
      <dt className="text-ui-caption text-fg-muted">{label}</dt>
      <dd className="m-0 min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">
        {children ?? "-"}
      </dd>
    </div>
  );
}
function Paths({ values }: Readonly<{ values: string[] }>) {
  return values.length ? (
    <ul className="m-0 list-none p-0">
      {values.map((value) => (
        <li key={value}>
          <IndexingPath value={value} />
        </li>
      ))}
    </ul>
  ) : (
    "-"
  );
}

export function IndexingDrawer({
  detail,
  onClose,
  onExited,
}: Readonly<{ detail: IndexingUrl; onClose: () => void; onExited?: () => void }>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const format = useFormatter();
  const label = useInspectionLabel();
  const timeZone = useViewerTimeZone();
  const date = (value: Date | null) =>
    value
      ? format.dateTime(new Date(value), { timeZone, dateStyle: "medium", timeStyle: "short" })
      : "-";
  const facts = [
    [
      t("inspectionStatus"),
      detail.inspectionError
        ? t("inspectionFailedAt", { date: date(detail.inspectionFailedAt) })
        : t("inspectionSucceeded"),
    ],
    [t("source"), t(detail.source === "manual" ? "sourceManual" : "sourceTracked")],
    [
      t("verdict"),
      detail.inspectionError
        ? t("verdictInspectionFailed")
        : detail.checkedAt
          ? t(detail.verdict === "PASS" ? "urlOnGoogle" : "urlNotOnGoogle")
          : t("groups.not_checked"),
    ],
    [t("coverageState"), detail.coverageState],
    [t("checkedAt"), date(detail.checkedAt)],
    [t("lastCrawl"), date(detail.lastCrawlAt)],
    [t("crawledAs"), label("crawledAs", detail.crawledAs)],
    [t("pageFetch"), label("pageFetchState", detail.pageFetchState)],
    [t("robots"), label("robotsTxtState", detail.robotsTxtState)],
    [t("indexingState"), label("indexingState", detail.indexingState)],
    [t("userCanonical"), detail.userCanonical],
    [t("googleCanonical"), detail.googleCanonical],
  ];
  return (
    <AppDrawer
      open
      autoFocusClose
      sheetOnMobile
      onClose={onClose}
      onExited={onExited}
      title={<IndexingPath value={detail.url} />}
      description={t("storedDescription")}
      footer={
        detail.inspectionResultLink ? (
          <Button
            href={detail.inspectionResultLink}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            variant="secondary"
          >
            {t("openConsole")}
          </Button>
        ) : undefined
      }
    >
      <IndexingHistoryStrip detail={detail} />
      <dl className="m-0 mt-4 divide-y divide-border">
        {facts.map(([label, value]) => (
          <Fact key={label} label={label ?? "-"}>
            {value || "-"}
          </Fact>
        ))}
        <Fact label={t("sitemaps")}>
          <Paths values={detail.sitemaps} />
        </Fact>
        <Fact label={t("referringPages")}>
          <Paths values={detail.referringUrls} />
        </Fact>
        <Fact label={t("richResults")}>
          <IndexingRichResults value={detail.richResultsSummary} />
        </Fact>
      </dl>
      <section className="mt-3">
        <h3 className="text-ui-caption font-semibold">{t("history")}</h3>
        {!detail.history?.changes.length ? (
          <p className="text-ui-caption text-fg-muted">{t("noHistory")}</p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {detail.history.changes.map((change, index) => (
              <li key={`${index}:${change.at}`} className="text-ui-caption">
                <IndexingHistoryLine change={change} timeZone={timeZone} />
              </li>
            ))}
          </ol>
        )}
        {detail.history && !detail.history.complete ? <p>{t("historyPartial")}</p> : null}
      </section>
    </AppDrawer>
  );
}
