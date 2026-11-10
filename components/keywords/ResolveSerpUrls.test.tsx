import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ start: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/actions/serp-url-repair", () => ({
  resolveSerpUrlsAction: m.start,
  readSerpUrlRepairAction: m.read,
}));

import { ResolveSerpUrls } from "./ResolveSerpUrls";

beforeEach(() => {
  vi.resetAllMocks();
  m.start.mockResolvedValue({ workflowId: "job", status: "running" });
  m.read.mockResolvedValue({ status: "completed", result: { resolved: 3, unresolved: 0 } });
});
it("requires a click to start conversion and reloads without a paid search", async () => {
  const reload = vi.fn();
  render(
    <ResolveSerpUrls
      projectRef="prj_fixture"
      target={{ kind: "check", checkId: "check_abcdefgh" }}
      onResolved={reload}
    />,
  );
  expect(m.start).not.toHaveBeenCalled();
  expect(m.read).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Resolve URLs" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Show updated results" })).toBeEnabled(),
  );
  expect(m.start).toHaveBeenCalledExactlyOnceWith({
    projectRef: "prj_fixture",
    target: { kind: "check", checkId: "check_abcdefgh" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Show updated results" }));
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
});
it("keeps a retry available when the scheduler cannot accept the task", async () => {
  m.start.mockRejectedValue(new Error("Unavailable"));
  render(
    <ResolveSerpUrls
      projectRef="prj_fixture"
      target={{ kind: "check", checkId: "check_abcdefgh" }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Resolve URLs" }));
  await screen.findByText(/Could not resolve these links/);
  expect(screen.getByRole("button", { name: "Resolve URLs" })).toBeEnabled();
  expect(m.read).not.toHaveBeenCalled();
});
