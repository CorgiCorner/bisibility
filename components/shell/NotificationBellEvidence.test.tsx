import { renderWithShellMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { NotificationFeed, NotificationFeedItem } from "@/lib/queries/notifications";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotificationBellClient } from "./NotificationBellClient";

const mocks = vi.hoisted(() => ({ feed: null as NotificationFeed | null }));
vi.mock("@/components/ui/toast-context", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/lib/realtime/useAppRealtime", () => ({
  useAppRealtime: () => ({ notifications: mocks.feed, operations: [], status: "live" }),
}));
vi.mock("@/lib/notifications/useNotificationStream", () => ({
  useNotificationStream: (feed: NotificationFeed) => ({ feed, status: "live" }),
}));
const item: NotificationFeedItem = {
  id: "ntf_abcdefghijklmnopqrstuvwx",
  type: "scheduled_window_summary",
  projectId: "prj_test",
  title: "server UTC title",
  body: null,
  meta: "server counts",
  href: "/old",
  readAt: null,
  createdAt: "2026-10-24T07:00:00Z",
  time: "now",
  version: 1,
  payload: {
    windowStart: "2026-10-24T06:00:00Z",
    windowEnd: "2026-10-24T07:00:00Z",
    counts: { down: 2, up: 1, failed: 1, under_review: 2 },
    linkedIncidentIds: ["incident"],
    linkTarget: { from: "2026-10-24T06:00:00Z", to: "2026-10-24T07:00:00Z", trigger: "scheduled" },
  },
};
const props = {
  defaultOpen: true,
  feed: { items: [item], unreadCount: 1 },
  projectRef: "prj_test",
  markNotificationRead: vi.fn(async () => ({ updated: 1 })),
  markAllNotificationsRead: vi.fn(async () => ({ updated: 1 })),
  refreshNotificationFeed: vi.fn(
    async (_openIncidents?: boolean): Promise<NotificationFeed> => ({ items: [], unreadCount: 1 }),
  ),
};
describe("UI-1 evidence bell", () => {
  it("renders the actual window in the viewer zone", () => {
    mocks.feed = null;
    render(<NotificationBellClient {...props} timeZone="Europe/Warsaw" />);
    expect(
      screen.getByRole("link", { name: /Scheduled checks: 08:00–09:00 \(Europe\/Warsaw\)/ }),
    ).toBeVisible();
  });
  it("renders scheduled counts with a summary-details primary link and separate runs and incident links", () => {
    mocks.feed = null;
    render(<NotificationBellClient {...props} />);
    expect(screen.getByRole("link", { name: /Scheduled checks/ })).toHaveAttribute(
      "href",
      "/app/prj_test/runs/summaries/ntf_abcdefghijklmnopqrstuvwx",
    );
    expect(screen.getByText(/2 down, 1 up, 1 failed, 1 linked incident/)).toBeVisible();
    expect(screen.queryByText(/under review/)).toBeNull();
    expect(screen.getByRole("link", { name: "View runs" })).toHaveAttribute(
      "href",
      "/app/prj_test/runs?view=checks&from=2026-10-24T06%3A00%3A00Z&to=2026-10-24T07%3A00%3A00Z&trigger=scheduled",
    );
    expect(screen.getByRole("link", { name: "View incident" })).toHaveAttribute(
      "href",
      "/app/prj_test/runs?view=checks&incidentId=incident",
    );
  });
  it("keeps the same DOM row, slot and minimum count height on update and never re-marks a read summary unread", () => {
    mocks.feed = { items: [{ ...item, readAt: "2026-10-24T07:01:00Z" }], unreadCount: 0 };
    const view = render(<NotificationBellClient {...props} />);
    const row = document.querySelector(`[data-notification-id="${item.id}"]`);
    const next = {
      ...item,
      version: 2,
      readAt: "2026-10-24T07:01:00Z",
      payload: { ...(item.payload as object), counts: { down: 999, up: 500, failed: 200 } },
    };
    mocks.feed = { items: [next], unreadCount: 0 };
    view.rerender(<NotificationBellClient {...props} />);
    expect(document.querySelector(`[data-notification-id="${item.id}"]`)).toBe(row);
    expect(row?.parentElement?.firstElementChild).toBe(row);
    expect(row?.querySelector('[class*="line-clamp"]')).toBeNull();
    expect(row?.querySelector(".min-h-8.tabular-nums")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeDisabled();
    expect(row?.querySelector(".bg-accent")).toHaveStyle({ visibility: "hidden" });
  });
  it("removes a withdrawn row and its unread count on realtime feed replacement", () => {
    mocks.feed = { items: [item], unreadCount: 1 };
    const view = render(<NotificationBellClient {...props} />);
    mocks.feed = {
      items: [{ ...item, version: 2, withdrawnAt: "2026-10-24T07:02:00Z" }],
      unreadCount: 1,
    };
    view.rerender(<NotificationBellClient {...props} />);
    expect(document.querySelector(`[data-notification-id="${item.id}"]`)).toBeNull();
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeDisabled();
    expect(screen.getByText("No notifications")).toBeVisible();
  });
  it("switches to the uncapped open-incident feed and back", async () => {
    mocks.feed = null;
    render(<NotificationBellClient {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Open incidents" }));
    await waitFor(() => expect(props.refreshNotificationFeed).toHaveBeenCalledWith(true));
    expect(await screen.findByRole("button", { name: "Open incidents" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("No notifications")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Open incidents" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open incidents" }));
    expect(await screen.findByRole("link", { name: /Scheduled checks/ })).toBeVisible();
  });
  it.each(["manual_run_summary", "provider_incident"] as const)(
    "renders %s read and unread",
    (type) => {
      mocks.feed = {
        items: [
          {
            ...item,
            type,
            title: type === "provider_incident" ? "Provider evidence review" : item.title,
            readAt: null,
          },
        ],
        unreadCount: 1,
      };
      const view = render(<NotificationBellClient {...props} />);
      expect(
        screen.getByRole("link", {
          name: type === "manual_run_summary" ? /Manual check summary/ : /Provider evidence review/,
        }),
      ).toBeVisible();
      expect(document.querySelector(".bg-accent")).toHaveStyle({ visibility: "visible" });
      mocks.feed = { items: [{ ...item, type, readAt: "2026-10-24T07:01:00Z" }], unreadCount: 0 };
      view.rerender(<NotificationBellClient {...props} />);
      expect(document.querySelector(".bg-accent")).toHaveStyle({ visibility: "hidden" });
    },
  );
});
