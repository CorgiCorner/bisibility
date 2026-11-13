"use client";

import { SearchInsightsRowsCard } from "@/components/search-insights/SearchInsightsRowsCard";
import { Disclosure } from "@/components/ui/Disclosure";
import { InlineCallout } from "@/components/ui/InlineCallout";
import type {
  ExportNotIndexedAction,
  IndexingData,
  IndexingUrl,
  InspectAction,
  LoadDetailAction,
  LoadUrlsAction,
} from "@/lib/search-index/ui-model";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { IndexingDrawer } from "./IndexingDrawer";
import { IndexingDrops } from "./IndexingDrops";
import { IndexingGroupTiles } from "./IndexingGroupTiles";
import { IndexingInspect } from "./IndexingInspect";
import { IndexingProgressCard } from "./IndexingProgressCard";
import { IndexingReasonList } from "./IndexingReasonList";
import { IndexingStatus } from "./IndexingStatus";
import { IndexingTrend } from "./IndexingTrend";
import { IndexingUrls } from "./IndexingUrls";
import { useIndexingUrls } from "./use-indexing-urls";

export function PageIndexingTab({
  data,
  projectId,
  canInspect,
  inspectAction,
  loadUrlsAction,
  loadDetailAction,
  exportAction,
}: Readonly<{
  data: IndexingData | null;
  projectId: string;
  canInspect: boolean;
  inspectAction: InspectAction;
  loadUrlsAction: LoadUrlsAction;
  loadDetailAction: LoadDetailAction;
  exportAction?: ExportNotIndexedAction;
}>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const list = useIndexingUrls(data, projectId, loadUrlsAction);
  const [detail, setDetail] = useState<IndexingUrl | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const urlsRegion = useRef<HTMLElement>(null);
  const trigger = useRef<string | null>(null);
  const pendingDetail = useRef<string | null>(null);
  const request = useRef(0);
  if (!data)
    return (
      <SearchInsightsRowsCard
        title={t("title")}
        caption={t("storedDescription")}
        empty
        emptyReason={t("noConnection")}
      />
    );
  const open = async (url: string, button: HTMLElement) => {
    const current = ++request.current;
    trigger.current = button.id;
    setDetailError(false);
    setLoadingDetail(true);
    try {
      const result = await loadDetailAction({ projectId, url });
      if (request.current !== current) return;
      setDetail(result);
      setDetailError(!result);
    } catch {
      if (request.current === current) setDetailError(true);
    } finally {
      if (request.current === current) setLoadingDetail(false);
    }
  };
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-busy={loadingDetail}>
      <p className="m-0 text-ui-body text-fg">{t("lead")}</p>
      <IndexingProgressCard data={data} projectId={projectId} />
      <IndexingGroupTiles data={data} projectId={projectId} />
      <IndexingReasonList data={data} exportAction={exportAction} projectId={projectId} />
      <IndexingDrops data={data} projectId={projectId} />
      <Disclosure
        headingLevel="h2"
        title={t("allUrls")}
        titleClassName="text-ui-body-relaxed font-semibold leading-snug"
        variant="panel"
        contentClassName="px-0 pb-0 sm:px-0"
        summaryClassName="px-4 py-4 sm:px-4"
      >
        <div className="flex min-w-0 flex-col divide-y divide-border" data-indexing-all-urls="">
          <IndexingStatus
            canInspect={canInspect}
            data={data}
            onInspect={() => setInspecting(true)}
            projectId={projectId}
          />
          {detailError ? (
            <InlineCallout role="alert" tint="yellow">
              {t("loadFailed")}
            </InlineCallout>
          ) : null}
          <section aria-label={t("urls")} ref={urlsRegion} tabIndex={-1}>
            <IndexingUrls
              data={data}
              list={list}
              onOpen={(row: IndexingUrl, button) => open(row.url, button)}
            />
          </section>
          <IndexingTrend complete={data.report.complete} days={data.days} embedded />
        </div>
      </Disclosure>
      {detail ? (
        <IndexingDrawer
          onExited={() => {
            if (trigger.current) document.getElementById(trigger.current)?.focus();
          }}
          detail={detail}
          onClose={() => {
            setDetail(null);
          }}
        />
      ) : null}
      {inspecting ? (
        <IndexingInspect
          projectId={projectId}
          sitemaps={data.sitemaps}
          loadUrlsAction={loadUrlsAction}
          inspectAction={inspectAction}
          onSubmitted={list.refresh}
          onStoredResult={(url) => {
            pendingDetail.current = url;
            setInspecting(false);
          }}
          onExited={() => {
            const url = pendingDetail.current;
            pendingDetail.current = null;
            const button = document.getElementById("indexing-inspect-trigger");
            if (url && button) void open(url, button);
          }}
          onClose={() => setInspecting(false)}
        />
      ) : null}
    </section>
  );
}
