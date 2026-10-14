import { AdminAnnouncements } from "@/components/admin/AdminAnnouncements";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { InstanceAnnouncementBanner } from "@/components/shell/InstanceAnnouncementBanner";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import instanceAdminMessages from "@/messages/core/en/instance-admin.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";

const messages = mergeMessageCatalogs(sharedMessages, instanceAdminMessages);
const announcement = {
  id: "168337b6-c5e8-4787-a422-07ca4f693f32",
  revision: "868ff1da-17ec-4f41-9e80-09dfb19e2bc5",
  title: "Service issue",
  message:
    "We are investigating delays in rank checks. Your data is safe. We will post updates on our status page.",
  href: "https://status.example.com",
  linkLabel: "Check status",
  enabled: true,
};
const meta = {
  title: "Admin/Announcements",
  component: AdminAnnouncements,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
        <Story />
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { layout: "padded" },
} satisfies Meta<typeof AdminAnnouncements>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PreparedMessages: Story = {
  args: {
    initialAnnouncements: [
      announcement,
      {
        ...announcement,
        id: "bc54c5e6-d74e-465d-8eb0-967438cc3ad0",
        enabled: false,
        title: "Scheduled maintenance",
        message: "The app will be unavailable for a short maintenance window on Sunday.",
        href: "",
        linkLabel: "",
      },
    ],
  },
};
export const Empty: Story = { args: { initialAnnouncements: [] } };
export const WorkspaceBanners: Story = {
  args: { initialAnnouncements: [] },
  parameters: { layout: "fullscreen", themeControls: false },
  render: () => (
    <div className="bg-bg">
      <InstanceAnnouncementBanner announcement={announcement} defaultLinkLabel="Learn more" />
      <InstanceAnnouncementBanner
        announcement={{
          ...announcement,
          title: "Update",
          message: "More details will follow.",
          href: "",
        }}
        defaultLinkLabel="Learn more"
      />
    </div>
  ),
};
