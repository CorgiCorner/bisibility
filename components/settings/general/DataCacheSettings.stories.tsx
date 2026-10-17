import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import general from "@/messages/core/en/project-settings-general.json";
import shared from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { DataCacheSettings } from "./DataCacheSettings";

const meta = {
  title: "Settings/Data cache",
  component: DataCacheSettings,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        timeZone="UTC"
        messages={mergeMessageCatalogs(general, shared)}
      >
        <div className="min-h-screen bg-bg p-4 text-fg">
          <div className="max-w-[640px]">
            <Story />
          </div>
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { nextjs: { appDirectory: true }, layout: "fullscreen" },
} satisfies Meta<typeof DataCacheSettings>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CachedResults: Story = {
  args: {
    projectId: "prj_story",
    canEdit: true,
    initial: {
      ttlSeconds: 43200,
      page: {
        available: true,
        cursor: "0",
        entries: [
          {
            token: "synthetic-related",
            keyword: "rank tracker",
            module: "keyword_research",
            provider: "DataForSEO",
            source: "related",
            country: "Poland",
            language: "pl",
            expiresAt: "2030-10-16T20:00:00.000Z",
          },
          {
            token: "synthetic-ideas",
            keyword: "example.com",
            module: "domain_overview",
            provider: "DataForSEO",
            source: "overview",
            country: "Poland",
            language: "pl",
            expiresAt: "2030-10-16T20:00:00.000Z",
          },
        ],
      },
    },
  },
};
export const Viewer: Story = { args: { ...CachedResults.args, canEdit: false } };
export const Unavailable: Story = {
  args: {
    ...CachedResults.args,
    initial: { ttlSeconds: null, page: { available: false, cursor: "0", entries: [] } },
  },
};
