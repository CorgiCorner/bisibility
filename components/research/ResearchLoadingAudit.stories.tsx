import { AiResearchPageLoading } from "@/components/ai-research/AiResearchPageLoading";
import * as AiStories from "@/components/ai-research/AiResearchWorkspace.stories";
import { BacklinksPageLoading } from "@/components/backlinks/BacklinksLoadingSkeletons";
import * as BacklinksStories from "@/components/backlinks/BacklinksWorkspace.stories";
import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { DomainOverviewCacheProvider } from "@/components/domain-overview/DomainOverviewCacheProvider";
import { DomainOverviewPageLoading } from "@/components/domain-overview/DomainOverviewLoadingSkeletons";
import * as DomainStories from "@/components/domain-overview/DomainOverviewWorkspace.stories";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import * as SearchBodyStories from "@/components/search-insights/SearchInsightsBody.stories";
import { SearchInsightsPageLoading } from "@/components/search-insights/SearchInsightsLoadingSkeletons";
import * as SearchTrustStories from "@/components/search-insights/SearchInsightsTrustStrip.stories";
import * as SearchStories from "@/components/search-insights/SearchInsightsWorkspace.stories";
import { PageContent } from "@/components/shell/PageContent";
import { SiteAuditPageLoading } from "@/components/site-audit/SiteAuditLoading";
import * as SiteStories from "@/components/site-audit/SiteAuditWorkspace.stories";
import { ToastProvider } from "@/components/ui/Toast";
import {
  backlinksFeatureTestMessages,
  domainOverviewFeatureTestMessages,
  researchFeatureTestMessages,
  searchInsightsFeatureTestMessages,
} from "@/i18n/test-support/feature-test-messages";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import auditMessages from "@/messages/core/en/project-site-audit.json";
import { composeStory, type Meta, type StoryObj } from "@storybook/react";
import { ResearchPageLoading } from "./ResearchLoadingSkeletons";
import * as KeywordStories from "./ResearchWorkspace.stories";

const Keyword = composeStory(KeywordStories.Idle, { ...KeywordStories.default, decorators: [] });
const Domain = composeStory(DomainStories.Idle, { ...DomainStories.default, decorators: [] });
const Backlinks = composeStory(BacklinksStories.Idle, {
  ...BacklinksStories.default,
  decorators: [],
});
const Prompt = composeStory(
  { ...AiStories.Empty, args: { ...AiStories.Empty.args, mode: "prompt" } },
  { ...AiStories.default, decorators: [] },
);
const Site = composeStory(SiteStories.Empty, { ...SiteStories.default, decorators: [] });
const SearchTrust = composeStory(SearchTrustStories.First28Ready, {
  ...SearchTrustStories.default,
  decorators: [],
});
const Search = composeStory(SearchStories.Connected, { ...SearchStories.default, decorators: [] });
const SearchBody = composeStory(SearchBodyStories.FirstView, {
  ...SearchBodyStories.default,
  decorators: [],
});
const messages = {
  ...researchFeatureTestMessages,
  ...domainOverviewFeatureTestMessages,
  ...backlinksFeatureTestMessages,
  ...searchInsightsFeatureTestMessages,
  ...aiMessages,
  ...auditMessages,
};
type Route = "keyword" | "domain" | "backlinks" | "prompt" | "audit" | "search";
function ResearchLoadingAudit({
  route,
  phase,
}: Readonly<{ route: Route; phase: "ready" | "loading" }>) {
  const loading = phase === "loading";
  return (
    <FeatureMessagesProvider locale="en" timeZone="UTC" messages={messages}>
      <DateDisplayProvider>
        <SessionSpendProvider>
          <DomainOverviewCacheProvider ttlSeconds={43200}>
            <ToastProvider>
              <div
                className="min-h-screen bg-bg p-4 text-fg sm:p-6"
                data-loading-audit={phase}
                data-audit-route={route}
              >
                {route === "keyword" ? (
                  loading ? (
                    <ResearchPageLoading />
                  ) : (
                    <PageContent>
                      <Keyword />
                    </PageContent>
                  )
                ) : null}
                {route === "domain" ? (
                  loading ? (
                    <DomainOverviewPageLoading ariaLabel="Domain Overview loading" />
                  ) : (
                    <PageContent>
                      <Domain />
                    </PageContent>
                  )
                ) : null}
                {route === "backlinks" ? (
                  loading ? (
                    <BacklinksPageLoading />
                  ) : (
                    <PageContent>
                      <Backlinks />
                    </PageContent>
                  )
                ) : null}
                {route === "prompt" ? (
                  loading ? (
                    <AiResearchPageLoading />
                  ) : (
                    <PageContent variant="section">
                      <Prompt />
                    </PageContent>
                  )
                ) : null}
                {route === "audit" ? (
                  loading ? (
                    <SiteAuditPageLoading />
                  ) : (
                    <PageContent>
                      <Site />
                    </PageContent>
                  )
                ) : null}
                {route === "search" ? (
                  loading ? (
                    <SearchInsightsPageLoading
                      pageAriaLabel="Search Console loading"
                      bodyAriaLabel="Search Console data loading"
                    />
                  ) : (
                    <PageContent>
                      <Search trustStrip={<SearchTrust />}>
                        <SearchBody />
                      </Search>
                    </PageContent>
                  )
                ) : null}
              </div>
            </ToastProvider>
          </DomainOverviewCacheProvider>
        </SessionSpendProvider>
      </DateDisplayProvider>
    </FeatureMessagesProvider>
  );
}
const meta = {
  component: ResearchLoadingAudit,
  title: "Loading audit/Research",
  parameters: { layout: "fullscreen", themeControls: false, nextjs: { appDirectory: true } },
} satisfies Meta<typeof ResearchLoadingAudit>;
export default meta;
type Story = StoryObj<typeof meta>;
export const KeywordReady: Story = { args: { route: "keyword", phase: "ready" } };
export const KeywordLoading: Story = { args: { route: "keyword", phase: "loading" } };
export const DomainReady: Story = { args: { route: "domain", phase: "ready" } };
export const DomainLoading: Story = { args: { route: "domain", phase: "loading" } };
export const BacklinksReady: Story = { args: { route: "backlinks", phase: "ready" } };
export const BacklinksLoading: Story = { args: { route: "backlinks", phase: "loading" } };
export const PromptReady: Story = { args: { route: "prompt", phase: "ready" } };
export const PromptLoading: Story = { args: { route: "prompt", phase: "loading" } };
export const AuditReady: Story = { args: { route: "audit", phase: "ready" } };
export const AuditLoading: Story = { args: { route: "audit", phase: "loading" } };
export const SearchReady: Story = { args: { route: "search", phase: "ready" } };
export const SearchLoading: Story = { args: { route: "search", phase: "loading" } };
