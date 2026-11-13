import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { emptyProjectPageTagView } from "@/lib/pages/tag-view";
import pagesMessages from "@/messages/core/en/project-pages.json";
import searchMessages from "@/messages/core/en/project-search-insights.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";
import { ProjectPagesScreen } from "./ProjectPagesScreen";
import {
  connectedSources,
  pageRow,
  pagesList,
  pagesQuery,
  sitemapOnlySources,
} from "./project-pages-fixtures";

const messages = mergeMessageCatalogs(sharedMessages, pagesMessages, searchMessages);

const meta = {
  component: ProjectPagesScreen,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
        <DateDisplayProvider>
          <div className="min-w-0 bg-bg p-4 text-fg">
            <Story />
          </div>
        </DateDisplayProvider>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Pages/All pages",
} satisfies Meta<typeof ProjectPagesScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

const storySnapshot = {
  id: "snapshot_story",
  label: "Day 1",
  pageCount: 3,
  signalPublicId: null,
  source: "sitemap" as const,
  takenOn: "2026-10-01",
};

const actions = {
  addManual: fn(async () => ({ added: 1, existing: 0, rejected: [] })),
  checkVitals: fn(async () => ({ checked: 1, ok: true as const })),
  load: fn(async () => pagesList([pageRow()])),
  loadCompare: fn(async () => ({
    annotationId: null,
    annotations: [],
    changedTagId: null,
    empty: "no_tags" as const,
    metrics: [],
    result: null,
    selectedMetric: null,
    tags: [],
    unchangedTagId: null,
  })),
  loadComparison: fn(async () => ({
    markers: [],
    metrics: [
      { disabledReason: null, id: "clicks" as const, provider: null },
      { disabledReason: "not_connected" as const, id: "sessions" as const, provider: null },
      { disabledReason: null, id: "ai_cites" as const, provider: null },
    ],
    points: [
      { day: "2026-10-01", existing: 8, fresh: 0, removed: 0 },
      { day: "2026-10-04", existing: 8, fresh: 3, removed: 0 },
    ],
    selected: "clicks" as const,
    sessionsNote: null,
    summary: {
      existingPages: 1,
      existingValue: 8,
      freshPages: 1,
      freshValue: 3,
      removedPages: 1,
      removedValue: 0,
      snapshotPages: 3,
    },
    tags: [],
    window: { from: "2026-10-01", to: "2026-10-04" },
  })),
  loadTags: fn(async () => emptyProjectPageTagView),
  previewRule: fn(async () => ({ sample: ["/docs"], total: 1, truncated: false })),
  refresh: fn(async () => ({
    omitted: 0,
    pages: 1,
    projectId: "prj_story",
    sources: 1,
    status: "ok" as const,
    truncated: false,
  })),
  removeFromPages: fn(async () => ({ pages: 0 })),
  saveRule: fn(async () => ({ tagId: "tag_story" })),
  setManual: fn(async () => ({ added: 1, removed: 0 })),
  takeSnapshot: fn(async () => ({
    replaced: false,
    snapshot: storySnapshot,
    status: "taken" as const,
  })),
};

const permissions = { canCreateTags: true, canDeleteTags: true, canEditTags: true };

export const AllSourcesConnected: Story = {
  args: {
    actions,
    ...permissions,
    canWrite: true,
    initialList: pagesList([pageRow()]),
    initialQuery: pagesQuery,
    projectId: "prj_story",
    sources: connectedSources(),
  },
};

export const SitemapOnly: Story = {
  args: {
    actions,
    ...permissions,
    canWrite: true,
    initialList: pagesList([
      pageRow({ aiCitations: 0, keywords: 0, searchConsole: null, sessions: null }),
    ]),
    initialQuery: pagesQuery,
    projectId: "prj_story",
    sources: sitemapOnlySources(),
  },
};

export const WithSnapshot: Story = {
  args: {
    actions,
    ...permissions,
    canWrite: true,
    initialList: pagesList([
      pageRow({ status: { day: null, kind: "in_snapshot" } }),
      pageRow({
        pageId: "page_new",
        path: "/docs/new",
        status: { day: 4, kind: "new" },
        url: "https://example.com/docs/new",
      }),
      pageRow({
        pageId: "page_gone",
        path: "/old",
        sitemap: { lastSeenAt: new Date("2026-10-02T00:00:00.000Z"), listed: false },
        status: { day: 2, kind: "removed" },
        url: "https://example.com/old",
      }),
    ]),
    initialQuery: pagesQuery,
    initialSnapshot: storySnapshot,
    projectId: "prj_story",
    sources: connectedSources(),
  },
};

export const EmptyRegistry: Story = {
  args: {
    actions: { ...actions, load: fn(async () => pagesList([])) },
    ...permissions,
    canWrite: true,
    initialList: pagesList([]),
    initialQuery: pagesQuery,
    projectId: "prj_story",
    sources: sitemapOnlySources(),
  },
};
