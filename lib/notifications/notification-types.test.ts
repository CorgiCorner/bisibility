import { NotificationType } from "@/lib/generated/prisma/client";
import { describe, expect, it } from "vitest";
import { notificationTypePresentation } from "./notification-types";

describe("notification type presentation", () => {
  it("covers every stored type, including the three that nothing emits yet", () => {
    const presented = Object.values(NotificationType).map((type) => ({
      type,
      ...notificationTypePresentation(type),
    }));
    expect(presented).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "provider_incident", label: "Provider incident" }),
        expect.objectContaining({ type: "manual_run_summary", label: "Manual check" }),
        expect.objectContaining({ type: "scheduled_window_summary", label: "Scheduled checks" }),
      ]),
    );
    expect(new Set(presented.map((item) => item.type))).toEqual(
      new Set(Object.values(NotificationType)),
    );
  });
});
