import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import type { ProjectPageTagView } from "@/lib/pages/tag-view";
import pagesMessages from "@/messages/core/en/project-pages.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";
import { PagesByTagPanel } from "./PagesByTagPanel";

const messages = mergeMessageCatalogs(sharedMessages, pagesMessages);

const view: ProjectPageTagView = {
  keywordOnly: [{ id: "tag_blog", keywordCount: 2, name: "Blog" }],
  options: [
    { id: "tag_docs", keywordCount: 4, name: "Docs" },
    { id: "tag_blog", keywordCount: 2, name: "Blog" },
  ],
  rows: [
    {
      existingPages: 10,
      keywords: 4,
      name: "Docs",
      newPages: 5,
      pages: 12,
      removedPages: 2,
      rule: {
        autoJoin: true,
        excludePatterns: [],
        kind: "path_pattern",
        pattern: "/docs/{slug}",
        sitemapUrl: null,
        tagTargetingKeywords: false,
        urls: [],
      },
      tagId: "tag_docs",
    },
  ],
  sitemaps: ["https://example.com/sitemap.xml"],
  tagCount: 1,
};

const meta = {
  component: PagesByTagPanel,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
        <div className="bg-bg p-4 text-fg">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Pages/By tag",
} satisfies Meta<typeof PagesByTagPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TagsOnPages: Story = {
  args: {
    canCreate: true,
    canDelete: true,
    canWrite: true,
    onAddToPages: fn(),
    onEdit: fn(),
    onNew: fn(),
    onOpen: fn(),
    onRemove: fn(async () => undefined),
    projectId: "prj_story",
    view,
  },
};

export const WithSnapshot: Story = {
  args: {
    ...TagsOnPages.args,
    snapshot: {
      id: "snapshot_story",
      label: "Day 1",
      pageCount: 12,
      signalPublicId: null,
      source: "sitemap",
      takenOn: "2026-10-01",
    },
  },
};
