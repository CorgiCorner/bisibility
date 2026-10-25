import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageIndexingTab } from "@/components/search-insights/page-indexing/PageIndexingTab";
import { SearchConsoleTabs } from "@/components/search-insights/page-indexing/SearchConsoleTabs";
import { SearchInsightsBodyLoading } from "@/components/search-insights/SearchInsightsLoadingSkeletons";
import { PageContent } from "@/components/shell/PageContent";
import {
  inspectPageIndexingUrls,
  loadPageIndexingDetail,
  loadPageIndexingUrls,
} from "@/lib/actions/page-indexing";
import { searchConsolePath } from "@/lib/routing/app-path";
import { searchConsolePreservedQuery, searchConsoleTab } from "@/lib/search-index/ui-model";
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
}: Readonly<{
  loadingLabel: string;
  messages: FeatureMessagesProps["messages"];
  navigation: ReactNode;
  projectId: string;
  runtime: { locale: FeatureMessagesProps["locale"]; timeZone: FeatureMessagesProps["timeZone"] };
}>) {
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent variant="analytics">
        {navigation}
        <Suspense fallback={<SearchInsightsBodyLoading ariaLabel={loadingLabel} />}>
          <PageIndexingSection projectId={projectId} />
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
    />
  );
}
