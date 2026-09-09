import type { NotificationFeed, NotificationFeedItem } from "@/lib/queries/notifications";
import { dateFromFrozenNow, isoFromFrozenNow } from "@/tests/clock";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBellClient } from "./NotificationBellClient";

const mocks = vi.hoisted(() => ({
  notifications: null as NotificationFeed | null,
  showToast: vi.fn(),
  status: "live" as "live" | "offline" | "syncing",
}));
vi.mock("@/components/ui/toast-context", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));
const preventNavigation = (event: Event) => event.preventDefault();
vi.mock("@/lib/notifications/useNotificationStream", () => ({
  useNotificationStream: (feed: NotificationFeed) => ({ feed, status: mocks.status }),
}));
vi.mock("@/lib/realtime/useAppRealtime", () => ({
  useAppRealtime: () => ({ notifications: mocks.notifications, operations: [], status: "live" }),
}));

const checkFailedItem: NotificationFeedItem = {
  body: "rank tracker: rank data provider unavailable",
  createdAt: isoFromFrozenNow({ hours: 12 }),
  href: "/app/prj_1/rank-tracker?tab=checks&run=check_abcdefghijklmnopqrstuvwx",
  id: "ntf_checkfailedabcdefghijklmnopqrs",
  meta: "rank tracker on example.com",
  payload: null,
  projectId: "prj_abcdefghijklmnopqrstuvwx",
  readAt: null,
  time: "now",
  title: "Rank check failed",
  type: "check_failed",
};

const feed: NotificationFeed = {
  items: [
    {
      body: null,
      createdAt: isoFromFrozenNow({ hours: 13 }),
      href: "/app/overview",
      id: "ntf_abcdefghijklmnopqrstuvwx",
      meta: "Project",
      payload: null,
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      readAt: null,
      time: "now",
      title: "Import complete",
      type: "import_done",
    },
    {
      body: null,
      createdAt: isoFromFrozenNow({ hours: -11 }),
      href: "/app/overview",
      id: "ntf_bbcdefghijklmnopqrstuvwx",
      meta: "System",
      payload: null,
      projectId: null,
      readAt: isoFromFrozenNow({ hours: -10 }),
      time: "1d",
      title: "Maintenance",
      type: "system",
    },
  ],
  unreadCount: 1,
};

