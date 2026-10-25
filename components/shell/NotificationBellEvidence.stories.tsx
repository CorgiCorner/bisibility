import { withEvidenceShellMessages } from "@/.storybook/evidence-shell-messages";
import type { NotificationFeed, NotificationFeedItem } from "@/lib/queries/notifications";
import type { Meta, StoryObj } from "@storybook/react";
import { useTimeZone, useTranslations } from "next-intl";
import { within } from "storybook/test";
import { NotificationBellClient } from "./NotificationBellClient";

const scheduled: NotificationFeedItem = {
  id: "ntf_abcdefghijklmnopqrstuvwx",
  projectId: "prj_story",
  type: "scheduled_window_summary",
  title: "",
  body: null,
  meta: "",
  href: "/app/prj_story/runs",
  readAt: null,
  createdAt: "2026-10-24T07:00:00Z",
  time: "1m",
  version: 1,
  payload: {
    windowStart: "2026-10-25T00:00:00Z",
    windowEnd: "2026-10-25T01:00:00Z",
    counts: { up: 13, down: 24, failed: 5, under_review: 3 },
    linkedIncidentIds: ["example"],
    linkTarget: { from: "2026-10-25T00:00:00Z", to: "2026-10-25T01:00:00Z", trigger: "scheduled" },
  },
};
function Bell({ state = "scheduled" }: { state?: string }) {
  const timeZone = useTimeZone();
  const t = useTranslations("shell.notifications");
  const incident: NotificationFeedItem = {
    ...scheduled,
    id: "ntf_bbcdefghijklmnopqrstuvwx",
    type: "provider_incident",
    title: t("incident.title"),
    meta: `${t("incident.resultUnderReviewCount", { count: 3 })}. ${t("incident.noRepeat")}`,
    payload: { state: "open" },
  };
  const item =
    state === "manual"
      ? { ...scheduled, type: "manual_run_summary" as const }
      : state === "incident"
        ? incident
        : state === "updated"
          ? {
              ...scheduled,
              version: 2,
              readAt: "2026-10-24T07:01:00Z",
              payload: {
                ...(scheduled.payload as object),
                counts: { down: 9999, up: 9999, failed: 9999, unchanged: 9999 },
              },
            }
          : scheduled;
  const feed: NotificationFeed = {
    items: state === "withdrawn" ? [] : [item],
    unreadCount: state === "withdrawn" || state === "updated" ? 0 : 1,
  };
  return (
    <div className="flex min-h-[720px] items-start justify-end bg-bg p-8 text-fg">
      <NotificationBellClient
        defaultOpen
        feed={feed}
        timeZone={timeZone}
        projectRef="prj_story"
        markNotificationRead={async () => ({ updated: 1 })}
        markAllNotificationsRead={async () => ({ updated: 1 })}
        refreshNotificationFeed={async (openOnly) =>
          openOnly
            ? {
                items: Array.from({ length: 14 }, (_, index) => ({
                  ...incident,
                  id: `ntf_incident_${index}`,
                })),
                unreadCount: feed.unreadCount,
              }
            : feed
        }
      />
    </div>
  );
}
const meta = {
  title: "Shell/EvidenceBell",
  component: Bell,
  decorators: [withEvidenceShellMessages],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Bell>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ScheduledWindow: Story = { args: { state: "scheduled" } };
export const ManualSummary: Story = { args: { state: "manual" } };
export const ProviderIncident: Story = { args: { state: "incident" } };
export const UpdatedRead: Story = { args: { state: "updated" } };
export const Withdrawn: Story = { args: { state: "withdrawn" } };
export const LongLocalizedLabels: Story = {
  args: { state: "updated" },
};
export const OpenIncidents: Story = {
  args: { state: "incident" },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("button", {
        name: /Open incidents|Otwarte incydenty|未解決のインシデント|Incidentes abiertos/,
      }),
    );
  },
};
