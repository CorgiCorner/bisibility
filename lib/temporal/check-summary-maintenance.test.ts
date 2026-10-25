import { expect, it, vi } from "vitest";
import { ensureCheckNotificationSummariesSchedule } from "./check-summary-maintenance-bootstrap";

it("unconditionally owns the fixed five-minute summary sweep", async () => {
  const client = { create: vi.fn() };
  await ensureCheckNotificationSummariesSchedule(client);
  expect(client.create).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      scheduleId: "check-notification-summaries",
      spec: { intervals: [{ every: "5 minutes" }] },
      action: expect.objectContaining({ workflowType: "checkNotificationSummariesWorkflow" }),
    }),
  );
});
