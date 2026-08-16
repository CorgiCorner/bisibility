import {
  NotificationsLoading,
  NotificationsRouteLoading,
} from "@/components/settings/notifications/NotificationsLoading";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("NotificationsLoading", () => {
  it("keeps the settled card order while notification data loads", () => {
    const { container } = render(<NotificationsLoading />);

    expect(
      [...container.querySelectorAll("[data-notification-loading-frame]")].map((frame) =>
        frame.getAttribute("data-notification-loading-frame"),
      ),
    ).toEqual(["channels", "delivery"]);
  });

  it("uses the notifications route boundary", () => {
    const { container } = render(<NotificationsRouteLoading />);

    expect(
      container.querySelector('[data-settings-loading-boundary="notifications"]'),
    ).toBeInTheDocument();
  });
});