describe("NotificationBellClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notifications = null;
    mocks.status = "live";
    document.addEventListener("click", preventNavigation);
  });

  afterEach(() => document.removeEventListener("click", preventNavigation));

  it("uses the borderless 36px header control styling and opens the notification popover", async () => {
    const markOne = vi.fn(async () => ({ updated: 1 }));
    render(
      <NotificationBellClient
        feed={feed}
        markAllNotificationsRead={vi.fn(async () => ({ updated: 1 }))}
        markNotificationRead={markOne}
        projectRef="prj_1"
        refreshNotificationFeed={vi.fn(async () => feed)}
      />,
    );
    const bell = screen.getByRole("button", { name: "Notifications" });
    expect(bell).toHaveTextContent("1");
    expect(screen.getByText("1")).toHaveClass("font-sans", "tabular-nums");
    expect(screen.getByText("1")).not.toHaveClass("font-mono");
    expect(bell).toHaveClass("h-9", "w-9", "p-0", "text-fg-muted", "transition-colors");
    expect(bell).not.toHaveClass("border", "border-border-control", "bg-bg-elev");
    fireEvent.click(bell);
    expect(bell).toHaveClass("bg-bg-sunken");
    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: /Import complete/ }));
    await waitFor(() =>
      expect(markOne).toHaveBeenCalledWith({
        notificationId: "ntf_abcdefghijklmnopqrstuvwx",
      }),
    );
  });

  it("marks all notifications read and renders offline state", async () => {
    vi.setSystemTime(dateFromFrozenNow({ hours: 14 }));
    mocks.status = "offline";
    const markAll = vi.fn(async () => ({ updated: 1 }));
    render(
      <NotificationBellClient
        defaultOpen
        feed={feed}
        markAllNotificationsRead={markAll}
        markNotificationRead={vi.fn(async () => ({ updated: 1 }))}
        projectRef="prj_1"
        refreshNotificationFeed={vi.fn(async () => feed)}
      />,
    );
    expect(screen.queryByText("Offline")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(markAll).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeDisabled();
  });

  it.each(["one", "all"] as const)(
    "restores unread state and allows retry when marking %s fails",
    async (scope) => {
      vi.setSystemTime(dateFromFrozenNow({ hours: 14 }));
      const save = vi
        .fn()
        .mockRejectedValueOnce(new Error("Server Action was not found on the server."))
        .mockResolvedValue({ updated: 1 });
      render(
        <NotificationBellClient
          defaultOpen
          feed={feed}
          markAllNotificationsRead={save}
          markNotificationRead={save}
          projectRef="prj_1"
          refreshNotificationFeed={vi.fn(async () => feed)}
        />,
      );
      const control =
        scope === "all"
          ? screen.getByRole("button", { name: "Mark all read" })
          : screen.getByRole("link", { name: /Import complete/ });
      fireEvent.click(control);
      await waitFor(() =>
        expect(mocks.showToast).toHaveBeenCalledWith(
          "Could not mark notifications as read. Please try again.",
          { severity: "error" },
        ),
      );
      expect(screen.getByRole("button", { name: "Notifications", hidden: true })).toHaveTextContent(
        "1",
      );
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Mark all read" })).toBeEnabled(),
      );
      fireEvent.click(control);
      await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Notifications", hidden: true }),
        ).not.toHaveTextContent("1"),
      );
    },
  );

  it("keeps Mark all read pending until the write finishes", async () => {
    let resolve!: (value: { updated: number }) => void;
    const save = vi.fn(
      () =>
        new Promise<{ updated: number }>((done) => {
          resolve = done;
        }),
    );
    const props = {
      defaultOpen: true,
      feed,
      markAllNotificationsRead: save,
      markNotificationRead: save,
      projectRef: "prj_1",
      refreshNotificationFeed: vi.fn(async () => feed),
    };
    const { rerender } = render(<NotificationBellClient {...props} />);
    fireEvent.click(screen.getByRole("link", { name: /Import complete/ }));
    mocks.notifications = { items: [...feed.items, checkFailedItem], unreadCount: 2 };
    rerender(<NotificationBellClient {...props} />);
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeDisabled();
    resolve({ updated: 1 });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Mark all read" })).toBeEnabled(),
    );
  });

  it("uses the app-wide realtime notification feed for stream transport", () => {
    mocks.notifications = { items: [], unreadCount: 3 };

    render(
      <NotificationBellClient
        feed={feed}
        markAllNotificationsRead={vi.fn(async () => ({ updated: 0 }))}
        markNotificationRead={vi.fn(async () => ({ updated: 0 }))}
        projectRef="prj_1"
        refreshNotificationFeed={vi.fn(async () => feed)}
      />,
    );

    expect(screen.getByRole("button", { name: "Notifications" })).toHaveTextContent("3");
  });

  it("renders a check_failed row with the reason body and a checks href targeting the run", async () => {
    render(
      <NotificationBellClient
        defaultOpen
        feed={{ items: [checkFailedItem], unreadCount: 1 }}
        markAllNotificationsRead={vi.fn(async () => ({ updated: 0 }))}
        markNotificationRead={vi.fn(async () => ({ updated: 1 }))}
        projectRef="prj_1"
        refreshNotificationFeed={vi.fn(async () => ({ items: [checkFailedItem], unreadCount: 1 }))}
      />,
    );

    const row = screen.getByRole("link", { name: /Rank check failed/ });
    expect(row).toHaveAttribute(
      "href",
      "/app/prj_1/rank-tracker?tab=checks&run=check_abcdefghijklmnopqrstuvwx",
    );
    const detail = screen.getByText("rank tracker: rank data provider unavailable");
    expect(detail).toHaveClass("font-sans");
    expect(detail).not.toHaveClass("font-mono");
    expect(screen.getByText("now")).toHaveClass("font-sans", "tabular-nums");
    expect(screen.getByText("now")).not.toHaveClass("font-mono");
    expect(screen.queryByText("rank tracker on example.com")).not.toBeInTheDocument();
  });

  it("renders an empty syncing feed without an audit-log footer", () => {
    mocks.status = "syncing";
    render(
      <NotificationBellClient
        defaultOpen
        feed={{ items: [], unreadCount: 0 }}
        markAllNotificationsRead={vi.fn(async () => ({ updated: 0 }))}
        markNotificationRead={vi.fn(async () => ({ updated: 0 }))}
        projectRef="prj_1"
        refreshNotificationFeed={vi.fn(async () => ({ items: [], unreadCount: 0 }))}
      />,
    );
    expect(screen.queryByText("Syncing")).not.toBeInTheDocument();
    expect(screen.getByText("No notifications")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: /View audit log/ })).not.toBeInTheDocument();
  });
});
