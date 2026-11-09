import { renderWithInstanceAdminMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { OssOpsActions } from "./OssOpsActions";

it("reports distinct notification and sweep results", async () => {
  const sweep = vi.fn(() => ({ status: "completed" as const, attempted: 3, delivered: 2 }));
  render(<OssOpsActions onSendTest={() => ({ status: "delivered" })} onRunSweep={sweep} />);
  fireEvent.click(screen.getByRole("button", { name: "Run outbox sweep" }));
  expect(await screen.findByRole("status")).toHaveTextContent("2 of 3 delivered");
  expect(sweep).toHaveBeenCalledOnce();
}, 30000);

it("disables both operations when notifications are not configured", () => {
  const send = vi.fn();
  const sweep = vi.fn();
  render(<OssOpsActions slackConfigured={false} onSendTest={send} onRunSweep={sweep} />);
  expect(screen.getByRole("button", { name: "Send test notification" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Run outbox sweep" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Slack operator notifications are not configured",
  );
  expect(send).not.toHaveBeenCalled();
  expect(sweep).not.toHaveBeenCalled();
});
