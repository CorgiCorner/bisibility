import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ExportModal } from "./ExportModal";

const mocks = vi.hoisted(() => ({ exportKeywords: vi.fn(), downloadBlob: vi.fn() }));
vi.mock("@/lib/actions/keyword-export-action", () => ({ exportKeywords: mocks.exportKeywords }));
vi.mock("@/lib/ui/download", () => ({ downloadBlob: mocks.downloadBlob }));
beforeEach(() => {
  vi.clearAllMocks();
});
function open() {
  render(
    <ExportModal
      open
      onClose={vi.fn()}
      projectId="prj_abcdefghijklmnopqrstuvwx"
      target={{ count: 1, selection: { mode: "all" } }}
    />,
  );
}
function refuseExport() {
  mocks.exportKeywords.mockRejectedValueOnce(new Error("synthetic rejection"));
}
async function select(label: string, option: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
  fireEvent.click(await screen.findByRole("menuitem", { name: option }));
}

it("keeps default download legacy and never invokes the action while changing choices", async () => {
  open();
  expect(mocks.exportKeywords).not.toHaveBeenCalled();
  refuseExport();
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  await waitFor(() =>
    expect(mocks.exportKeywords).toHaveBeenCalledWith(
      expect.objectContaining({
        historyVersion: 1,
        scope: "current",
        granularity: "daily",
        stream: "observations",
      }),
    ),
  );
});

it("explicitly exports V2 attempts, preserves failed draft, and restores legacy weekly choice", async () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: /Ranking history/ }));
  await select("Export granularity", "Weekly");
  await select("History format", "Evidence report (v2)");
  await select("Report records", "Check attempts");
  expect(screen.queryByRole("button", { name: "Export granularity" })).not.toBeInTheDocument();
  expect(mocks.exportKeywords).not.toHaveBeenCalled();
  refuseExport();
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  await waitFor(() =>
    expect(mocks.exportKeywords).toHaveBeenCalledWith(
      expect.objectContaining({
        historyVersion: 2,
        scope: "history",
        stream: "attempts",
        granularity: "daily",
        format: "csv",
      }),
    ),
  );
  expect(await screen.findByRole("button", { name: "History format" })).toHaveTextContent(
    "Evidence report (v2)",
  );
  expect(screen.getByRole("button", { name: "Report records" })).toHaveTextContent(
    "Check attempts",
  );
  await select("History format", "Legacy history (v1)");
  expect(screen.getByRole("button", { name: "Export granularity" })).toHaveTextContent("Weekly");
  refuseExport();
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  await waitFor(() =>
    expect(mocks.exportKeywords).toHaveBeenLastCalledWith(
      expect.objectContaining({
        historyVersion: 1,
        stream: "observations",
        granularity: "weekly",
      }),
    ),
  );
});

it("opens history choice by keyboard and returns focus after Escape without executing", async () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: /Ranking history/ }));
  const trigger = screen.getByRole("button", { name: "History format" });
  trigger.focus();
  const user = userEvent.setup();
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("menuitem", { name: "Evidence report (v2)" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(mocks.exportKeywords).not.toHaveBeenCalled();
});
