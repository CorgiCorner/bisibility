import type { NotificationFeed } from "@/lib/queries/notifications";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBellClient } from "./NotificationBellClient";

const mocks = vi.hoisted(() => ({ status: "live" as "live" | "offline" | "syncing" }));
const preventNavigation = (event: Event) => event.preventDefault();
vi.mock("./useNotificationStream", () => ({
  useNotificationStream: (feed: NotificationFeed) => ({ feed, status: mocks.status }),
}));

const feed: NotificationFeed = {
  items: [
    {
      body: null,
      createdAt: "2026-07-11T12:00:00.000Z",
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
      createdAt: "2026-07-10T12:00:00.000Z",
      href: "/app/overview",
      id: "ntf_bbcdefghijklmnopqrstuvwx",
      meta: "System",
      payload: null,
      projectId: null,
      readAt: "2026-07-10T13:00:00.000Z",
      time: "1d",
      title: "Maintenance",
      type: "system",
    },
  ],
  unreadCount: 1,
};

describe("NotificationBellClient", () => {
  beforeEach(() => {
    mocks.status = "live";
    document.addEventListener("click", preventNavigation);
  });

  afterEach(() => document.removeEventListener("click", preventNavigation));

  it("opens, marks one notification read, and closes after navigation", async () => {
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
    expect(screen.getByRole("button", { name: "Notifications" })).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("Live")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: /Import complete/ }));
    await waitFor(() =>
      expect(markOne).toHaveBeenCalledWith({
        notificationId: "ntf_abcdefghijklmnopqrstuvwx",
      }),
    );
  });

  it("marks all notifications read and renders offline state", async () => {
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
    expect(screen.getByText("Offline")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(markAll).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeDisabled();
  });

  it("renders an empty syncing feed and closes from the activity link", () => {
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
    expect(screen.getByText("Syncing")).toBeInTheDocument();
    expect(screen.getByText("No notifications")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeDisabled();
    fireEvent.click(screen.getByRole("link", { name: /View audit log/ }));
  });
});
