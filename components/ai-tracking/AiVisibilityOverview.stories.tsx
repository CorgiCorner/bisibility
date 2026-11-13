import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import trackingMessages from "@/messages/core/en/project-ai-tracking.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { AiVisibilityOverviewView } from "./AiVisibilityOverviewView";
import {
  emptyOverviewFixture,
  overviewBrandNames,
  overviewFixture,
  overviewHrefs,
  overviewProjectId,
} from "./overview-fixtures";

const meta = {
  title: "AI Visibility/Overview",
  component: AiVisibilityOverviewView,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={{ ...sharedMessages, ...trackingMessages }}
        timeZone="UTC"
      >
        <DateDisplayProvider>
          <Story />
        </DateDisplayProvider>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { layout: "padded" },
  args: {
    brandNames: overviewBrandNames,
    hrefs: overviewHrefs,
    model: overviewFixture(),
    onAddCompetitor: async () => undefined,
    onFilter: () => undefined,
    onPreviewNames: async () => overviewBrandNames.counts,
    onSaveNames: async () => undefined,
    onSplitAlias: async () => undefined,
    projectId: overviewProjectId,
  },
} satisfies Meta<typeof AiVisibilityOverviewView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithData: Story = {};

export const BrandedOnly: Story = {
  args: { model: overviewFixture("branded") },
};

export const Empty: Story = {
  args: { model: emptyOverviewFixture() },
};
