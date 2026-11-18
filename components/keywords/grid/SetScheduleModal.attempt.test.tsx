import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SetScheduleModal } from "./SetScheduleModal";

const mock = vi.hoisted(() => ({ preview: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/schedules/preview-client", async (original) => ({
  ...(await original<typeof import("@/lib/schedules/preview-client")>()),
  requestScheduleChangePreview: mock.preview,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.preview.mockImplementation(({ change }) =>
    Promise.resolve({
      capacity: null,
      requires_review: change.op === "update" && change.body.kind === "rank-membership",
      review_reasons: ["cost_increase"],
      cost_before_cents: 0,
      cost_after_cents: 700,
      preview_token: "token",
      expected_revision: "1",
      window_start: "2026-10-01T00:00:00.000Z",
    }),
  );
  mock.fetch.mockImplementation(
    async () => new Response(JSON.stringify({ data: { publicId: "sch_empty" } })),
  );
  vi.stubGlobal("fetch", mock.fetch);
});
const props = {
  initialView: "new" as const,
  onClose: vi.fn(),
  onDone: vi.fn(),
  open: true,
  projectId: "prj_story",
  schedules: [],
  selectedRows: [keywordRows[0]],
};
async function cancelAssignment() {
  fireEvent.click(screen.getByRole("button", { name: "Create schedule" }));
  expect(await screen.findByRole("button", { name: "Confirm" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull());
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Create schedule" })).toBeEnabled(),
  );
}
it("retries the same attempt by editing its empty schedule", async () => {
  render(<SetScheduleModal {...props} />);
  await cancelAssignment();
  await cancelAssignment();
  expect(mock.fetch.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
    ["/api/check-schedules", "POST"],
    ["/api/check-schedules/sch_empty", "PATCH"],
  ]);
});
it("starts a fresh create after going Back and choosing New", async () => {
  render(<SetScheduleModal {...props} />);
  await cancelAssignment();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.queryByText(/The empty schedule has been created/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /New schedule/ }));
  await cancelAssignment();
  expect(mock.fetch.mock.calls[1][1].method).toBe("POST");
});
it.each(["reopen", "selection"])("starts a fresh attempt on %s while mounted", async (kind) => {
  const view = render(<SetScheduleModal {...props} />);
  await cancelAssignment();
  if (kind === "reopen") {
    view.rerender(<SetScheduleModal {...props} open={false} />);
    view.rerender(<SetScheduleModal {...props} />);
  } else view.rerender(<SetScheduleModal {...props} selectedRows={[keywordRows[1]]} />);
  expect(screen.queryByText(/The empty schedule has been created/)).toBeNull();
  await cancelAssignment();
  expect(mock.fetch.mock.calls[1][1].method).toBe("POST");
});
