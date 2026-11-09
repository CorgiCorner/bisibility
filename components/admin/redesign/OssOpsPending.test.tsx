import { renderWithInstanceAdminMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { OssOpsActions } from "./OssOpsActions";

it.each([
  ["Send test notification", "Sending..."],
  ["Run outbox sweep", "Running..."],
])("indicates which operation is pending", (action, pending) => {
  render(
    <OssOpsActions
      onSendTest={() => new Promise(() => {})}
      onRunSweep={() => new Promise(() => {})}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: action }));
  expect(screen.getByRole("button", { name: pending })).toBeDisabled();
});
