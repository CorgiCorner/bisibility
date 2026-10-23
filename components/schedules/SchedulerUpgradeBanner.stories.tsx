import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { ThemeRoot } from "@/components/ui/ThemeRoot";
import messages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { SchedulerUpgradeBanner } from "./SchedulerUpgradeBanner";

const meta = {
  title: "Schedules/Upgrade notice",
  component: SchedulerUpgradeBanner,
  args: {
    projectId: "prj_example",
    issues: [
      { keywordId: "kw_one", keywordText: "seo tools" },
      { keywordId: "kw_two", keywordText: "rank tracker" },
      { keywordId: "kw_three", keywordText: "backlink checker" },
    ],
  },
  decorators: [
    (Story) => (
      <ThemeRoot>
        <FeatureMessagesProvider locale="en" timeZone="UTC" messages={messages}>
          <Story />
        </FeatureMessagesProvider>
      </ThemeRoot>
    ),
  ],
} satisfies Meta<typeof SchedulerUpgradeBanner>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NeedsReview: Story = {};
export const NoIssues: Story = { args: { issues: [] } };
