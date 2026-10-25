import { renderWithShellMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { NotificationBellClient } from "./NotificationBellClient";

vi.mock("@/components/ui/Popup", () => ({
  Popup: ({
    open,
    autoFocus = true,
    children,
  }: {
    open: boolean;
    autoFocus?: boolean;
    children: ReactNode;
  }) =>
    open ? (
      <div data-testid="bell-popup" data-autofocus={autoFocus}>
        {children}
      </div>
    ) : null,
}));
vi.mock("@/components/ui/toast-context", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/lib/realtime/useAppRealtime", () => ({
  useAppRealtime: () => ({ notifications: null }),
}));
const props = {
  feed: { items: [], unreadCount: 0 },
  projectRef: "prj_test",
  markNotificationRead: vi.fn(async () => ({ updated: 1 })),
  markAllNotificationsRead: vi.fn(async () => ({ updated: 1 })),
  refreshNotificationFeed: vi.fn(async () => ({ items: [], unreadCount: 0 })),
};
describe("bell focus modality", () => {
  it.each([
    ["pointer", 1, "false"],
    ["keyboard", 0, "true"],
  ] as const)("%s opening controls popup autofocus", (_mode, detail, expected) => {
    render(<NotificationBellClient {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }), { detail });
    expect(screen.getByTestId("bell-popup")).toHaveAttribute("data-autofocus", expected);
  });
  it("does not introduce keyboard focus when initially rendered open", () => {
    render(<NotificationBellClient {...props} defaultOpen />);
    expect(screen.getByTestId("bell-popup")).toHaveAttribute("data-autofocus", "false");
  });
});
