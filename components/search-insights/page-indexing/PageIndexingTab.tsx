"use client";

import { SearchInsightsRowsCard } from "@/components/search-insights/SearchInsightsRowsCard";
import { InlineCallout } from "@/components/ui/InlineCallout";
import type {
  IndexingData,
  IndexingUrl,
  InspectAction,
  LoadDetailAction,
  LoadUrlsAction,
} from "@/lib/search-index/ui-model";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { IndexingDrawer } from "./IndexingDrawer";
import { IndexingInspect } from "./IndexingInspect";
import { IndexingOverview } from "./IndexingOverview";
import { IndexingSitemaps } from "./IndexingSitemaps";
import { IndexingStatus } from "./IndexingStatus";
import { IndexingUrls } from "./IndexingUrls";
import { useIndexingUrls } from "./use-indexing-urls";

export function PageIndexingTab({
  data,
  projectId,
  canInspect,
  inspectAction,
  loadUrlsAction,
  loadDetailAction,
}: Readonly<{
  data: IndexingData | null;
  projectId: string;
  canInspect: boolean;
  inspectAction: InspectAction;
  loadUrlsAction: LoadUrlsAction;
  loadDetailAction: LoadDetailAction;
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
      <IndexingStatus
        data={data}
        projectId={projectId}
        canInspect={canInspect}
        onInspect={() => setInspecting(true)}
      />
      {detailError ? (
        <InlineCallout tint="yellow" role="alert">
          {t("loadFailed")}
        </InlineCallout>
      ) : null}
      <section ref={urlsRegion} aria-label={t("urls")} tabIndex={-1}>
        <IndexingUrls
          data={data}
          list={list}
          onOpen={(row: IndexingUrl, button) => open(row.url, button)}
        />
      </section>
      <IndexingSitemaps rows={data.sitemaps} snapshot={data.sitemapSnapshot} />
      <IndexingOverview
        report={data.report}
        days={data.days}
        onSelect={(filters) => {
          list.change(filters);
          urlsRegion.current?.focus({ preventScroll: true });
          urlsRegion.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
        }}
      />
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
