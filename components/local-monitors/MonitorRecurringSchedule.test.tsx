import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonitorRecurringSchedule } from "./MonitorRecurringSchedule";
import { recurringUiPreview, recurringUiState, renderRecurring } from "./recurring-ui.test-fixture";

const m = vi.hoisted(() => ({
  read: vi.fn(),
  preview: vi.fn(),
  approve: vi.fn(),
  pause: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/local-monitor-recurring/session-actions", () => ({
  readRecurringMonitorAction: m.read,
  previewRecurringMonitorAction: m.preview,
  approveRecurringMonitorAction: m.approve,
  pauseRecurringMonitorAction: m.pause,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
beforeEach(() => {
  vi.resetAllMocks();
  m.read.mockResolvedValue(recurringUiState);
  m.preview.mockResolvedValue(recurringUiPreview());
  m.approve.mockResolvedValue({ kind: "saved" });
});
afterEach(cleanup);
async function reviewForm(total = "100") {
  const user = userEvent.setup();
  await screen.findByRole("button", { name: "Calendar" });
  await user.click(screen.getByRole("button", { name: "Calendar" }));
  await user.click(await screen.findByRole("menuitem", { name: /Owned calendar/ }));
  await user.click(screen.getByRole("button", { name: "Own-key connection" }));
  await user.click(await screen.findByRole("menuitem", { name: /dataforseo/ }));
  fireEvent.change(screen.getByLabelText("Maximum per measurement (USD)"), {
    target: { value: "1" },
  });
  fireEvent.change(screen.getByLabelText("Total issuance ceiling (USD)"), {
    target: { value: total },
  });
  fireEvent.change(screen.getByLabelText("Maximum number of measurements"), {
    target: { value: "2" },
  });
  fireEvent.change(screen.getByLabelText("Approval end (your local time)"), {
    target: { value: "2026-11-01T00:00" },
  });
  await user.click(screen.getByRole("button", { name: "Review recurring approval" }));
  await screen.findByRole("button", { name: "Approve recurring measurements" });
  return user;
}
describe("reviewed recurring authority", () => {
  it("locks a reviewed100 draft; changing to1 requires cancel and a new signed review", async () => {
    renderRecurring(
      <MonitorRecurringSchedule
        projectId="prj_abcdefghijklmnopqrstuvwx"
        monitorId="lmn_abcdefghijklmnopqrstuvwx"
        version={1}
        canWrite
      />,
    );
    const user = await reviewForm();
    const total = screen.getByLabelText("Total issuance ceiling (USD)");
    expect(total).toBeDisabled();
    await user.type(total, "1");
    expect(total).toHaveValue("100");
    expect(m.approve).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("button", { name: "Approve recurring measurements" }),
    ).not.toBeInTheDocument();
    expect(total).toBeEnabled();
    fireEvent.change(total, { target: { value: "1" } });
    m.preview.mockResolvedValue(
      recurringUiPreview({ maximumTotalCents: "100", consentToken: "new-reviewed-one" }),
    );
    await user.click(screen.getByRole("button", { name: "Review recurring approval" }));
    await screen.findByRole("button", { name: "Approve recurring measurements" });
    expect(m.preview.mock.calls[1][0]).toMatchObject({ maximumTotalCents: "100" });
    await user.click(screen.getByRole("button", { name: "Approve recurring measurements" }));
    await waitFor(() =>
      expect(m.approve).toHaveBeenCalledWith(
        expect.objectContaining({ maximumTotalCents: "100", consentToken: "new-reviewed-one" }),
      ),
    );
  });
  it("discloses the immutable per-run,total,count,expiry and fractional exact quote", async () => {
    renderRecurring(
      <MonitorRecurringSchedule
        projectId="prj_abcdefghijklmnopqrstuvwx"
        monitorId="lmn_abcdefghijklmnopqrstuvwx"
        version={1}
        canWrite
      />,
    );
    await reviewForm();
    const reviewed = within(screen.getByRole("region", { name: "Review recurring approval" }));
    for (const [name, value] of [
      ["Maximum per measurement (USD)", "USD 1"],
      ["Total issuance ceiling (USD)", "USD 100"],
      ["Maximum number of measurements", "2"],
      ["Current exact quote", "USD 0.0006"],
    ]) {
      expect(reviewed.getByText(name, { selector: "dt" }).nextElementSibling).toHaveTextContent(
        value,
      );
    }
    expect(
      reviewed.getByText("Approval ends", { selector: "dt" }).nextElementSibling,
    ).toHaveTextContent("Nov 1, 2026");
    expect(screen.getByRole("button", { name: "Calendar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Own-key connection" })).toBeDisabled();
  });
  it("renders named real MenuSelect controls with explicit empty choices and no paid action", async () => {
    renderRecurring(
      <MonitorRecurringSchedule
        projectId="prj_abcdefghijklmnopqrstuvwx"
        monitorId="lmn_abcdefghijklmnopqrstuvwx"
        version={1}
        canWrite
      />,
    );
    const calendar = await screen.findByRole("button", { name: "Calendar" });
    expect(calendar).toHaveTextContent("Choose an existing calendar");
    expect(screen.getByRole("button", { name: "Own-key connection" })).toHaveTextContent(
      "Choose a connection",
    );
    calendar.focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(await screen.findByRole("menuitem", { name: /Owned calendar/ })).toBeInTheDocument();
    expect(m.preview).not.toHaveBeenCalled();
    expect(m.approve).not.toHaveBeenCalled();
    expect(m.pause).not.toHaveBeenCalled();
  });
});
