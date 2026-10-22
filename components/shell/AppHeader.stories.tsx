import { HeaderProviderSpend } from "@/components/cost-estimate/HeaderProviderSpend";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { MarketsPageContent } from "@/components/markets/page/MarketsPageContent";
import { ProjectRunsContent } from "@/components/project-runs/ProjectRunsContent";
import { NotificationBellClient } from "@/components/shell/NotificationBellClient";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { DEFAULT_TIME_ZONE } from "@/i18n/formats";
import { budgetFixture, headerFixture } from "@/lib/metering/shared-view-fixtures";
import type { NotificationFeed } from "@/lib/queries/notifications";
import type { OperationSnapshot } from "@/lib/rank-check/runs/contract";
import { AppRealtimeContext, type AppRealtimeValue } from "@/lib/realtime/useAppRealtime";
import type { ProjectRunsApiResponse } from "@/lib/runs/project-runs-api";
import projectCostEstimateMessages from "@/messages/core/en/project-cost-estimate.json";
import projectMarketsMessages from "@/messages/core/en/project-markets.json";
import projectRunsMessages from "@/messages/core/en/project-runs.json";
import sharedMessages from "@/messages/core/en/shared.json";
import shellMessages from "@/messages/core/en/shell.json";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { AppHeaderFrame } from "./AppHeaderFrame";

const notificationFeed = { items: [], unreadCount: 0 } satisfies NotificationFeed;

const rankCheck = {
  blockedReason: null,
  costCents: 0,
  counts: {
    cancelled: 0,
    completed: 126,
    deferred: 0,
    failed: 2,
    requested: 700,
    skipped: 0,
    total: 700,
  },
  estimatedCostCents: 0,
  finishedAt: null,
  id: "rcr_story",
  keywordCount: 350,
  kind: "rank_check",
  outcome: null,
  parentRunId: null,
  nextCheckAt: null,
  plannedFor: null,
  provider: "serpapi",
  providerLabel: "SerpApi",
  selectionKind: "filter",
  startedAt: "2026-09-03T12:00:00.000Z",
  status: "running",
  targetCount: 700,
  trigger: "manual",
} satisfies OperationSnapshot;

type HeaderStoryProps = {
  content?: ReactNode;
  operations?: OperationSnapshot[];
  spend: "capped" | "mixed" | "unavailable" | "without-cap";
  status?: AppRealtimeValue["status"];
  theme?: "dark" | "light";
  trayOpen?: boolean;
};

function HeaderStory({
  content,
  operations = [],
  spend,
  status = "live",
  theme = "light",
  trayOpen = false,
}: Readonly<HeaderStoryProps>) {
  return (
    <AppRealtimeContext.Provider value={{ notifications: null, operations, status }}>
      <div className="min-h-24 bg-bg text-fg" data-theme={theme}>
        <AppHeaderFrame
          actions={
            <HeaderProviderSpend
              projectRef="prj_story"
              summary={
                spend === "unavailable"
                  ? null
                  : spend === "mixed"
                    ? headerFixture([
                        budgetFixture("10", "requests"),
                        {
                          ...budgetFixture(),
                          id: "unavailable",
                          level: "unavailable",
                          used: "unavailable",
                        },
                      ])
                    : headerFixture(spend === "without-cap" ? [] : undefined)
              }
            />
          }
          activeProjectId="prj_story"
          canCreateWorkspace={false}
          notificationControl={
            <NotificationBellClient
              feed={notificationFeed}
              markAllNotificationsRead={async () => ({ updated: 0 })}
              markNotificationRead={async () => ({ updated: 0 })}
              projectRef="prj_story"
              refreshNotificationFeed={async () => notificationFeed}
            />
          }
          operationsTrayDefaultOpen={trayOpen}
          projectRef="prj_story"
          workspaces={[]}
        />
        {content ? <div className="min-w-0 p-6">{content}</div> : null}
      </div>
    </AppRealtimeContext.Provider>
  );
}

// The workspace layout loads these catalogs; without them the header cannot render.
const headerMessages = mergeMessageCatalogs(
  sharedMessages,
  shellMessages,
  projectCostEstimateMessages,
  projectRunsMessages,
  projectMarketsMessages,
);

