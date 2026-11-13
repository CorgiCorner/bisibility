import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageIndexingTab } from "@/components/search-insights/page-indexing/PageIndexingTab";
import { SearchConsoleSitemapsTab } from "@/components/search-insights/page-indexing/SearchConsoleSitemapsTab";
import { SearchConsoleTabs } from "@/components/search-insights/page-indexing/SearchConsoleTabs";
import { SearchInsightsBodyLoading } from "@/components/search-insights/SearchInsightsLoadingSkeletons";
import { PageContent } from "@/components/shell/PageContent";
import {
  exportNotIndexedUrls,
  inspectPageIndexingUrls,
  loadPageIndexingDetail,
  loadPageIndexingUrls,
  readPageIndexingSitemaps,
} from "@/lib/actions/page-indexing";
import { searchConsolePath } from "@/lib/routing/app-path";
import {
  type SearchConsoleTabId,
  searchConsolePreservedQuery,
  searchConsoleTab,
} from "@/lib/search-index/ui-model";
import { loadNotIndexedCount, loadPageIndexing } from "@/lib/search-index/ui-queries";
import { type ComponentProps, type ReactNode, Suspense } from "react";

type SearchConsoleQuery = Record<string, string | string[] | undefined>;
type FeatureMessagesProps = ComponentProps<typeof FeatureMessagesProvider>;

export async function SearchConsoleNavigation({
  projectId,
  query,
}: Readonly<{ projectId: string; query: SearchConsoleQuery }>) {
  const count = await loadNotIndexedCount(projectId);
  return (
    <SearchConsoleTabs
      active={searchConsoleTab(query.tab)}
      base={searchConsolePath(projectId)}
      query={searchConsolePreservedQuery(query)}
      notIndexed={count}
    />
  );
}

export function PageIndexingView({
  loadingLabel,
  messages,
  navigation,
  projectId,
  runtime,
  tab,
}: Readonly<{
  loadingLabel: string;
  messages: FeatureMessagesProps["messages"];
  navigation: ReactNode;
  projectId: string;
  runtime: { locale: FeatureMessagesProps["locale"]; timeZone: FeatureMessagesProps["timeZone"] };
  tab: Exclude<SearchConsoleTabId, "performance">;
}>) {
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent className="flex flex-col gap-4" variant="analytics">
        {navigation}
        <Suspense fallback={<SearchInsightsBodyLoading ariaLabel={loadingLabel} />}>
          {tab === "sitemaps" ? (
            <SitemapsSection projectId={projectId} />
          ) : (
            <PageIndexingSection projectId={projectId} />
          )}
        </Suspense>
      </PageContent>
    </FeatureMessagesProvider>
  );
}

async function PageIndexingSection({ projectId }: Readonly<{ projectId: string }>) {
  const { data, canInspect } = await loadPageIndexing(projectId);
  return (
    <PageIndexingTab
      data={data}
      canInspect={canInspect}
      projectId={projectId}
      inspectAction={inspectPageIndexingUrls}
      loadDetailAction={loadPageIndexingDetail}
      loadUrlsAction={loadPageIndexingUrls}
      exportAction={exportNotIndexedUrls}
    />
  );
}

async function SitemapsSection({ projectId }: Readonly<{ projectId: string }>) {
  const { data } = await loadPageIndexing(projectId);
  return (
    <SearchConsoleSitemapsTab
      data={data}
      projectId={projectId}
      readSitemapsAction={readPageIndexingSitemaps}
    />
  );
}
