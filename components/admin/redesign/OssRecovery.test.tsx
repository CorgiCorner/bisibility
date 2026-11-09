import { renderWithInstanceAdminMessages } from "@/i18n/test-support/render-with-feature-messages";
import { recoveryViewFixture } from "@/lib/metering/recovery/view-fixture";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { OssRecovery } from "./OssRecovery";

it("requires an eligible selection before preview and passes the selected case", () => {
  const onPreview = vi.fn();
  renderWithInstanceAdminMessages(
    <OssRecovery
      page={recoveryViewFixture()}
      onRefresh={vi.fn()}
      onPage={vi.fn()}
      onFilterChange={vi.fn()}
      onRetryCommand={vi.fn()}
      onSaveTriage={vi.fn()}
      onPreview={onPreview}
      onConfirm={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Review selected (0)" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "Select prj_example_pending, dataforseo" }));
  fireEvent.click(screen.getByRole("button", { name: "Review selected (1)" }));
  expect(onPreview).toHaveBeenCalledWith(["case-result"]);
  expect(screen.getByRole("button", { name: "Confirm recovery" })).toBeDisabled();
}, 30000);

it("does not confirm an expired preview or bypass two-factor protection", () => {
  const confirm = vi.fn();
  const preview = {
    token: "sample",
    expiresAt: "2026-11-01T10:00:00Z",
    eligible: [{ caseToken: "case-result", action: "restore_result" as const }],
    excluded: [],
    newPaidAttempts: 0 as const,
    providerCalls: 0 as const,
    originalRuns: 0,
  };
  const props = {
    page: recoveryViewFixture(),
    initialDialogOpen: true,
    preview,
    now: Date.parse("2026-11-02T00:00:00Z"),
    onRefresh: vi.fn(),
    onPage: vi.fn(),
    onFilterChange: vi.fn(),
    onRetryCommand: vi.fn(),
    onSaveTriage: vi.fn(),
    onPreview: vi.fn(),
    onConfirm: confirm,
  };
  const view = renderWithInstanceAdminMessages(<OssRecovery {...props} />);
  expect(screen.getByText(/Preview expired/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirm recovery" })).toBeDisabled();
  view.rerender(
    <OssRecovery {...props} now={Date.parse("2026-10-30T00:00:00Z")} twoFactorEnabled={false} />,
  );
  expect(
    screen.getByText(/Enable two-factor authentication to start recovery/),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirm recovery" })).toBeDisabled();
  expect(confirm).not.toHaveBeenCalled();
}, 30000);

it("keeps case details open so a failed triage save remains visible", () => {
  const page = recoveryViewFixture();
  const save = vi.fn();
  renderWithInstanceAdminMessages(
    <OssRecovery
      page={page}
      initialDetail={page.rows[0]}
      triageError="Save failed. Try again."
      onRefresh={vi.fn()}
      onPage={vi.fn()}
      onFilterChange={vi.fn()}
      onRetryCommand={vi.fn()}
      onSaveTriage={save}
      onPreview={vi.fn()}
      onConfirm={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save triage" }));
  expect(save).toHaveBeenCalledOnce();
  expect(screen.getByRole("alert")).toHaveTextContent("Save failed. Try again.");
}, 30000);

it("keeps the batch preview open when confirmation fails and closes after success", async () => {
  const confirm = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const preview = {
    token: "sample",
    expiresAt: "2026-11-03T10:00:00Z",
    eligible: [{ caseToken: "case-result", action: "restore_result" as const }],
    excluded: [],
    newPaidAttempts: 0 as const,
    providerCalls: 0 as const,
    originalRuns: 0,
  };
  renderWithInstanceAdminMessages(
    <OssRecovery
      page={recoveryViewFixture()}
      initialDialogOpen
      preview={preview}
      now={Date.parse("2026-11-01T00:00:00Z")}
      onRefresh={vi.fn()}
      onPage={vi.fn()}
      onFilterChange={vi.fn()}
      onRetryCommand={vi.fn()}
      onSaveTriage={vi.fn()}
      onPreview={vi.fn()}
      onConfirm={confirm}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm recovery" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Recovery could not be started");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Confirm recovery" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  renderWithInstanceAdminMessages(
    <OssRecovery
      page={recoveryViewFixture()}
      initialDialogOpen
      preview={preview}
      now={Date.parse("2026-11-01T00:00:00Z")}
      onRefresh={vi.fn()}
      onPage={vi.fn()}
      onFilterChange={vi.fn()}
      onRetryCommand={vi.fn()}
      onSaveTriage={vi.fn()}
      onPreview={vi.fn()}
      onConfirm={vi.fn().mockRejectedValue(new Error("Sample failure"))}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm recovery" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Recovery could not be started");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
}, 30000);

it("explains authority for a new paid run and worker rechecks before confirmation", () => {
  const page = recoveryViewFixture();
  renderWithInstanceAdminMessages(
    <OssRecovery
      page={page}
      initialDetail={page.rows[0]}
      initialDialogOpen
      preview={{
        token: "sample",
        expiresAt: "2026-11-03T10:00:00Z",
        eligible: [{ caseToken: "case-result", action: "restore_result" }],
        excluded: [],
        newPaidAttempts: 0,
        providerCalls: 0,
        originalRuns: 0,
      }}
      now={Date.parse("2026-11-01T00:00:00Z")}
      onRefresh={vi.fn()}
      onPage={vi.fn()}
      onFilterChange={vi.fn()}
      onRetryCommand={vi.fn()}
      onSaveTriage={vi.fn()}
      onPreview={vi.fn()}
      onConfirm={vi.fn()}
    />,
  );
  expect(screen.getByText(/ask a project member to create a new run/)).toBeInTheDocument();
  expect(
    screen.getByText(/Each case and administrator permission will be checked again/),
  ).toBeInTheDocument();
}, 30000);

it("sends filter changes to the host for the full backlog", () => {
  const onFilterChange = vi.fn();
  const onPage = vi.fn();
  renderWithInstanceAdminMessages(
    <OssRecovery
      page={{ ...recoveryViewFixture(), nextCursor: "next" }}
      onFilterChange={onFilterChange}
      onRefresh={vi.fn()}
      onPage={onPage}
      onRetryCommand={vi.fn()}
      onSaveTriage={vi.fn()}
      onPreview={vi.fn()}
      onConfirm={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Category" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "unfinished" }));
  expect(onFilterChange).toHaveBeenCalledWith({ category: "unfinished", provider: "all" });
  fireEvent.click(screen.getByRole("button", { name: "Provider" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "dataforseo" }));
  expect(onFilterChange).toHaveBeenLastCalledWith({
    category: "unfinished",
    provider: "dataforseo",
  });
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(onPage).toHaveBeenCalledWith("next", { category: "unfinished", provider: "dataforseo" });
});

it("keeps closed unknown cases read only and preserves an existing deadline", () => {
  const page = recoveryViewFixture();
  const closed = { ...page.rows[0], closedUnknown: true };
  const save = vi.fn();
  const props = {
    page,
    onRefresh: vi.fn(),
    onPage: vi.fn(),
    onFilterChange: vi.fn(),
    onRetryCommand: vi.fn(),
    onSaveTriage: save,
    onPreview: vi.fn(),
    onConfirm: vi.fn(),
  };
  const view = renderWithInstanceAdminMessages(<OssRecovery {...props} initialDetail={closed} />);
  expect(screen.queryByRole("button", { name: "Save triage" })).not.toBeInTheDocument();
  view.unmount();
  const due = "2026-12-01T12:00:00Z";
  const waiting = {
    ...page.rows[0],
    triage: { ...page.rows[0].triage, status: "waiting_evidence" as const, snoozedUntil: due },
  };
  renderWithInstanceAdminMessages(<OssRecovery {...props} initialDetail={waiting} />);
  expect(screen.getByRole("button", { name: "Due time" })).toHaveTextContent(due);
  fireEvent.click(screen.getByRole("button", { name: "Save triage" }));
  expect(save).toHaveBeenCalledWith(waiting, expect.objectContaining({ snoozedUntil: due }));
});

it("uses the refreshed case version for another live triage decision", () => {
  const page = recoveryViewFixture();
  const save = vi.fn();
  const props = {
    live: true,
    page,
    initialDetail: page.rows[0],
    onRefresh: vi.fn(),
    onPage: vi.fn(),
    onFilterChange: vi.fn(),
    onRetryCommand: vi.fn(),
    onPreview: vi.fn(),
    onConfirm: vi.fn(),
    onSaveTriage: save,
  };
  const view = renderWithInstanceAdminMessages(<OssRecovery {...props} />);
  const updated = { ...page.rows[0], version: page.rows[0].version + 1 };
  view.rerender(<OssRecovery {...props} page={{ ...page, rows: [updated] }} />);
  fireEvent.click(screen.getByRole("button", { name: "Save triage" }));
  expect(save).toHaveBeenCalledWith(updated, expect.any(Object));
});