const meta = {
  title: "Components/AppHeader",
  component: HeaderStory,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale={DEFAULT_LOCALE}
        messages={headerMessages}
        timeZone={DEFAULT_TIME_ZONE}
      >
        <Story />
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof HeaderStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { spend: "capped" },
  name: "default",
};

export const ShowlivepillTrue: Story = {
  args: { spend: "capped" },
  name: "showlivepill-true",
};

export const SpendhascapFalse: Story = {
  args: { spend: "without-cap" },
  name: "spendhascap-false",
};

export const SpendunavailableTrue: Story = {
  args: { spend: "unavailable" },
  name: "spendunavailable-true",
};

export const ThemeDark: Story = {
  args: { spend: "capped", theme: "dark" },
  name: "theme-dark",
};

export const TrayOpen: Story = {
  args: { operations: [rankCheck], spend: "capped", trayOpen: true },
  name: "tray-open",
};

const importRun: ProjectRunsApiResponse["runs"][number] = {
  attention: null,
  cost: { actualCents: null, estimatedCents: null, state: "unknown" as const },
  capabilities: { cancel: false, pause: true, resume: false, retry: false, viewDetails: true },
  details: {
    pausedReason: null,
    property: "sc-domain:example.com",
    source: "gsc",
    state: "running",
  },
  href: "/app/prj_story/search-console",
  id: "import_story",
  kind: "gsc",
  lifecycle: "running",
  progress: { completed: 56, total: 488, unit: "days" },
  project: { name: "Example", publicId: "prj_story" },
  scope: { description: "sc-domain:example.com", kind: "gsc" },
  timestamps: {
    startedAt: "2026-09-06T09:10:00.000Z",
    finishedAt: null,
    plannedFor: null,
    createdAt: "2026-09-06T09:00:00.000Z",
    lastProbeAt: null,
    lastSyncFinishedAt: null,
    lastSyncStartedAt: "2026-09-06T09:10:00.000Z",
    syncStartedAt: "2026-09-06T09:10:00.000Z",
  },
  title: { kind: "gsc" },
};
const noop = async () => undefined;

export const RunsPage: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/app/prj_story/runs" } } },
  args: {
    spend: "unavailable",
    content: (
      <ProjectRunsContent
        canMutate
        operations={[]}
        page={{
          counts: { aiTracking: 0, rankChecks: 0, searchConsole: 1, total: 1 },
          nextCursor: null,
          runs: [importRun],
        }}
        projectRef="prj_story"
        query={{ cursor: null, limit: 20, source: "all", status: "all", view: "runs" }}
        runNowAction={noop}
        skipAction={noop}
      />
    ),
  },
};

export const MarketsPage: Story = {
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: "/app/prj_story/markets" } },
  },
  args: {
    spend: "unavailable",
    content: (
      <MarketsPageContent
        addKeywordsAction={async () => ({ created: 0, keywords: [] })}
        archivedMarkets={{ markets: [], projectId: "prj_story" }}
        canAddKeywords
        canArchive
        canEdit
        canRestore
        markets={{
          markets: [
            {
              activeKeywordCount: 2,
              canonicalKey: "ES@es",
              countryCode: "ES",
              currentVisibility: 50,
              displayName: "Malaga",
              futureKeywordDevices: ["desktop", "mobile"],
              id: "pmkt_abcdefghijklmnopqrstuvwx",
              keywordCount: 2,
              languageCode: "es",
              languageLabel: "Spanish",
              locationId: "location_malaga",
              monthlyCostCents: 515,
              name: "Malaga",
              researchAvailable: true,
              status: "active",
              topThreeCount: 1,
            },
          ],
          maxMarkets: 5,
          monthlyCostCents: 515,
          perMarketChecks: 2,
          projectId: "prj_story",
        }}
        onArchive={noop}
        onRestore={noop}
        onSave={noop}
        onStatusChange={async () => ({ status: "active" })}
      />
    ),
  },
};

export const MixedBudgets: Story = { args: { spend: "mixed" } };
