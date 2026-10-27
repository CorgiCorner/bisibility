import { withSharedMessages } from "@/i18n/test-support/shared-messages-story-decorator";
import type { Meta, StoryObj } from "@storybook/react";
import { InlineNoticeBanner } from "./InlineNoticeBanner";

const meta = {
  title: "UI/InlineNoticeBanner",
  component: InlineNoticeBanner,
  decorators: [withSharedMessages],
} satisfies Meta<typeof InlineNoticeBanner>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WithLink: Story = {
  args: {
    children: "Scheduled maintenance begins tonight.",
    fullText: "Scheduled maintenance begins tonight.",
    link: { href: "https://example.com", label: "Details" },
  },
};
