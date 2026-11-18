import { renderWithSharedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { ScheduleChangePreview } from "@/lib/schedules/preview";
import { SchedulePreviewRequestError } from "@/lib/schedules/preview-client";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ScheduleReviewCancelled, useScheduleSpendReview } from "./useScheduleSpendReview";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  submit: vi.fn(),
  done: vi.fn(),
  failed: vi.fn(),
}));
vi.mock("@/lib/schedules/preview-client", async (original) => ({
  ...(await original<typeof import("@/lib/schedules/preview-client")>()),
  requestScheduleChangePreview: mocks.preview,
}));
const preview: ScheduleChangePreview = {
  capacity: null,
  requires_review: true,
  review_reasons: ["cost_increase"],
  cost_before_cents: 100,
  cost_after_cents: 700,
  preview_token: "token",
  expected_revision: "1",
  window_start: "2026-10-01T00:00:00.000Z",
};
function Harness() {
  const review = useScheduleSpendReview("project");
  return (
    <>
      <button
        type="button"
        onClick={() =>
          void review
            .run({ op: "delete", id: "schedule" }, mocks.submit)
            .then(mocks.done)
            .catch(mocks.failed)
        }
      >
        Save
      </button>
      {review.dialog}
    </>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockResolvedValue(preview);
  mocks.submit.mockResolvedValue({ saved: true });
});
it("previews and saves without a dialog when no review is needed", async () => {
  mocks.preview.mockResolvedValue({ ...preview, requires_review: false, preview_token: null });
  render(<Harness />);
  fireEvent.click(screen.getByText("Save"));
  await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith());
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(mocks.preview).toHaveBeenCalledWith({
    projectId: "project",
    change: { op: "delete", id: "schedule" },
  });
});
it("confirms a preview and blocks a double click while the write is pending", async () => {
  let finish: (value: object) => void = () => {};
  mocks.submit.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<Harness />);
  fireEvent.click(screen.getByText("Save"));
  const confirm = await screen.findByRole("button", { name: "Confirm" });
  expect(screen.getByText("$1.00")).toBeVisible();
  expect(screen.getByText("$7.00")).toBeVisible();
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(mocks.submit).toHaveBeenCalledOnce();
  expect(confirm).toBeDisabled();
  expect(mocks.submit).toHaveBeenCalledWith({
    preview_token: "token",
    expected_revision: "1",
    window_start: preview.window_start,
  });
  finish({ saved: true });
  await waitFor(() => expect(mocks.done).toHaveBeenCalledOnce());
});
it("cancels without a mutation", async () => {
  render(<Harness />);
  fireEvent.click(screen.getByText("Save"));
  fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
  await waitFor(() =>
    expect(mocks.failed).toHaveBeenCalledWith(expect.any(ScheduleReviewCancelled)),
  );
  expect(mocks.submit).not.toHaveBeenCalled();
});
it.each(["schedule_review_stale", "schedule_review_required"])(
  "requires a new explicit confirmation after %s",
  async (code) => {
    mocks.submit
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code,
          status: code.endsWith("stale") ? 409 : 428,
          message: "Changed",
          preview: { ...preview, preview_token: "fresh", cost_after_cents: 1400 },
        },
      })
      .mockResolvedValueOnce({ saved: true });
    render(<Harness />);
    fireEvent.click(screen.getByText("Save"));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("status")).toHaveTextContent("The cost changed.");
    expect(screen.getByText("$14.00")).toBeVisible();
    expect(mocks.submit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(mocks.done).toHaveBeenCalledOnce());
    expect(mocks.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ preview_token: "fresh" }),
    );
  },
);
it("shows a race preview even when the initial preview required no review", async () => {
  mocks.preview.mockResolvedValue({ ...preview, requires_review: false });
  mocks.submit.mockRejectedValueOnce(
    Object.assign(new Error("Changed"), { code: "schedule_review_required", preview }),
  );
  render(<Harness />);
  fireEvent.click(screen.getByText("Save"));
  expect(await screen.findByRole("dialog")).toBeVisible();
  expect(mocks.submit).toHaveBeenCalledOnce();
});
it("shows the capacity warning alongside review reasons", async () => {
  mocks.preview.mockResolvedValue({
    ...preview,
    capacity: {
      exceeded: true,
      dimensions: { scheduledKeywords: { limit: 100, projected: 101, exceeded: true } },
    },
  });
  render(<Harness />);
  fireEvent.click(screen.getByText("Save"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Scheduled keywords: projected 101, limit 100.",
  );
  expect(screen.getByText("The estimated recurring cost increases.")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "This change goes over your plan limit. If you confirm, the save is refused unless your plan allows it.",
  );
});

it("localizes an unavailable preview without submitting", async () => {
  mocks.preview.mockRejectedValue(new SchedulePreviewRequestError());
  render(<Harness />);
  fireEvent.click(screen.getByText("Save"));
  await waitFor(() =>
    expect(mocks.failed).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Could not preview this change. Try again." }),
    ),
  );
  expect(mocks.submit).not.toHaveBeenCalled();
});

it("keeps run stable through rerenders and reads the latest project", async () => {
  const runs: ReturnType<typeof useScheduleSpendReview>["run"][] = [];
  function Capture({ projectId }: { projectId: string }) {
    const review = useScheduleSpendReview(projectId);
    runs.push(review.run);
    return (
      <button
        type="button"
        onClick={() => void review.run({ op: "delete", id: "sch_story" }, mocks.submit)}
      >
        Run
      </button>
    );
  }
  mocks.preview.mockResolvedValue({ ...preview, requires_review: false });
  const view = render(<Capture projectId="prj_first" />);
  view.rerender(<Capture projectId="prj_second" />);
  expect(runs[1]).toBe(runs[0]);
  fireEvent.click(screen.getByText("Run"));
  await waitFor(() =>
    expect(mocks.preview).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "prj_second" }),
    ),
  );
});

it("allows independent no-review writes and retains exclusive ownership for two late refusals", async () => {
  const refuse: Array<(value: unknown) => void> = [];
  mocks.preview.mockResolvedValue({ ...preview, requires_review: false, preview_token: null });
  mocks.submit.mockImplementation(() => new Promise((resolve) => refuse.push(resolve)));
  render(<Harness />);
  fireEvent.click(screen.getByText("Save"));
  await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByText("Save"));
  await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(2));
  const failure = {
    ok: false,
    error: { code: "schedule_review_required", status: 428, message: "Changed", preview },
  };
  await act(async () => {
    refuse[0](failure);
  });
  expect(await screen.findByRole("dialog")).toBeVisible();
  await act(async () => {
    refuse[1]({
      ...failure,
      error: { ...failure.error, preview: { ...preview, cost_after_cents: 1400 } },
    });
  });
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(screen.getByText("$7.00")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(await screen.findByText("$14.00")).toBeVisible();
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(mocks.failed).toHaveBeenCalledTimes(2));
  expect(mocks.submit).toHaveBeenCalledTimes(2);
});
