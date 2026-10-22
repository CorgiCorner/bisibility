import { DangerousActionAccessProvider } from "@/components/admin/DangerousActionGate";
import { renderWithInstanceAdminMessages as renderMessages } from "@/i18n/test-support/render-with-feature-messages";
import { recoveryViewFixture } from "@/lib/metering/recovery/view-fixture";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AdminRecoveryConsole } from "./AdminRecoveryConsole";

const actions = vi.hoisted(() => ({
  load: vi.fn(),
  preview: vi.fn(),
  commit: vi.fn(),
  status: vi.fn(),
  triage: vi.fn(),
}));
vi.mock("@/lib/actions/metering-recovery", () => ({
  loadRecoveryPageAction: actions.load,
  previewRecoveryAction: actions.preview,
  commitRecoveryAction: actions.commit,
  getRecoveryCommandAction: actions.status,
  updateRecoveryTriageAction: actions.triage,
}));
beforeEach(() => {
  Object.values(actions).forEach((mock) => {
    mock.mockReset();
  });
  actions.load.mockResolvedValue({ ok: true, value: recoveryViewFixture() });
  actions.preview.mockResolvedValue({
    ok: true,
    value: {
      token: "bound-preview",
      expiresAt: "2099-10-13T10:00:00Z",
      eligible: [{ caseToken: "case-result", action: "restore_result" }],
      excluded: [],
      providerCalls: 0,
      newPaidAttempts: 0,
      originalRuns: 0,
    },
  });
  actions.commit.mockResolvedValue({
    ok: true,
    value: { commandId: "command", state: "queued", outcomes: [] },
  });
  actions.status.mockResolvedValue({
    ok: true,
    value: { commandId: "command", state: "completed", outcomes: [] },
  });
});
it("keeps completed results separate from accounting uncertainty and prevents blind paid retry", () => {
  render(<AdminRecoveryConsole initial={recoveryViewFixture()} />);
  expect(screen.getAllByText("Unknown").length).toBeGreaterThan(1);
  expect(
    screen.getByRole("checkbox", { name: "Select prj_example_history, dataforseo" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("checkbox", { name: "Select prj_example_pending, dataforseo" }),
  ).toBeEnabled();
  expect(screen.queryByRole("button", { name: /retry paid/i })).not.toBeInTheDocument();
});
it("requires the server preview before committing a bounded repair", async () => {
  render(<AdminRecoveryConsole initial={recoveryViewFixture()} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Select prj_example_pending, dataforseo" }));
  fireEvent.click(screen.getByRole("button", { name: "Review selected (1)" }));
  await screen.findByRole("dialog");
  expect(actions.commit).not.toHaveBeenCalled();
  expect(actions.preview).toHaveBeenCalledWith({ caseTokens: ["case-result"] });
  await waitFor(() => expect(screen.getByRole("button", { name: "Start recovery" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Start recovery" }));
  await waitFor(() => expect(actions.commit).toHaveBeenCalledTimes(1));
  expect(actions.commit.mock.lastCall?.[0]).toMatchObject({
    previewToken: "bound-preview",
    commandId: expect.any(String),
  });
});
it("retries an uncertain commit with the same command identity and exposes no raw error", async () => {
  actions.commit.mockRejectedValueOnce(new Error("private bearer secret"));
  render(<AdminRecoveryConsole initial={recoveryViewFixture()} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Select prj_example_pending, dataforseo" }));
  fireEvent.click(screen.getByRole("button", { name: "Review selected (1)" }));
  const button = await screen.findByRole("button", { name: "Start recovery" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() => expect(actions.commit).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() => expect(actions.commit).toHaveBeenCalledTimes(2));
  expect(actions.commit.mock.calls[0][0].commandId).toBe(actions.commit.mock.calls[1][0].commandId);
  expect(screen.queryByText(/private bearer/)).not.toBeInTheDocument();
});
it("caps selection at 25 eligible cases", () => {
  const page = recoveryViewFixture(),
    row = page.rows[1];
  page.rows = Array.from({ length: 26 }, (_, index) => ({
    ...row,
    token: `case-${index}`,
    project: `prj_example_${index}`,
  }));
  render(<AdminRecoveryConsole initial={page} />);
  const boxes = screen.getAllByRole("checkbox");
  boxes.slice(0, 25).forEach((box) => {
    fireEvent.click(box);
  });
  expect(boxes[25]).toBeDisabled();
  expect(screen.getByRole("button", { name: "Review selected (25)" })).toBeEnabled();
});
it("discloses normal provider spending when waking an originally authorized run", async () => {
  actions.preview.mockResolvedValue({
    ok: true,
    value: {
      token: "bound-run",
      expiresAt: "2099-10-13T10:00:00Z",
      eligible: [{ caseToken: "case-run", action: "resume_queued_run" }],
      excluded: [],
      providerCalls: 0,
      newPaidAttempts: 0,
      originalRuns: 1,
      originalExposure: [
        {
          caseToken: "case-run",
          project: "prj_example_queued",
          funding: "byok",
          maxCostCents: "2.0001",
          targets: 1,
          maxAttempts: 1,
        },
      ],
    },
  });
  render(<AdminRecoveryConsole initial={recoveryViewFixture()} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Select prj_example_queued, dataforseo" }));
  fireEvent.click(screen.getByRole("button", { name: "Review selected (1)" }));
  expect(
    await screen.findByText(/Normal provider admission may send paid requests/),
  ).toBeInTheDocument();
  expect(screen.getByText(/Approved maximum: 2\.0001 USD cents/)).toBeInTheDocument();
});
it("does not poll a command rejected before acceptance", async () => {
  actions.commit.mockResolvedValue({ ok: false, code: "case_changed" });
  render(<AdminRecoveryConsole initial={recoveryViewFixture()} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Select prj_example_pending, dataforseo" }));
  fireEvent.click(screen.getByRole("button", { name: "Review selected (1)" }));
  const button = await screen.findByRole("button", { name: "Start recovery" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await screen.findByRole("alert");
  expect(actions.status).not.toHaveBeenCalled();
});

function render(ui: Parameters<typeof renderMessages>[0]) {
  return renderMessages(
    <DangerousActionAccessProvider allowed>{ui}</DangerousActionAccessProvider>,
  );
}
