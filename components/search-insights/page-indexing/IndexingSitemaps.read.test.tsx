import "./virtual-table-test-setup";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/project-search-insights.json";
import shared from "@/messages/core/en/shared.json";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { IndexingSitemaps } from "./IndexingSitemaps";

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@/components/ui/toast-context", () => ({ useToast: () => ({ showToast }) }));

const snapshot = { readAt: null, rows: [], lastError: null, lastErrorAt: null };
function view(onRead: () => Promise<{ status: "ok" | "rate_limited" | "error" }>) {
  return render(
    <FeatureMessagesProvider locale="en" timeZone="UTC" messages={{ ...shared, ...messages }}>
      <IndexingSitemaps snapshot={snapshot} onRead={onRead} />
    </FeatureMessagesProvider>,
  );
}
it("offers an explicit read without waiting for the background schedule", async () => {
  const read = vi.fn(async () => ({ status: "ok" as const }));
  view(read);
  fireEvent.click(screen.getByRole("button", { name: "Read sitemaps" }));
  await waitFor(() => expect(read).toHaveBeenCalledOnce());
  await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledOnce());
});
it.each(["rate_limited", "error"] as const)("shows safe feedback for %s", async (status) => {
  view(async () => ({ status }));
  fireEvent.click(screen.getByRole("button", { name: "Read sitemaps" }));
  await waitFor(() =>
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining(
        status === "rate_limited" ? "Wait a minute" : "Could not read sitemaps",
      ),
      { severity: status === "rate_limited" ? "info" : "error" },
    ),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("does not send a second request while the read is pending", async () => {
  let finish: ((value: { status: "ok" }) => void) | undefined;
  const read = vi.fn(
    () =>
      new Promise<{ status: "ok" }>((resolve) => {
        finish = resolve;
      }),
  );
  view(read);
  fireEvent.click(screen.getByRole("button", { name: "Read sitemaps" }));
  await waitFor(() => expect(screen.getByRole("button", { name: /Read sitemaps/ })).toBeDisabled());
  finish?.({ status: "ok" });
  await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledOnce());
});
