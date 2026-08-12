import { NotificationBellClient } from "@/lib/notifications/NotificationBellClient";
import type { NotificationFeed } from "@/lib/queries/notifications";
import { appPath } from "@/lib/routing/app-path";
import type { Meta, StoryObj } from "@storybook/react";

const previewFeed = {
  unreadCount: 2,
  items: [
    {
      body: "Ranking moved from #11 to #8 for the tracked target URL.",
      createdAt: "2026-06-30T08:30:00.000Z",
      href: appPath("prj_story", "rank-tracker", "kw_rank"),
      id: "notif_rank",
      meta: "Google · US · Desktop",
      payload: null,
      projectId: "project_preview",
      readAt: null,
      time: "12 min ago",
      title: "Keyword entered top 10",
      type: "check_complete",
    },
    {
      body: "The connected provider rejected the latest scheduled check.",
      createdAt: "2026-06-30T07:30:00.000Z",
      href: appPath("prj_story", "integrations"),
      id: "notif_provider",
      meta: "DataForSEO",
      payload: null,
      projectId: "project_preview",
      readAt: null,
      time: "1h ago",
      title: "Provider check failed",
      type: "check_failed",
    },
    {
      body: "Anna joined the project.",
      createdAt: "2026-06-29T16:30:00.000Z",
      href: appPath("prj_story", "settings", "team"),
      id: "notif_team",
      meta: "Team",
      payload: null,
      projectId: "project_preview",
      readAt: "2026-06-29T17:00:00.000Z",
      time: "Yesterday",
      title: "New teammate joined",
      type: "member_joined",
    },
  ],
} satisfies NotificationFeed;

function BellStory() {
  return (
    <div className="flex min-h-[300px] justify-end bg-bg p-8 text-fg">
      <NotificationBellClient
        feed={previewFeed}
        markAllNotificationsRead={async () => ({ updated: previewFeed.unreadCount })}
        markNotificationRead={async () => ({ updated: 1 })}
        projectRef="prj_story"
        refreshNotificationFeed={async () => previewFeed}
      />
    </div>
  );
}

const meta = {
  title: "Shell/NotificationBell",
  component: BellStory,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof BellStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <BellStory />,
};
