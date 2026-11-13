import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import trackingMessages from "@/messages/core/en/project-ai-tracking.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { AiVisibilitySourcesView } from "./AiVisibilitySourcesView";
import {
  sourcesDataFixture,
  sourcesEmptyFixture,
  sourcesPlanFixture,
  sourcesProjectId,
} from "./sources-fixtures";

const meta = {
  title: "AI Visibility/Sources",
  component: AiVisibilitySourcesView,
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
    error: null,
    model: sourcesDataFixture(),
    onAdd: () => undefined,
    onClearType: () => undefined,
    onFilter: () => undefined,
    onRemove: () => undefined,
    onSetType: () => undefined,
    onUpdatePlan: () => undefined,
    pending: false,
    projectId: sourcesProjectId,
  },
} satisfies Meta<typeof AiVisibilitySourcesView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithData: Story = {};

export const Empty: Story = {
  args: { model: sourcesEmptyFixture() },
};

export const PlanWithItems: Story = {
  args: { model: sourcesPlanFixture() },
};
