import { command } from "@/lib/local-monitor-launch/launch.test-fixture";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonitorRetryPanel } from "./MonitorRetryPanel";
import { renderRecurring } from "./recurring-ui.test-fixture";

const f = vi.hoisted(() => ({ read: vi.fn(), preview: vi.fn(), launch: vi.fn() }));
vi.mock("@/lib/local-monitor-launch/session-actions", () => ({
  readMonitorRetryAction: f.read,
  previewMonitorLaunchAction: f.preview,
  launchMonitorAction: f.launch,
}));
const targetId = command.targetIds[0],
  parentRunId = "lmr_abcdefghijklmnopqrstuvwx";
beforeEach(() => {
  vi.resetAllMocks();
  f.read.mockResolvedValue({
    kind: "ready",
    state: {
      parentRunId,
      parentExpectedCount: 9,
      retry: null,
      rows: [
        {
          targetId,
          keyword: "Dentist",
          ordinal: 8,
          row: 2,
          column: 2,
          latitude: "52.0000000",
          longitude: "21.0000000",
          eligible: true,
          reason: "eligible_rejected",
          status: "rejected",
          financialState: "settled",
        },
        {
          targetId: "lmt_bbcdefghijklmnopqrstuvwx",
          keyword: "Accepted",
          ordinal: 0,
          row: 0,
          column: 0,
          latitude: "52",
          longitude: "21",
          eligible: false,
          reason: "accepted_original",
          status: "accepted",
          financialState: "settled",
        },
        {
          targetId: "lmt_cbcdefghijklmnopqrstuvwx",
          keyword: "Unknown",
          ordinal: 1,
          row: 0,
          column: 1,
          latitude: "52",
          longitude: "21",
          eligible: false,
          reason: "unknown_acceptance",
          status: "unknown_acceptance",
          financialState: "reserved",
        },
      ],
      connections: [{ id: command.connectionId, provider: "dataforseo" }],
    },
  });
  f.preview.mockResolvedValue({
    kind: "ready",
    command: {
      ...command,
      retry: {
        version: 1,
        parentRunId,
        parentExpectedCount: 9,
        targetIds: [targetId],
        sourceHash: "a".repeat(64),
        selectedProofHash: "b".repeat(64),
      },
    },
    expiresAt: "2026-10-13T12:02:00Z",
    expectedCount: 1,
    nativeEstimates: [{ unit: "cents", amount: "0.06" }],
  });
  f.launch.mockResolvedValue({
    kind: "queued",
    receipt: { intent: { id: "lmj_abcdefghijklmnopqrstuvwx" } },
  });
});
afterEach(cleanup);
function mount(canWrite = true) {
  return renderRecurring(
    <MonitorRetryPanel
      projectId={command.projectId}
      monitorId={command.monitorId}
      version={1}
      runId={parentRunId}
      canWrite={canWrite}
    />,
  );
}
describe("real failed-subset retry controls", () => {
  it("reads without any purchase, disables original accepted/unknown and requires explicit selected quote then consent", async () => {
    mount();
    const user = userEvent.setup();
    const rejected = await screen.findByRole("checkbox", { name: /Dentist/ });
    expect(rejected).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Accepted/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Unknown/ })).toBeDisabled();
    expect(f.preview).not.toHaveBeenCalled();
    expect(f.launch).not.toHaveBeenCalled();
    await user.click(rejected);
    await user.click(screen.getByRole("button", { name: "Provider connection" }));
    await user.click(await screen.findByRole("menuitem", { name: "DataForSEO" }));
    await user.click(screen.getByRole("button", { name: "Review run" }));
    const confirm = await screen.findByRole("button", { name: "Confirm paid subset retry" });
    expect(f.preview).toHaveBeenCalledWith(
      expect.objectContaining({ retry: { parentRunId, targetIds: [targetId] } }),
    );
    expect(screen.getByText(/Selected retry: 1 of 9/)).toBeInTheDocument();
    expect(screen.getByText(/0.06/)).toBeInTheDocument();
    expect(f.launch).not.toHaveBeenCalled();
    await user.click(confirm);
    await waitFor(() => expect(f.launch).toHaveBeenCalledTimes(1));
    expect(f.launch.mock.calls[0][0].retry.parentRunId).toBe(parentRunId);
  });
  it("viewer and refresh never obtain a paid action or auto-select targets", async () => {
    mount(false);
    await screen.findByRole("checkbox", { name: /Dentist/ });
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Refresh saved status" }));
    await waitFor(() => expect(f.read).toHaveBeenCalledTimes(2));
    expect(f.preview).not.toHaveBeenCalled();
    expect(f.launch).not.toHaveBeenCalled();
  });
  it("changing selected points invalidates the prior signed price", async () => {
    mount();
    const user = userEvent.setup(),
      box = await screen.findByRole("checkbox", { name: /Dentist/ });
    await user.click(box);
    await user.click(screen.getByRole("button", { name: "Provider connection" }));
    await user.click(await screen.findByRole("menuitem", { name: "DataForSEO" }));
    await user.click(screen.getByRole("button", { name: "Review run" }));
    await screen.findByRole("button", { name: "Confirm paid subset retry" });
    await user.click(box);
    expect(
      screen.queryByRole("button", { name: "Confirm paid subset retry" }),
    ).not.toBeInTheDocument();
    expect(f.launch).not.toHaveBeenCalled();
  });
});
