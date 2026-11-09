import { renderWithInstanceAdminMessages } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { OssPreview } from "./OssPreview";

it("routes preview operations through supplied callbacks", async () => {
  const sweep = vi.fn(() => ({ status: "completed" as const, attempted: 3, delivered: 2 }));
  renderWithInstanceAdminMessages(
    <OssPreview
      initialTab="Operations"
      initialView="Notifications"
      actions={{ onRefresh: vi.fn(), onSendTest: vi.fn(), onRunSweep: sweep }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Run outbox sweep" }));
  expect(sweep).toHaveBeenCalledOnce();
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Outbox sweep completed: 2 of 3 delivered.",
    ),
  );
});
