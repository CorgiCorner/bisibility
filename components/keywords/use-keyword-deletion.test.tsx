import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useKeywordDeletion } from "./use-keyword-deletion";

const mocks = vi.hoisted(() => ({ preview: vi.fn(), action: vi.fn(), done: vi.fn() }));
vi.mock("@/lib/actions/keyword-delete-impact", () => ({ previewKeywordDeletion: mocks.preview }));
const impact = {
  keywordCount: 1,
  targetCount: 1,
  runningTargetCount: 0,
  schedules: [{ publicId: "sch_daily", name: "Daily", removedTargets: 1, remainingTargets: 0 }],
};
function Harness() {
  const deletion = useKeywordDeletion({
    action: mocks.action,
    onDeleted: mocks.done,
    projectId: "prj_1",
  });
  return (
    <>
      <button type="button" onClick={() => void deletion.open(["kw_one"])}>
        Open one
      </button>
      <button type="button" onClick={() => void deletion.open(["kw_two"])}>
        Open two
      </button>
      {deletion.modal}
    </>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.action.mockResolvedValue({ deleted: 1 });
  mocks.preview.mockResolvedValue(impact);
});
describe("keyword deletion confirmation", () => {
  it("waits for authoritative impact and explains the last-member outcome before deleting", async () => {
    let resolve!: (value: typeof impact) => void;
    mocks.preview.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<Harness />);
    fireEvent.click(screen.getByText("Open one"));
    expect(screen.getByRole("button", { name: "Delete keyword" })).toBeDisabled();
    await act(async () => resolve(impact));
    expect(screen.getByText(/Becomes empty/)).toBeVisible();
    expect(screen.getByText(/Schedules and their settings are kept/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Delete keyword" }));
    await waitFor(() => expect(mocks.done).toHaveBeenCalledOnce());
    expect(mocks.action).toHaveBeenCalledWith({ keywordIds: ["kw_one"], projectId: "prj_1" });
  });
  it("blocks deletion when the preview fails and allows retry", async () => {
    mocks.preview.mockRejectedValueOnce(new Error("offline"));
    render(<Harness />);
    fireEvent.click(screen.getByText("Open one"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load");
    expect(screen.getByRole("button", { name: "Delete keyword" })).toBeDisabled();
    expect(mocks.action).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete keyword" })).toBeEnabled(),
    );
  });
  it("ignores a stale preview after the dialog is closed and reopened for a different target", async () => {
    let resolve!: (value: typeof impact) => void;
    mocks.preview.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<Harness />);
    fireEvent.click(screen.getByText("Open one"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByText("Open two"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete keyword" })).toBeEnabled(),
    );
    await act(async () =>
      resolve({ ...impact, schedules: [{ ...impact.schedules[0], name: "Stale" }] }),
    );
    expect(screen.queryByText("Stale")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete keyword" }));
    await waitFor(() =>
      expect(mocks.action).toHaveBeenCalledWith({ keywordIds: ["kw_two"], projectId: "prj_1" }),
    );
  });
  it("explains an in-flight check and enables deletion after a fresh preview confirms completion", async () => {
    mocks.preview.mockResolvedValueOnce({ ...impact, runningTargetCount: 1 });
    render(<Harness />);
    fireEvent.click(screen.getByText("Open one"));
    expect(await screen.findByRole("alert")).toHaveTextContent("still being checked");
    expect(screen.getByRole("button", { name: "Delete keyword" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete keyword" })).toBeEnabled(),
    );
    expect(mocks.action).not.toHaveBeenCalled();
  });

  it("keeps an already deleted selection disabled", async () => {
    mocks.preview.mockResolvedValue({
      keywordCount: 0,
      targetCount: 0,
      runningTargetCount: 0,
      schedules: [],
    });
    render(<Harness />);
    fireEvent.click(screen.getByText("Open one"));
    await screen.findByText("No schedules are connected to the selected targets.");
    expect(screen.getByRole("button", { name: "Delete keyword" })).toBeDisabled();
  });
});
